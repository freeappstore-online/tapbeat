// The step sequencer: owns the pattern state and drives the lookahead
// Scheduler, which places every hit on the audio clock ahead of time. The
// playhead is derived from the same scheduled times, so it lines up with what
// is heard rather than with when the timer happened to fire.

import { Scheduler, type Timer } from '../audio/scheduler'
import {
  clampBpm,
  clampSwing,
  clearPattern,
  hitsAt,
  initialState,
  isAudible,
  STEPS,
  toggleMute,
  toggleSolo,
  toggleStep,
  type PatternId,
  type SeqState,
} from './pattern'
import { makeTake, takeHitsInStep, type TakeHit } from './recorder'

export interface SequencerOptions {
  /** The audio clock in seconds. */
  clock: () => number
  /**
   * The audio time being heard (clock minus output latency). Live hits are
   * placed on the grid at this time: the beat the player is tapping along to.
   * Defaults to `clock`.
   */
  heard?: () => number
  /** Plays a pad at an exact time on that clock. */
  play: (pad: number, time: number) => void
  timer?: Timer
  /** Seconds scheduled ahead. Longer survives a busier main thread; shorter reacts faster to edits. */
  lookahead?: number
  initial?: SeqState
}

interface Scheduled {
  step: number
  time: number
}

// Where a scheduled step sits on the straight (unswung) grid: the Nth step
// since Play, its time, and the step length at the tempo then.
interface Anchor {
  abs: number
  time: number
  dur: number
}

const MAX_ANCHORS = 64

export class Sequencer {
  private state: SeqState
  private readonly listeners = new Set<() => void>()
  private readonly scheduler: Scheduler
  private readonly play: (pad: number, time: number) => void
  // Steps scheduled but maybe not yet heard, oldest first, for the playhead.
  private scheduled: Scheduled[] = []
  private readonly heard: () => number
  // Steps scheduled since Play, and recent anchors for placing live hits.
  private abs = 0
  private anchors: Anchor[] = []
  // The step (since Play) where the current or last take starts.
  private takeOrigin = 0
  private recorded: TakeHit[] = []

  constructor(options: SequencerOptions) {
    this.state = options.initial ?? initialState()
    this.play = options.play
    this.heard = options.heard ?? options.clock
    this.scheduler = new Scheduler({
      clock: options.clock,
      onStep: (step, time) => this.onStep(step, time),
      bpm: this.state.bpm,
      swing: this.state.swing,
      steps: STEPS,
      lookahead: options.lookahead ?? 0.15,
      timer: options.timer,
    })
  }

  // For useSyncExternalStore: a stable snapshot getter and subscribe.
  getState = (): SeqState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: SeqState) {
    if (next === this.state) return
    this.state = next
    this.scheduler.bpm = next.bpm
    this.scheduler.swing = next.swing
    for (const listener of this.listeners) listener()
  }

  start() {
    if (this.state.playing) return
    this.scheduled = []
    this.anchors = []
    this.abs = 0
    this.takeOrigin = 0
    this.set({ ...this.state, playing: true })
    this.scheduler.start()
  }

  /** Stops scheduling (hits already queued in the next lookahead still sound). Ends a recording. */
  stop() {
    if (!this.state.playing) return
    const take = this.state.recording ? this.finishTake() : this.state.take
    this.scheduler.stop()
    this.scheduled = []
    const { queued } = this.state
    this.set({ ...this.state, playing: false, recording: false, take, pattern: queued ?? this.state.pattern, queued: null })
  }

  /**
   * Starts or ends recording. Starting from stopped also starts playback; the
   * take begins at the bar line of the bar being heard, so hits keep their
   * place in the bar. Ending keeps the new take (if anything was played).
   */
  toggleRecord() {
    if (this.state.recording) {
      this.set({ ...this.state, recording: false, take: this.finishTake() })
      return
    }
    if (!this.state.playing) this.start()
    const heard = this.positionAt(this.heard())
    this.takeOrigin = Math.max(0, Math.floor(heard / STEPS) * STEPS)
    this.recorded = []
    this.set({ ...this.state, recording: true })
  }

  /** A live pad hit, just played. Kept in the take while recording. */
  recordHit(pad: number) {
    if (!this.state.recording) return
    this.recorded.push({ pad, step: this.positionAt(this.heard()) - this.takeOrigin })
  }

  clearTake() {
    if (this.state.recording) this.recorded = []
    else this.set({ ...this.state, take: null })
  }

  private finishTake() {
    const end = this.positionAt(this.heard()) - this.takeOrigin
    return makeTake(this.recorded, end) ?? this.state.take
  }

  /** Audio time to a position on the straight step grid, in steps since Play. */
  private positionAt(time: number): number {
    let anchor = this.anchors[0]
    if (!anchor) return 0
    for (const a of this.anchors) {
      if (a.time > time) break
      anchor = a
    }
    return anchor.abs + (time - anchor.time) / anchor.dur
  }

  /**
   * Switches pattern. Stopped, it switches at once; playing, it waits for the
   * next bar line so the beat never breaks. Picking the playing pattern again
   * cancels a pending switch.
   */
  selectPattern(id: PatternId) {
    const { playing, pattern } = this.state
    if (!playing) this.set({ ...this.state, pattern: id, queued: null })
    else this.set({ ...this.state, queued: id === pattern ? null : id })
  }

  toggleStep(pad: number, step: number) {
    this.set(toggleStep(this.state, pad, step))
  }

  clear() {
    this.set(clearPattern(this.state))
  }

  toggleMute(pad: number) {
    this.set(toggleMute(this.state, pad))
  }

  toggleSolo(pad: number) {
    this.set(toggleSolo(this.state, pad))
  }

  setBpm(bpm: number) {
    this.set({ ...this.state, bpm: clampBpm(bpm) })
  }

  setSwing(swing: number) {
    this.set({ ...this.state, swing: clampSwing(swing) })
  }

  /** The step being heard at audio time `now`, or -1 when stopped or not started yet. */
  playheadAt(now: number): number {
    if (!this.state.playing) return -1
    // Drop entries that a later, already-reached step has superseded.
    while (this.scheduled.length > 1 && this.scheduled[1].time <= now) this.scheduled.shift()
    const current = this.scheduled[0]
    return current && current.time <= now ? current.step : -1
  }

  private onStep(step: number, time: number) {
    // The bar line: a queued pattern takes over exactly on step 1.
    if (step === 0 && this.state.queued) {
      this.set({ ...this.state, pattern: this.state.queued, queued: null })
    }
    for (const pad of hitsAt(this.state, step)) this.play(pad, time)
    this.scheduled.push({ step, time })

    const dur = this.scheduler.stepDuration
    const straight = time - (step % 2 === 1 ? this.state.swing * dur : 0)
    this.anchors.push({ abs: this.abs, time: straight, dur })
    if (this.anchors.length > MAX_ANCHORS) this.anchors.shift()

    // The take loops along, played as recorded (on the straight grid, since
    // the player's own feel is in it). Not while a new take is being made.
    const { take } = this.state
    if (take && !this.state.recording) {
      for (const { pad, offset } of takeHitsInStep(take, this.abs - this.takeOrigin)) {
        if (isAudible(this.state, pad)) this.play(pad, straight + offset * dur)
      }
    }
    this.abs++
  }
}
