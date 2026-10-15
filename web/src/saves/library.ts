// Saved patterns, kept in localStorage on this device only. A save is a
// snapshot of everything that shapes the beat: both patterns (A/B), which one
// is selected, kit, tempo, swing, mute/solo and the recorded jam.

import { KITS, PAD_COUNT, type KitId } from '../audio/kits'
import { initialState, PATTERN_IDS, STEPS, clampBpm, clampSwing, type Grid, type PatternId, type SeqState } from '../sequencer/pattern'
import { MAX_TAKE_BARS, type Take } from '../sequencer/recorder'

export const LIBRARY_KEY = 'tapbeat.saves.v1'
export const MAX_NAME_LENGTH = 40

/** The subset of Storage these functions use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SavedPattern {
  id: string
  name: string
  /** ISO date. */
  savedAt: string
  kit: KitId
  bpm: number
  swing: number
  pattern: PatternId
  patterns: Record<PatternId, boolean[][]>
  mute: boolean[]
  solo: boolean[]
  take: Take | null
}

// ---- Validation: anything read from storage or a file is untrusted. ----

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isFlags = (x: unknown, length: number): x is boolean[] =>
  Array.isArray(x) && x.length === length && x.every((v) => typeof v === 'boolean')
const isGrid = (x: unknown): x is boolean[][] =>
  Array.isArray(x) && x.length === PAD_COUNT && x.every((row) => isFlags(row, STEPS))
const isNumberIn = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max

function isTake(x: unknown): x is Take {
  if (!isObject(x) || !Number.isInteger(x.bars) || !isNumberIn(x.bars, 1, MAX_TAKE_BARS) || !Array.isArray(x.hits)) {
    return false
  }
  const length = (x.bars as number) * STEPS
  return x.hits.every(
    (hit) => isObject(hit) && Number.isInteger(hit.pad) && isNumberIn(hit.pad, 0, PAD_COUNT - 1) && isNumberIn(hit.step, 0, length - 1e-9),
  )
}

export function isSavedPattern(x: unknown): x is SavedPattern {
  return (
    isObject(x) &&
    typeof x.id === 'string' &&
    x.id.length > 0 &&
    typeof x.name === 'string' &&
    x.name.trim().length > 0 &&
    x.name.length <= MAX_NAME_LENGTH &&
    typeof x.savedAt === 'string' &&
    !Number.isNaN(Date.parse(x.savedAt)) &&
    KITS.some((kit) => kit.id === x.kit) &&
    isNumberIn(x.bpm, 1, 1000) &&
    isNumberIn(x.swing, 0, 1) &&
    PATTERN_IDS.includes(x.pattern as PatternId) &&
    isObject(x.patterns) &&
    PATTERN_IDS.every((id) => isGrid((x.patterns as Record<string, unknown>)[id])) &&
    isFlags(x.mute, PAD_COUNT) &&
    isFlags(x.solo, PAD_COUNT) &&
    (x.take === null || isTake(x.take))
  )
}

// ---- Snapshots ----

const copyGrid = (grid: Grid) => grid.map((row) => [...row])

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function snapshot(state: SeqState, kit: KitId, name: string, id: string, now: number): SavedPattern {
  return {
    id,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    savedAt: new Date(now).toISOString(),
    kit,
    bpm: state.bpm,
    swing: state.swing,
    pattern: state.pattern,
    patterns: { A: copyGrid(state.patterns.A), B: copyGrid(state.patterns.B) },
    mute: [...state.mute],
    solo: [...state.solo],
    take: state.take ? { bars: state.take.bars, hits: state.take.hits.map((hit) => ({ ...hit })) } : null,
  }
}

/** A stopped sequencer state holding the save. */
export function stateFrom(saved: SavedPattern): SeqState {
  return {
    ...initialState(),
    bpm: clampBpm(saved.bpm),
    swing: clampSwing(saved.swing),
    pattern: saved.pattern,
    patterns: { A: copyGrid(saved.patterns.A), B: copyGrid(saved.patterns.B) },
    mute: [...saved.mute],
    solo: [...saved.solo],
    take: saved.take,
  }
}

// ---- The library in storage ----

/** Saved patterns, newest first. Damaged entries are skipped, never fatal. */
export function loadLibrary(store: KeyValueStore): SavedPattern[] {
  let data: unknown
  try {
    data = JSON.parse(store.getItem(LIBRARY_KEY) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data.filter(isSavedPattern).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/** Writes the library. Returns false if the browser refused (full or blocked storage). */
export function saveLibrary(store: KeyValueStore, list: readonly SavedPattern[]): boolean {
  try {
    store.setItem(LIBRARY_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** A save with this name already, ignoring case and surrounding spaces. */
export function findByName(list: readonly SavedPattern[], name: string): SavedPattern | undefined {
  const key = name.trim().toLowerCase()
  return list.find((item) => item.name.toLowerCase() === key)
}

/** Adds a save, replacing one with the same id. Newest first. */
export function upsert(list: readonly SavedPattern[], item: SavedPattern): SavedPattern[] {
  return [item, ...list.filter((other) => other.id !== item.id)]
}

export function removeById(list: readonly SavedPattern[], id: string): SavedPattern[] {
  return list.filter((item) => item.id !== id)
}
