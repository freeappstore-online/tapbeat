import { AudioEngine } from './engine'

export { AudioEngine, createMasterChain } from './engine'
export { KITS, PAD_COUNT, PAD_NAMES, getKit, playPad, type Kit, type KitId } from './kits'
export { Scheduler } from './scheduler'
export { playSound, type Sound } from './voices'

/** The app's one engine. Its AudioContext is created on the first tap. */
export const engine = new AudioEngine()
