import { describe, expect, it } from 'vitest'
import type { Timer } from '../audio/scheduler'
import { emptyGrid, initialState, type SeqState } from './pattern'
import { makeTake, MAX_TAKE_BARS, takeHitsInStep } from './recorder'
import { Sequencer } from './sequencer'

describe('makeTake', () => {
  it('rounds the take up to whole bars and sorts the hits', () => {
    const take = makeTake([{ pad: 1, step: 20 }, { pad: 0, step: 2.5 }], 30)
    expect(take).toEqual({ bars: 2, hits: [{ pad: 0, step: 2.5 }, { pad: 1, step: 20 }] })
  })

  it('does not add a bar for stopping just after a bar line', () => {
    expect(makeTake([{ pad: 0, step: 1 }], 16.6)?.bars).toBe(1)
    expect(makeTake([{ pad: 0, step: 1 }], 17.2)?.bars).toBe(2)
  })

  it('drops hits outside the take and returns null when nothing was played', () => {
    expect(makeTake([], 40)).toBeNull()
    expect(makeTake([{ pad: 0, step: -0.5 }], 10)).toBeNull()
    expect(makeTake([{ pad: 0, step: 1 }], 10_000)?.bars).toBe(MAX_TAKE_BARS)
  })

  it('finds the hits in a step, looping over the take', () => {
    const take = { bars: 1, hits: [{ pad: 3, step: 4.25 }, { pad: 1, step: 4.75 }, { pad: 2, step: 5 }] }
    expect(takeHitsInStep(take, 4)).toEqual([{ pad: 3, offset: 0.25 }, { pad: 1, offset: 0.75 }])
    expect(takeHitsInStep(take, 20)).toEqual(takeHitsInStep(take, 4))
    expect(takeHitsInStep(take, 5)).toEqual([{ pad: 2, offset: 0 }])
    expect(takeHitsInStep(take, 6)).toEqual([])
  })
})

// A hand-driven clock; `heardLag` stands in for output latency.
function setup(initial: Partial<SeqState> = {}, heardLag = 0) {
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
  const played: { pad: number; time: number }[] = []
  const sequencer = new Sequencer({
    clock: () => now,
    heard: () => now - heardLag,
    play: (pad, time) => played.push({ pad, time }),
    timer,
    lookahead: 0.1,
    initial: { ...initialState(), patterns: { A: emptyGrid(), B: emptyGrid() }, ...initial },
  })
  return {
    sequencer,
    played,
    /** Moves the clock forward to `t` in timer-sized ticks. */
    runTo(t: number) {
      while (now + 0.025 < t) {
        now += 0.025
        tick?.()
      }
      now = t
      tick?.()
    },
  }
}

const START = 0.05 // the Scheduler's start delay
const timesOf = (played: { pad: number; time: number }[], pad: number) => played.filter((p) => p.pad === pad).map((p) => p.time)

describe('recording a jam', () => {
  it('replays recorded hits in time, looping with the pattern', () => {
    const step = 0.125 // 120 BPM
    const { sequencer, played, runTo } = setup({ bpm: 120, swing: 0.25 })
    sequencer.toggleRecord() // starts playback too
    expect(sequencer.getState()).toMatchObject({ playing: true, recording: true })

    runTo(START + 3.5 * step) // between steps 4 and 5 (the take ignores swing)
    sequencer.recordHit(5)
    runTo(START + 12 * step)
    sequencer.recordHit(2)
    runTo(START + 16.4 * step) // just past the bar line
    sequencer.toggleRecord()

    const take = sequencer.getState().take!
    expect(take.bars).toBe(1)
    expect(take.hits.map((h) => h.pad)).toEqual([5, 2])
    expect(take.hits[0].step).toBeCloseTo(3.5, 9)
    expect(take.hits[1].step).toBeCloseTo(12, 9)

    // Nothing was echoed while recording; the take loops from bar 2 on.
    runTo(START + 48 * step)
    const five = timesOf(played, 5)
    const two = timesOf(played, 2)
    expect(five).toHaveLength(2)
    expect(two).toHaveLength(2)
    five.forEach((t, i) => expect(t).toBeCloseTo(START + (16 * (i + 1) + 3.5) * step, 9))
    two.forEach((t, i) => expect(t).toBeCloseTo(START + (16 * (i + 1) + 12) * step, 9))
  })

  it('keeps hits on the grid when the tempo changes after recording', () => {
    const { sequencer, played, runTo } = setup({ bpm: 120 })
    sequencer.toggleRecord()
    runTo(START + 8 * 0.125)
    sequencer.recordHit(7)
    runTo(START + 16.2 * 0.125)
    sequencer.toggleRecord()
    sequencer.stop()

    sequencer.setBpm(60) // a step is now 0.25 s
    const restart = 10
    runTo(restart)
    sequencer.start()
    runTo(restart + 6)
    expect(timesOf(played, 7)[0]).toBeCloseTo(restart + START + 8 * 0.25, 9)
  })

  it('starts the take on the bar line of the bar being heard', () => {
    const step = 0.15 // 100 BPM
    const { sequencer, runTo } = setup()
    sequencer.start()
    runTo(START + 20 * step) // bar 2, step 5
    sequencer.toggleRecord()
    runTo(START + 22.25 * step)
    sequencer.recordHit(1)
    runTo(START + 30 * step)
    sequencer.toggleRecord()
    const take = sequencer.getState().take!
    expect(take.hits[0].step).toBeCloseTo(6.25, 9)
  })

  it('places hits at the time being heard, compensating output latency', () => {
    const step = 0.15
    const lag = 0.03
    const { sequencer, runTo } = setup({}, lag)
    sequencer.toggleRecord()
    // The player hears step 5 at clock time step5 + lag and taps along to it.
    runTo(START + 4 * step + lag)
    sequencer.recordHit(0)
    runTo(START + 17.5 * step)
    sequencer.toggleRecord()
    expect(sequencer.getState().take!.hits[0].step).toBeCloseTo(4, 9)
  })

  it('ignores hits when not recording, keeps the old take if nothing was played, and can clear it', () => {
    const { sequencer, runTo } = setup()
    sequencer.recordHit(0)
    sequencer.toggleRecord()
    runTo(1)
    sequencer.recordHit(3)
    sequencer.stop() // stopping ends the recording
    const take = sequencer.getState().take
    expect(take?.hits).toHaveLength(1)
    expect(sequencer.getState().recording).toBe(false)

    sequencer.toggleRecord()
    runTo(2)
    sequencer.toggleRecord() // empty take: keep the previous one
    expect(sequencer.getState().take).toBe(take)

    sequencer.clearTake()
    expect(sequencer.getState().take).toBeNull()
  })

  it('applies mute and solo to the take', () => {
    const { sequencer, played, runTo } = setup({ bpm: 120 })
    sequencer.toggleRecord()
    runTo(START + 2 * 0.125)
    sequencer.recordHit(4)
    runTo(START + 16.2 * 0.125)
    sequencer.toggleRecord()
    sequencer.toggleMute(4)
    runTo(START + 40 * 0.125)
    expect(timesOf(played, 4)).toEqual([])
  })
})
