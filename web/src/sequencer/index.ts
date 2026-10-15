import { engine } from '../audio'
import { loadSession, saveSession } from '../saves/session'
import { Sequencer } from './sequencer'

// Pick up where the last visit left off: the pattern and the kit.
const session = loadSession(localStorage)
if (session) engine.setKit(session.kit)

/**
 * The app's one sequencer, on the engine's audio clock. A module singleton,
 * so playback carries on while you switch screens (jam on the pads over it).
 */
export const sequencer = new Sequencer({
  clock: () => engine.currentTime,
  heard: () => engine.playbackTime,
  play: (pad, time) => engine.play(pad, time),
  initial: session?.state,
})

let saveTimer = 0

/** Keeps the work in progress (and the kit) a moment after each change. */
export function persistSession() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => saveSession(localStorage, sequencer.getState(), engine.kit.id), 300)
}

sequencer.subscribe(persistSession)
