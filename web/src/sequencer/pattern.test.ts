import { describe, expect, it } from 'vitest'
import {
  clampBpm,
  clampSwing,
  clearPattern,
  emptyGrid,
  hasSteps,
  hitsAt,
  initialState,
  isAudible,
  STEPS,
  toggleMute,
  toggleSolo,
  toggleStep,
} from './pattern'

describe('pattern', () => {
  it('starts with a 16×16 grid per pattern: a starter beat on A, B empty', () => {
    const state = initialState()
    for (const grid of [state.patterns.A, state.patterns.B]) {
      expect(grid).toHaveLength(16)
      for (const row of grid) expect(row).toHaveLength(STEPS)
    }
    expect(hitsAt(state, 0)).toEqual([0, 3])
    expect(hitsAt(state, 4)).toEqual([1, 3])
    expect(state.patterns.B.flat().some(Boolean)).toBe(false)
    expect(state).toMatchObject({ pattern: 'A', queued: null, playing: false, bpm: 100, swing: 0 })
  })

  it('toggles a step on the current pattern only, without mutating', () => {
    const before = initialState()
    const after = toggleStep(before, 5, 3)
    expect(after.patterns.A[5][3]).toBe(true)
    expect(before.patterns.A[5][3]).toBe(false)
    expect(after.patterns.B).toBe(before.patterns.B)
    expect(toggleStep(after, 5, 3).patterns.A[5][3]).toBe(false)
    const onB = toggleStep({ ...before, pattern: 'B' }, 2, 0)
    expect(onB.patterns.B[2][0]).toBe(true)
    expect(onB.patterns.A).toBe(before.patterns.A)
  })

  it('ignores steps and pads out of range', () => {
    const state = initialState()
    expect(toggleStep(state, 16, 0)).toBe(state)
    expect(toggleStep(state, 0, 16)).toBe(state)
    expect(toggleStep(state, -1, 0)).toBe(state)
  })

  it('clears only the current pattern', () => {
    const state = toggleStep({ ...initialState(), pattern: 'B' }, 1, 1)
    const cleared = clearPattern(state)
    expect(cleared.patterns.B).toEqual(emptyGrid())
    expect(cleared.patterns.A).toBe(state.patterns.A)
  })

  it('mutes, and solo wins over mute', () => {
    let state = initialState()
    state = toggleMute(state, 0)
    expect(isAudible(state, 0)).toBe(false)
    expect(hitsAt(state, 0)).toEqual([3])
    state = toggleSolo(state, 1)
    expect(hitsAt(state, 4)).toEqual([1])
    expect(isAudible(state, 3)).toBe(false)
    state = toggleSolo(state, 0)
    expect(isAudible(state, 0)).toBe(true) // soloed though muted
    state = toggleSolo(toggleSolo(state, 0), 1)
    expect(hitsAt(state, 0)).toEqual([3]) // no solo left: back to mute rules
  })

  it('reports which pads have steps', () => {
    const state = initialState()
    expect(hasSteps(state.patterns.A, 0)).toBe(true)
    expect(hasSteps(state.patterns.A, 15)).toBe(false)
  })

  it('clamps tempo to 60–180 whole BPM and swing to 0–0.5', () => {
    expect(clampBpm(30)).toBe(60)
    expect(clampBpm(240)).toBe(180)
    expect(clampBpm(120.6)).toBe(121)
    expect(clampSwing(-1)).toBe(0)
    expect(clampSwing(0.8)).toBe(0.5)
  })
})
