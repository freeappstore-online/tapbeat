// A take: live pad hits recorded over the loop. Hits are stored as positions
// on the step grid (fractional steps from the bar the take began on), not as
// seconds, so a take replays in time at any tempo and lines up with the
// pattern. A take loops over a whole number of bars.

import { STEPS } from './pattern'

export const MAX_TAKE_BARS = 16

export interface TakeHit {
  pad: number
  /** Steps from the start of the take; 4.5 is halfway between steps 5 and 6. */
  step: number
}

export interface Take {
  bars: number
  /** Sorted by position. */
  hits: readonly TakeHit[]
}

/**
 * Closes a recording. `end` is where recording stopped, in steps from the
 * take's start; the take is rounded up to whole bars, except that stopping
 * within the first step of a bar doesn't add that (empty) bar. Returns null
 * when nothing was played.
 */
export function makeTake(hits: readonly TakeHit[], end: number): Take | null {
  const bars = Math.min(Math.max(Math.ceil((end - 1) / STEPS), 1), MAX_TAKE_BARS)
  const length = bars * STEPS
  const kept = hits.filter((hit) => hit.step >= 0 && hit.step < length).sort((a, b) => a.step - b.step)
  return kept.length > 0 ? { bars, hits: kept } : null
}

/**
 * The take's hits that fall within grid step `step` (counted from the take's
 * start, looping), each with its offset into the step (0 ≤ offset < 1).
 */
export function takeHitsInStep(take: Take, step: number): { pad: number; offset: number }[] {
  const length = take.bars * STEPS
  const pos = ((step % length) + length) % length
  const hits: { pad: number; offset: number }[] = []
  for (const hit of take.hits) {
    if (Math.floor(hit.step) === pos) hits.push({ pad: hit.pad, offset: hit.step - pos })
  }
  return hits
}
