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
  STEPS,
  toggleMute,
  toggleSolo,
  toggleStep,
  type PatternId,
  type SeqState,
} from './pattern'

export interface SequencerOptions {
  /** The audio clock in seconds. */
  clock: () => number
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

export class Sequencer {
  private state: SeqState
  private readonly listeners = new Set<() => void>()
  private readonly scheduler: Scheduler
  private readonly play: (pad: number, time: number) => void
  // Steps scheduled but maybe not yet heard, oldest first, for the playhead.
  private scheduled: Scheduled[] = []

  constructor(options: SequencerOptions) {
    this.state = options.initial ?? initialState()
    this.play = options.play
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
    this.set({ ...this.state, playing: true })
    this.scheduler.start()
  }

  /** Stops scheduling (hits already queued in the next lookahead still sound). */
  stop() {
    if (!this.state.playing) return
    this.scheduler.stop()
    this.scheduled = []
    const { queued } = this.state
    this.set({ ...this.state, playing: false, pattern: queued ?? this.state.pattern, queued: null })
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
  }
}
