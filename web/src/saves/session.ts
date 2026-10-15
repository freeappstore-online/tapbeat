// The work in progress, kept between visits: whatever is in the sequencer and
// the chosen kit, written a moment after each change. Same shape as a save.

import type { KitId } from '../audio/kits'
import type { SeqState } from '../sequencer/pattern'
import { isSavedPattern, type KeyValueStore, snapshot, stateFrom } from './library'

export const SESSION_KEY = 'tapbeat.session.v1'

export function loadSession(store: KeyValueStore): { state: SeqState; kit: KitId } | null {
  try {
    const data: unknown = JSON.parse(store.getItem(SESSION_KEY) ?? 'null')
    return isSavedPattern(data) ? { state: stateFrom(data), kit: data.kit } : null
  } catch {
    return null
  }
}

export function saveSession(store: KeyValueStore, state: SeqState, kit: KitId, now = Date.now()) {
  try {
    store.setItem(SESSION_KEY, JSON.stringify(snapshot(state, kit, 'Session', 'session', now)))
  } catch {
    // Storage full or blocked (some private modes): the session just isn't kept.
  }
}
