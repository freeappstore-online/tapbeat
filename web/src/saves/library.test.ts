import { describe, expect, it } from 'vitest'
import { initialState } from '../sequencer/pattern'
import {
  findByName,
  isSavedPattern,
  LIBRARY_KEY,
  loadLibrary,
  removeById,
  saveLibrary,
  snapshot,
  stateFrom,
  upsert,
} from './library'
import { busyState, memoryStore } from './testing'

describe('snapshot and stateFrom', () => {
  it('round-trips everything that shapes the beat', () => {
    const state = busyState()
    const saved = snapshot(state, 'lofi', '  Late night  ', 'id-1', Date.UTC(2026, 9, 16))
    expect(saved).toMatchObject({ id: 'id-1', name: 'Late night', kit: 'lofi', savedAt: '2026-10-16T00:00:00.000Z' })
    expect(isSavedPattern(saved)).toBe(true)
    expect(isSavedPattern(JSON.parse(JSON.stringify(saved)))).toBe(true)

    const restored = stateFrom(JSON.parse(JSON.stringify(saved)))
    for (const key of ['patterns', 'pattern', 'bpm', 'swing', 'mute', 'solo', 'take'] as const) {
      expect(restored[key]).toEqual(state[key])
    }
    expect(restored).toMatchObject({ playing: false, recording: false, queued: null })
  })

  it('does not share arrays with the live state', () => {
    const state = busyState()
    const saved = snapshot(state, '808', 'x', 'id', 0)
    saved.patterns.A[0][0] = !saved.patterns.A[0][0]
    expect(state.patterns.A[0][0]).not.toBe(saved.patterns.A[0][0])
  })
})

describe('isSavedPattern', () => {
  const good = () => JSON.parse(JSON.stringify(snapshot(busyState(), 'electro', 'Beat', 'id', 0)))

  it.each([
    ['an unknown kit', (s: Record<string, unknown>) => (s.kit = 'banjo')],
    ['an empty name', (s: Record<string, unknown>) => (s.name = '   ')],
    ['a short grid', (s: Record<string, unknown>) => (s.patterns as { A: unknown[] }).A.pop()],
    ['a non-boolean step', (s: Record<string, unknown>) => ((s.patterns as { B: unknown[][] }).B[0][0] = 1)],
    ['a bad pattern id', (s: Record<string, unknown>) => (s.pattern = 'C')],
    ['a bad tempo', (s: Record<string, unknown>) => (s.bpm = 'fast')],
    ['missing solo flags', (s: Record<string, unknown>) => delete s.solo],
    ['a take hit off the end', (s: Record<string, unknown>) => ((s.take as { hits: { step: number }[] }).hits[0].step = 32)],
    ['a take hit on pad 16', (s: Record<string, unknown>) => ((s.take as { hits: { pad: number }[] }).hits[0].pad = 16)],
    ['a bad date', (s: Record<string, unknown>) => (s.savedAt = 'yesterday')],
  ])('rejects %s', (_, damage) => {
    const saved = good()
    expect(isSavedPattern(saved)).toBe(true)
    damage(saved)
    expect(isSavedPattern(saved)).toBe(false)
  })

  it('accepts a save without a take', () => {
    expect(isSavedPattern({ ...good(), take: null })).toBe(true)
  })
})

describe('library in storage', () => {
  it('saves and loads, newest first, skipping damaged entries', () => {
    const store = memoryStore()
    const older = snapshot(initialState(), '808', 'Older', 'a', 1000)
    const newer = snapshot(initialState(), '808', 'Newer', 'b', 2000)
    expect(saveLibrary(store, [older, newer])).toBe(true)
    expect(loadLibrary(store).map((s) => s.name)).toEqual(['Newer', 'Older'])

    store.setItem(LIBRARY_KEY, JSON.stringify([older, { junk: true }]))
    expect(loadLibrary(store).map((s) => s.name)).toEqual(['Older'])
    store.setItem(LIBRARY_KEY, '{not json')
    expect(loadLibrary(store)).toEqual([])
    expect(loadLibrary(memoryStore())).toEqual([])
  })

  it('reports when the browser refuses to store', () => {
    const store = { ...memoryStore(), setItem: () => { throw new Error('QuotaExceededError') } }
    expect(saveLibrary(store, [])).toBe(false)
  })

  it('finds by name ignoring case, replaces by id, and removes', () => {
    const a = snapshot(initialState(), '808', 'Groove', 'a', 1)
    const b = snapshot(initialState(), '808', 'Other', 'b', 2)
    expect(findByName([a, b], '  groove ')).toBe(a)
    expect(findByName([a, b], 'nope')).toBeUndefined()
    const a2 = { ...a, bpm: 90 }
    expect(upsert([a, b], a2)).toEqual([a2, b])
    expect(removeById([a, b], 'a')).toEqual([b])
  })
})
