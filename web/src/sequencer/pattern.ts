// The sequencer's state as plain immutable data, plus pure updates on it.
// Everything here is UI- and audio-free so it can be tested (and later saved
// to localStorage) as is.

import { PAD_COUNT } from '../audio/kits'
import { MAX_BPM, MAX_SWING, MIN_BPM } from '../audio/scheduler'
import type { Take } from './recorder'

export const STEPS = 16

export type PatternId = 'A' | 'B'
export const PATTERN_IDS: readonly PatternId[] = ['A', 'B']

/** grid[pad][step]: whether that pad plays on that step. */
export type Grid = readonly (readonly boolean[])[]

export interface SeqState {
  patterns: Readonly<Record<PatternId, Grid>>
  /** The pattern playing and on screen. */
  pattern: PatternId
  /** A pattern waiting for the next bar line to take over, while playing. */
  queued: PatternId | null
  playing: boolean
  bpm: number
  /** 0–0.5: how late off-beat steps land, as a fraction of a step. */
  swing: number
  mute: readonly boolean[]
  solo: readonly boolean[]
  /** Capturing live pad hits into a new take. */
  recording: boolean
  /** The last recorded jam, which loops along with the pattern. */
  take: Take | null
}

export function emptyGrid(): Grid {
  return Array.from({ length: PAD_COUNT }, () => Array<boolean>(STEPS).fill(false))
}

function gridWith(hits: Record<number, number[]>): Grid {
  return emptyGrid().map((row, pad) => row.map((_, step) => hits[pad]?.includes(step) ?? false))
}

/** A starter beat on A, so Play does something straight away; B starts empty. */
export function initialState(): SeqState {
  return {
    patterns: {
      A: gridWith({ 0: [0, 6, 8], 1: [4, 12], 3: [0, 2, 4, 6, 8, 10, 12, 14] }),
      B: emptyGrid(),
    },
    pattern: 'A',
    queued: null,
    playing: false,
    bpm: 100,
    swing: 0,
    mute: Array<boolean>(PAD_COUNT).fill(false),
    solo: Array<boolean>(PAD_COUNT).fill(false),
    recording: false,
    take: null,
  }
}

const inRange = (pad: number, step: number) => pad >= 0 && pad < PAD_COUNT && step >= 0 && step < STEPS

function updateGrid(state: SeqState, update: (grid: Grid) => Grid): SeqState {
  return { ...state, patterns: { ...state.patterns, [state.pattern]: update(state.patterns[state.pattern]) } }
}

export function toggleStep(state: SeqState, pad: number, step: number): SeqState {
  if (!inRange(pad, step)) return state
  return updateGrid(state, (grid) =>
    grid.map((row, p) => (p === pad ? row.map((on, s) => (s === step ? !on : on)) : row)),
  )
}

/** Clears the pattern on screen; the other pattern is untouched. */
export function clearPattern(state: SeqState): SeqState {
  return updateGrid(state, emptyGrid)
}

const flip = (flags: readonly boolean[], pad: number) => flags.map((on, p) => (p === pad ? !on : on))

export function toggleMute(state: SeqState, pad: number): SeqState {
  return { ...state, mute: flip(state.mute, pad) }
}

export function toggleSolo(state: SeqState, pad: number): SeqState {
  return { ...state, solo: flip(state.solo, pad) }
}

/** With any pad soloed only soloed pads play (solo beats mute); otherwise all but the muted. */
export function isAudible(state: SeqState, pad: number): boolean {
  return state.solo.some(Boolean) ? state.solo[pad] : !state.mute[pad]
}

/** The pads to play on `step` of the current pattern. */
export function hitsAt(state: SeqState, step: number): number[] {
  const grid = state.patterns[state.pattern]
  const pads: number[] = []
  for (let pad = 0; pad < grid.length; pad++) if (grid[pad][step] && isAudible(state, pad)) pads.push(pad)
  return pads
}

export function hasSteps(grid: Grid, pad: number): boolean {
  return grid[pad]?.some(Boolean) ?? false
}

export const clampBpm = (bpm: number) => Math.round(Math.min(Math.max(bpm, MIN_BPM), MAX_BPM))
export const clampSwing = (swing: number) => Math.min(Math.max(swing, 0), MAX_SWING)
