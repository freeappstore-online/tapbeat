// The kits. Each is 16 synthesised sounds, one per pad, in the same order, so
// a pattern plays on any kit and switching kit is instant (nothing to load).

import { playSound, type Sound } from './voices'

export const PAD_COUNT = 16

export const PAD_NAMES = [
  'Kick',
  'Snare',
  'Clap',
  'Closed hat',
  'Open hat',
  'Low tom',
  'Mid tom',
  'High tom',
  'Rim',
  'Cowbell',
  'Bass 1',
  'Bass 2',
  'Bass 3',
  'Chord 1',
  'Chord 2',
  'Chord 3',
] as const

export type KitId = '808' | 'acoustic' | 'lofi' | 'electro'

export interface Kit {
  id: KitId
  name: string
  pads: Sound[]
  /** Optional low-pass on every hit, for a darker, dustier kit. */
  lowpass?: number
}

export const KITS: Kit[] = [
  {
    id: '808',
    name: '808',
    pads: [
      { voice: 'kick', pitch: 48, sweep: 0.06, decay: 0.9, click: 0.2 },
      { voice: 'snare', tone: 190, decay: 0.2, snap: 0.8, cutoff: 1800 },
      { voice: 'clap', decay: 0.25, cutoff: 1100 },
      { voice: 'hat', decay: 0.05, cutoff: 7000, metallic: true },
      { voice: 'hat', decay: 0.4, cutoff: 7000, metallic: true },
      { voice: 'tom', pitch: 90, decay: 0.45 },
      { voice: 'tom', pitch: 130, decay: 0.45 },
      { voice: 'tom', pitch: 180, decay: 0.45 },
      { voice: 'rim', pitch: 1700, decay: 0.04 },
      { voice: 'cowbell', pitch: 560, decay: 0.35 },
      { voice: 'bass', note: 36, wave: 'sine', decay: 1, cutoff: 800 },
      { voice: 'bass', note: 39, wave: 'sine', decay: 1, cutoff: 800 },
      { voice: 'bass', note: 43, wave: 'sine', decay: 1, cutoff: 800 },
      { voice: 'chord', notes: [60, 63, 67, 70], wave: 'sawtooth', decay: 1.2, cutoff: 1800 },
      { voice: 'chord', notes: [56, 60, 63, 67], wave: 'sawtooth', decay: 1.2, cutoff: 1800 },
      { voice: 'chord', notes: [58, 62, 65], wave: 'sawtooth', decay: 1.2, cutoff: 1800 },
    ],
  },
  {
    id: 'acoustic',
    name: 'Acoustic',
    pads: [
      { voice: 'kick', pitch: 60, sweep: 0.03, decay: 0.35, click: 0.6 },
      { voice: 'snare', tone: 220, decay: 0.25, snap: 1, cutoff: 1200 },
      { voice: 'clap', decay: 0.3, cutoff: 1400 },
      { voice: 'hat', decay: 0.06, cutoff: 8000, metallic: false },
      { voice: 'hat', decay: 0.5, cutoff: 8000, metallic: false },
      { voice: 'tom', pitch: 110, decay: 0.35 },
      { voice: 'tom', pitch: 150, decay: 0.35 },
      { voice: 'tom', pitch: 200, decay: 0.35 },
      { voice: 'rim', pitch: 2000, decay: 0.04 },
      { voice: 'cowbell', pitch: 600, decay: 0.25 },
      { voice: 'bass', note: 40, wave: 'triangle', decay: 0.6, cutoff: 1200 },
      { voice: 'bass', note: 43, wave: 'triangle', decay: 0.6, cutoff: 1200 },
      { voice: 'bass', note: 45, wave: 'triangle', decay: 0.6, cutoff: 1200 },
      { voice: 'chord', notes: [55, 59, 62, 67], wave: 'triangle', decay: 1.5, cutoff: 2500 },
      { voice: 'chord', notes: [52, 55, 59, 64], wave: 'triangle', decay: 1.5, cutoff: 2500 },
      { voice: 'chord', notes: [48, 55, 60, 64], wave: 'triangle', decay: 1.5, cutoff: 2500 },
    ],
  },
  {
    id: 'lofi',
    name: 'Lo-fi',
    lowpass: 3200,
    pads: [
      { voice: 'kick', pitch: 52, sweep: 0.05, decay: 0.5, click: 0.1 },
      { voice: 'snare', tone: 180, decay: 0.18, snap: 0.6, cutoff: 1000 },
      { voice: 'clap', decay: 0.2, cutoff: 900 },
      { voice: 'hat', decay: 0.04, cutoff: 5000, metallic: false },
      { voice: 'hat', decay: 0.3, cutoff: 5000, metallic: false },
      { voice: 'tom', pitch: 80, decay: 0.3 },
      { voice: 'tom', pitch: 110, decay: 0.3 },
      { voice: 'tom', pitch: 150, decay: 0.3 },
      { voice: 'rim', pitch: 1400, decay: 0.05 },
      { voice: 'cowbell', pitch: 500, decay: 0.2 },
      { voice: 'bass', note: 33, wave: 'square', decay: 0.5, cutoff: 500 },
      { voice: 'bass', note: 36, wave: 'square', decay: 0.5, cutoff: 500 },
      { voice: 'bass', note: 38, wave: 'square', decay: 0.5, cutoff: 500 },
      { voice: 'chord', notes: [50, 53, 57, 60, 64], wave: 'triangle', decay: 1.8, cutoff: 1200 },
      { voice: 'chord', notes: [55, 58, 62, 65], wave: 'triangle', decay: 1.8, cutoff: 1200 },
      { voice: 'chord', notes: [53, 57, 60, 64], wave: 'triangle', decay: 1.8, cutoff: 1200 },
    ],
  },
  {
    id: 'electro',
    name: 'Electro',
    pads: [
      { voice: 'kick', pitch: 45, sweep: 0.08, decay: 0.6, click: 0.4 },
      { voice: 'snare', tone: 240, decay: 0.15, snap: 0.9, cutoff: 3000 },
      { voice: 'clap', decay: 0.18, cutoff: 1600 },
      { voice: 'hat', decay: 0.03, cutoff: 9000, metallic: true },
      { voice: 'hat', decay: 0.25, cutoff: 9000, metallic: true },
      { voice: 'tom', pitch: 100, decay: 0.25 },
      { voice: 'tom', pitch: 140, decay: 0.25 },
      { voice: 'tom', pitch: 200, decay: 0.25 },
      { voice: 'rim', pitch: 2400, decay: 0.03 },
      { voice: 'cowbell', pitch: 800, decay: 0.15 },
      { voice: 'bass', note: 36, wave: 'sawtooth', decay: 0.35, cutoff: 900 },
      { voice: 'bass', note: 38, wave: 'sawtooth', decay: 0.35, cutoff: 900 },
      { voice: 'bass', note: 43, wave: 'sawtooth', decay: 0.35, cutoff: 900 },
      { voice: 'chord', notes: [57, 60, 64], wave: 'square', decay: 0.6, cutoff: 2000 },
      { voice: 'chord', notes: [53, 57, 60], wave: 'square', decay: 0.6, cutoff: 2000 },
      { voice: 'chord', notes: [55, 59, 62], wave: 'square', decay: 0.6, cutoff: 2000 },
    ],
  },
]

export const DEFAULT_KIT: KitId = '808'

export function getKit(id: KitId): Kit {
  return KITS.find((kit) => kit.id === id) ?? KITS[0]
}

/**
 * Plays one pad of a kit into `out` at `time`. Pure scheduling, so it works on
 * the live context and on an OfflineAudioContext. Returns the time it ends.
 */
export function playPad(ctx: BaseAudioContext, out: AudioNode, kit: Kit, pad: number, time: number, velocity = 1): number {
  const sound = kit.pads[pad]
  if (!sound) return time
  let dest = out
  if (kit.lowpass) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = kit.lowpass
    lp.connect(out)
    dest = lp
  }
  return playSound(ctx, dest, sound, time, velocity)
}
