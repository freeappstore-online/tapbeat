import { OfflineAudioContext } from 'node-web-audio-api'
import { describe, expect, it } from 'vitest'
import { getKit } from '../audio/kits'
import { emptyGrid, initialState, type SeqState } from './pattern'
import { exportHits, renderBars } from './render'

function state(overrides: Partial<SeqState> = {}): SeqState {
  return { ...initialState(), patterns: { A: emptyGrid(), B: emptyGrid() }, ...overrides }
}

const withSteps = (pad: number, steps: number[]) =>
  emptyGrid().map((row, p) => row.map((_, s) => p === pad && steps.includes(s)))

describe('exportHits', () => {
  it('lays the pattern out bar after bar with swing, from time 0', () => {
    const s = state({ bpm: 120, swing: 0.5, patterns: { A: withSteps(0, [0, 1]), B: emptyGrid() } })
    const hits = exportHits(s, 2, false)
    expect(hits.map((h) => h.time)).toEqual([0, 0.125 + 0.0625, 2, 2 + 0.125 + 0.0625])
  })

  it('adds the take, looped and unswung, only when asked', () => {
    const take = { bars: 1, hits: [{ pad: 9, step: 2.5 }] }
    const s = state({ bpm: 120, swing: 0.5, take })
    expect(exportHits(s, 2, false)).toEqual([])
    expect(exportHits(s, 2, true)).toEqual([
      { pad: 9, time: 2.5 * 0.125 },
      { pad: 9, time: 2 + 2.5 * 0.125 },
    ])
  })

  it('cuts a longer take at the export length', () => {
    const take = { bars: 2, hits: [{ pad: 1, step: 0 }, { pad: 2, step: 20 }] }
    expect(exportHits(state({ take }), 1, true).map((h) => h.pad)).toEqual([1])
  })

  it('applies mute and solo', () => {
    const take = { bars: 1, hits: [{ pad: 2, step: 0 }] }
    const s = state({ take, patterns: { A: withSteps(0, [0]), B: emptyGrid() } })
    const muted = { ...s, mute: s.mute.map((_, p) => p === 2) }
    expect(exportHits(muted, 1, true).map((h) => h.pad)).toEqual([0])
    const soloed = { ...s, solo: s.solo.map((_, p) => p === 2) }
    expect(exportHits(soloed, 1, true).map((h) => h.pad)).toEqual([2])
  })

  it('exports the current pattern', () => {
    const s = state({ pattern: 'B', patterns: { A: withSteps(0, [0]), B: withSteps(1, [0]) } })
    expect(exportHits(s, 1, false).map((h) => h.pad)).toEqual([1])
  })
})

describe('renderBars', () => {
  it('renders a recorded hit at its place in the bar', async () => {
    const take = { bars: 1, hits: [{ pad: 0, step: 8 }] }
    const buffer = await renderBars(
      { state: state({ bpm: 120, take }), kit: getKit('electro'), bars: 1, includeTake: true },
      (channels, length, rate) => new OfflineAudioContext(channels, length, rate),
    )
    const data = buffer.getChannelData(0)
    const onset = data.findIndex((s) => Math.abs(s) > 0.01)
    // Step 9 at 120 BPM is 1 s in: the kick starts there and not before.
    expect(onset / buffer.sampleRate).toBeGreaterThanOrEqual(1)
    expect(onset / buffer.sampleRate).toBeLessThan(1.01)
  })
})
