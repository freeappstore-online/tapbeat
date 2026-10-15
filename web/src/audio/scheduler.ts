// A lookahead step scheduler. A coarse JS timer wakes every `interval` ms and
// schedules every step that falls within the next `lookahead` seconds on the
// audio clock, so timing comes from the audio hardware, not the main thread.
// A janky frame or a slow timer can't make the beat drift or stutter.

export interface Timer {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const intervalTimer: Timer = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
}

export interface SchedulerOptions {
  /** The audio clock in seconds, usually `() => ctx.currentTime`. */
  clock: () => number
  /** Called once per step with the exact audio time to play it at. */
  onStep: (step: number, time: number) => void
  bpm?: number
  /** 0–0.5: how far off-beat steps are pushed late, as a fraction of a step. */
  swing?: number
  steps?: number
  /** Steps per beat; 4 makes each step a sixteenth note. */
  stepsPerBeat?: number
  /** How far ahead to schedule, in seconds. */
  lookahead?: number
  /** How often the timer wakes, in milliseconds. */
  interval?: number
  timer?: Timer
}

export const MIN_BPM = 60
export const MAX_BPM = 180
export const MAX_SWING = 0.5

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export class Scheduler {
  private bpmValue: number
  private swingValue: number
  private readonly steps: number
  private readonly stepsPerBeat: number
  private readonly lookahead: number
  private readonly interval: number
  private readonly timer: Timer
  private readonly clock: () => number
  private readonly onStep: (step: number, time: number) => void
  private handle: unknown = null
  private step = 0
  // The next step's time on the straight (unswung) grid.
  private nextTime = 0

  constructor(options: SchedulerOptions) {
    this.clock = options.clock
    this.onStep = options.onStep
    this.bpmValue = clamp(options.bpm ?? 120, MIN_BPM, MAX_BPM)
    this.swingValue = clamp(options.swing ?? 0, 0, MAX_SWING)
    this.steps = options.steps ?? 16
    this.stepsPerBeat = options.stepsPerBeat ?? 4
    this.lookahead = options.lookahead ?? 0.1
    this.interval = options.interval ?? 25
    this.timer = options.timer ?? intervalTimer
  }

  get playing(): boolean {
    return this.handle !== null
  }

  get bpm(): number {
    return this.bpmValue
  }

  /** Takes effect from the next unscheduled step. */
  set bpm(value: number) {
    this.bpmValue = clamp(value, MIN_BPM, MAX_BPM)
  }

  get swing(): number {
    return this.swingValue
  }

  set swing(value: number) {
    this.swingValue = clamp(value, 0, MAX_SWING)
  }

  /** Length of one step in seconds at the current tempo. */
  get stepDuration(): number {
    return 60 / this.bpmValue / this.stepsPerBeat
  }

  /** Starts from step 0, `delay` seconds from now (a little headroom avoids a late first hit). */
  start(delay = 0.05) {
    if (this.playing) return
    this.step = 0
    this.nextTime = this.clock() + delay
    this.tick()
    this.handle = this.timer.set(() => this.tick(), this.interval)
  }

  stop() {
    if (this.handle === null) return
    this.timer.clear(this.handle)
    this.handle = null
  }

  /** Schedules every step due before now + lookahead. Called by the timer. */
  tick() {
    const now = this.clock()
    // If the timer was starved (a background tab), skip the steps that are
    // already late instead of firing them all at once, staying on the grid.
    while (this.nextTime < now) this.advance()
    while (this.nextTime < now + this.lookahead) {
      const offBeat = this.step % 2 === 1
      this.onStep(this.step, this.nextTime + (offBeat ? this.swingValue * this.stepDuration : 0))
      this.advance()
    }
  }

  private advance() {
    this.nextTime += this.stepDuration
    this.step = (this.step + 1) % this.steps
  }
}
