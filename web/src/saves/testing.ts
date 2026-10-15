// Shared fixtures for the saves tests.
import { initialState, toggleMute, toggleSolo, toggleStep, type SeqState } from '../sequencer/pattern'
import type { KeyValueStore } from './library'

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** A state that touches everything a save should keep. */
export function busyState(): SeqState {
  let state = initialState()
  state = toggleStep(state, 9, 3)
  state = toggleStep({ ...state, pattern: 'B' }, 2, 15)
  state = toggleMute(state, 1)
  state = toggleSolo(state, 4)
  return { ...state, bpm: 137, swing: 0.3, take: { bars: 2, hits: [{ pad: 6, step: 4.5 }, { pad: 0, step: 20 }] } }
}
