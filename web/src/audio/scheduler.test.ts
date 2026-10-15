import { describe, expect, it } from 'vitest'
import { MAX_BPM, MIN_BPM, Scheduler, type Timer } from './scheduler'

// A fake clock and timer so the test drives time by hand.
function setup(options: { bpm?: number; swing?: number } = {}) {
  let now = 0
  const steps: [number, number][] = []
  let callback: (() => void) | null = null
  const timer: Timer = {
    set: (fn) => {
      callback = fn
      return 1
    },
    clear: () => {
      callback = null
    },
  }
  const scheduler = new Scheduler({
    clock: () => now,
    onStep: (step, time) => steps.push([step, time]),
    timer,
    lookahead: 0.1,
    ...options,
  })
  return {
    scheduler,
    steps,
    // Advance the clock in timer-sized ticks, as the real interval would.
    advance(seconds: number, tick = 0.025) {
      for (let t = 0; t < seconds - 1e-9; t += tick) {
        now += tick
        callback?.()
      }
    },
    jump(seconds: number) {
      now += seconds
      callback?.()
    },
    get timerRunning() {
      return callback !== null
    },
  }
}

describe('Scheduler', () => {
  it('schedules sixteenth notes ahead of the clock at the tempo', () => {
    const { scheduler, steps, advance } = setup({ bpm: 120 })
    scheduler.start(0.05)
    expect(scheduler.stepDuration).toBeCloseTo(0.125)
    // Before any timer tick, the first step is already queued ahead of time.
    expect(steps[0]).toEqual([0, 0.05])
    advance(1)
    for (const [i, [step, time]] of steps.entries()) {
      expect(step).toBe(i % 16)
      expect(time).toBeCloseTo(0.05 + i * 0.125)
    }
    // Never more than the lookahead beyond the clock.
    expect(steps.at(-1)![1]).toBeLessThan(1 + 0.1)
    expect(steps.at(-1)![1]).toBeGreaterThan(1 + 0.1 - 0.125)
  })

  it('wraps after 16 steps', () => {
    const { scheduler, steps, advance } = setup({ bpm: 180 })
    scheduler.start()
    advance(2)
    expect(steps.map(([step]) => step).slice(0, 18)).toEqual([...Array(16).keys(), 0, 1])
  })

  it('schedules each step exactly once', () => {
    const { scheduler, steps, advance } = setup()
    scheduler.start()
    advance(3, 0.007)
    const times = steps.map(([, time]) => time)
    expect(new Set(times).size).toBe(times.length)
  })

  it('pushes off-beat steps late by the swing amount', () => {
    const { scheduler, steps, advance } = setup({ bpm: 120, swing: 0.25 })
    scheduler.start(0)
    advance(0.5)
    const d = scheduler.stepDuration
    expect(steps[0][1]).toBeCloseTo(0)
    expect(steps[1][1]).toBeCloseTo(d + 0.25 * d)
    expect(steps[2][1]).toBeCloseTo(2 * d)
    expect(steps[3][1]).toBeCloseTo(3 * d + 0.25 * d)
  })

  it('applies a tempo change from the next step', () => {
    const { scheduler, steps, advance } = setup({ bpm: 120 })
    scheduler.start(0)
    advance(0.5)
    const count = steps.length
    const last = steps.at(-1)![1]
    scheduler.bpm = 60
    advance(1)
    expect(steps[count][1] - last).toBeCloseTo(0.125)
    expect(steps[count + 1][1] - steps[count][1]).toBeCloseTo(0.25)
  })

  it('clamps tempo and swing', () => {
    const { scheduler } = setup({ bpm: 400, swing: 2 })
    expect(scheduler.bpm).toBe(MAX_BPM)
    expect(scheduler.swing).toBe(0.5)
    scheduler.bpm = 10
    scheduler.swing = -1
    expect(scheduler.bpm).toBe(MIN_BPM)
    expect(scheduler.swing).toBe(0)
  })

  it('skips steps that are already late instead of bursting them', () => {
    const { scheduler, steps, advance, jump } = setup({ bpm: 120 })
    scheduler.start(0)
    advance(0.2)
    const before = steps.length
    jump(5) // the tab was in the background for 5 s
    const burst = steps.slice(before)
    expect(burst.length).toBeLessThanOrEqual(1)
    for (const [, time] of burst) expect(time).toBeGreaterThanOrEqual(5.2 - 1e-9)
    // Still on the original grid.
    for (const [step, time] of steps) expect((time / 0.125) % 16).toBeCloseTo(step)
  })

  it('stops scheduling when stopped and restarts from step 0', () => {
    const { scheduler, steps, advance, timerRunning } = setup()
    scheduler.start()
    advance(0.5)
    scheduler.stop()
    expect(scheduler.playing).toBe(false)
    expect(timerRunning).toBe(false)
    const count = steps.length
    advance(1)
    expect(steps.length).toBe(count)
    scheduler.start()
    expect(steps[count][0]).toBe(0)
  })
})
