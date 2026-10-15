import { describe, expect, it } from 'vitest'
import type { Timer } from '../audio/scheduler'
import { emptyGrid, initialState, type SeqState } from './pattern'
import { Sequencer } from './sequencer'

// A hand-driven audio clock and timer.
function setup(initial: Partial<SeqState> = {}) {
  let now = 0
  let tick: (() => void) | null = null
  const timer: Timer = {
    set: (fn) => {
      tick = fn
      return 1
    },
    clear: () => {
      tick = null
    },
  }
  const hits: { pad: number; time: number }[] = []
  const sequencer = new Sequencer({
    clock: () => now,
    play: (pad, time) => hits.push({ pad, time }),
    timer,
    lookahead: 0.1,
    initial: { ...initialState(), ...initial },
  })
  return {
    sequencer,
    hits,
    advance(seconds: number, step = 0.025) {
      for (let t = 0; t < seconds - 1e-9; t += step) {
        now += step
        tick?.()
      }
    },
    get now() {
      return now
    },
  }
}

/** A grid where `pad` plays on every step. */
function everyStep(pad: number) {
  return emptyGrid().map((row, p) => row.map(() => p === pad))
}

describe('Sequencer timing', () => {
  // Start delay of the Scheduler: the first step lands 50 ms after Play.
  const START = 0.05

  for (const { bpm, swing } of [
    { bpm: 60, swing: 0 },
    { bpm: 60, swing: 0.5 },
    { bpm: 60, swing: 0.25 },
    { bpm: 180, swing: 0 },
    { bpm: 180, swing: 0.5 },
    { bpm: 180, swing: 0.25 },
  ]) {
    it(`places every step on the grid at ${bpm} BPM with swing ${swing}`, () => {
      const { sequencer, hits, advance } = setup({ bpm, swing, patterns: { A: everyStep(0), B: emptyGrid() } })
      const step = 60 / bpm / 4
      sequencer.start()
      advance(step * 32) // two bars
      expect(hits.length).toBeGreaterThanOrEqual(32)
      hits.forEach(({ time }, i) => {
        const late = i % 2 === 1 ? swing * step : 0
        expect(time).toBeCloseTo(START + i * step + late, 9)
      })
    })
  }

  it('changes tempo and swing live, from the next step', () => {
    const { sequencer, hits, advance } = setup({ bpm: 60, patterns: { A: everyStep(0), B: emptyGrid() } })
    sequencer.start()
    advance(1)
    const n = hits.length
    sequencer.setBpm(180)
    sequencer.setSwing(0.5)
    advance(1)
    const fast = 60 / 180 / 4
    // Steps from here on are 1/12 s apart on the straight grid.
    const straight = hits.slice(n).map(({ time }, i) => time - ((n + i) % 2 === 1 ? 0.5 * fast : 0))
    for (let i = 1; i < straight.length; i++) expect(straight[i] - straight[i - 1]).toBeCloseTo(fast, 9)
  })

  it('plays only audible pads', () => {
    const { sequencer, hits, advance } = setup()
    sequencer.toggleMute(3) // the hats
    sequencer.start()
    advance(2.4) // one bar at 100 BPM
    expect(new Set(hits.map((h) => h.pad))).toEqual(new Set([0, 1]))
  })

  it('reacts to step edits while playing', () => {
    const { sequencer, hits, advance } = setup({ patterns: { A: emptyGrid(), B: emptyGrid() } })
    sequencer.start()
    advance(0.5)
    expect(hits).toEqual([])
    sequencer.toggleStep(7, 15)
    sequencer.toggleStep(7, 0)
    advance(3)
    expect(hits.map((h) => h.pad)).toContain(7)
  })
})

describe('Sequencer patterns A/B', () => {
  it('switches at once when stopped', () => {
    const { sequencer } = setup()
    sequencer.selectPattern('B')
    expect(sequencer.getState()).toMatchObject({ pattern: 'B', queued: null })
  })

  it('switches seamlessly at the bar line while playing', () => {
    const A = everyStep(0)
    const B = everyStep(1)
    const { sequencer, hits, advance } = setup({ bpm: 120, patterns: { A, B } })
    const step = 60 / 120 / 4
    sequencer.start()
    advance(0.6) // into the first bar
    sequencer.selectPattern('B')
    expect(sequencer.getState()).toMatchObject({ pattern: 'A', queued: 'B' })
    advance(3.5) // past the end of bar 2 (2 bars = 4 s at 120 BPM)
    expect(sequencer.getState()).toMatchObject({ pattern: 'B', queued: null })

    // Bar 1 (steps 0–15) is all A, bar 2 starts with B on step 1 exactly.
    expect(hits.slice(0, 16).every((h) => h.pad === 0)).toBe(true)
    expect(hits.slice(16, 32).every((h) => h.pad === 1)).toBe(true)
    // No gap or double hit at the switch: one hit per step, evenly spaced.
    for (let i = 1; i < 32; i++) expect(hits[i].time - hits[i - 1].time).toBeCloseTo(step, 9)
    expect(hits[16].time).toBeCloseTo(0.05 + 16 * step, 9)
  })

  it('cancels a pending switch when the playing pattern is picked again', () => {
    const { sequencer, hits, advance } = setup({ patterns: { A: everyStep(0), B: everyStep(1) } })
    sequencer.start()
    advance(0.3)
    sequencer.selectPattern('B')
    sequencer.selectPattern('A')
    advance(3)
    expect(hits.every((h) => h.pad === 0)).toBe(true)
  })

  it('applies a pending switch when stopped before the bar line', () => {
    const { sequencer, advance } = setup()
    sequencer.start()
    advance(0.3)
    sequencer.selectPattern('B')
    sequencer.stop()
    expect(sequencer.getState()).toMatchObject({ pattern: 'B', queued: null, playing: false })
  })
})

describe('Sequencer transport and playhead', () => {
  it('play and stop', () => {
    const { sequencer, hits, advance } = setup()
    const seen: boolean[] = []
    sequencer.subscribe(() => seen.push(sequencer.getState().playing))
    sequencer.start()
    advance(1)
    sequencer.stop()
    const n = hits.length
    advance(1)
    expect(hits.length).toBe(n)
    expect(seen.at(0)).toBe(true)
    expect(seen.at(-1)).toBe(false)
  })

  it('clear empties the current pattern', () => {
    const { sequencer } = setup()
    sequencer.clear()
    expect(sequencer.getState().patterns.A).toEqual(emptyGrid())
  })

  it('follows the scheduled times, not the timer', () => {
    const { sequencer, advance } = setup({ bpm: 120 })
    const step = 0.125
    expect(sequencer.playheadAt(0)).toBe(-1)
    sequencer.start()
    // Scheduled ahead, but nothing heard before the first step's time.
    expect(sequencer.playheadAt(0.049)).toBe(-1)
    expect(sequencer.playheadAt(0.05)).toBe(0)
    advance(0.5)
    expect(sequencer.playheadAt(0.05 + 2 * step + 0.01)).toBe(2)
    expect(sequencer.playheadAt(0.05 + 3 * step)).toBe(3)
    sequencer.stop()
    expect(sequencer.playheadAt(1)).toBe(-1)
  })

  it('does not notify listeners for no-op changes', () => {
    const { sequencer } = setup()
    let calls = 0
    sequencer.subscribe(() => calls++)
    sequencer.stop()
    sequencer.toggleStep(99, 0)
    expect(calls).toBe(0)
  })
})
