import { engine } from '../audio'
import { Sequencer } from './sequencer'

/**
 * The app's one sequencer, on the engine's audio clock. A module singleton,
 * so playback carries on while you switch screens (jam on the pads over it).
 */
export const sequencer = new Sequencer({
  clock: () => engine.currentTime,
  play: (pad, time) => engine.play(pad, time),
})
