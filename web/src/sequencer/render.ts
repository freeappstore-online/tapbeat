// Offline render: the pattern (and optionally the take) for a number of bars,
// scheduled on an OfflineAudioContext with the same voices and master chain
// as the live pads. Faster than real time, and nothing is captured or sent.

import { createMasterChain } from '../audio/engine'
import { type Kit, playPad } from '../audio/kits'
import { hitsAt, isAudible, STEPS, type SeqState } from './pattern'
import { takeHitsInStep } from './recorder'

export const EXPORT_SAMPLE_RATE = 44100
export const EXPORT_BAR_CHOICES = [1, 2, 4, 8, 16] as const

export const stepSeconds = (bpm: number) => 60 / bpm / 4

/** Exact length of `bars` bars in samples, so the file loops cleanly. */
export function renderLength(bpm: number, bars: number, sampleRate = EXPORT_SAMPLE_RATE): number {
  return Math.round(bars * STEPS * stepSeconds(bpm) * sampleRate)
}

/**
 * Every hit in `bars` bars from time 0: the current pattern with swing, plus
 * the take (looped, unswung, as played) when `includeTake`. Mute and solo
 * apply to both, as they do live.
 */
export function exportHits(state: SeqState, bars: number, includeTake: boolean): { pad: number; time: number }[] {
  const dur = stepSeconds(state.bpm)
  const hits: { pad: number; time: number }[] = []
  for (let abs = 0; abs < bars * STEPS; abs++) {
    const step = abs % STEPS
    const straight = abs * dur
    const swung = straight + (step % 2 === 1 ? state.swing * dur : 0)
    for (const pad of hitsAt(state, step)) hits.push({ pad, time: swung })
    if (includeTake && state.take) {
      for (const { pad, offset } of takeHitsInStep(state.take, abs)) {
        if (isAudible(state, pad)) hits.push({ pad, time: straight + offset * dur })
      }
    }
  }
  return hits.sort((a, b) => a.time - b.time)
}

export interface RenderOptions {
  state: SeqState
  kit: Kit
  bars: number
  includeTake: boolean
  sampleRate?: number
}

type CreateOffline = (channels: number, length: number, sampleRate: number) => OfflineAudioContext

const defaultOffline: CreateOffline = (channels, length, sampleRate) =>
  new OfflineAudioContext(channels, length, sampleRate)

export function renderBars(options: RenderOptions, createContext: CreateOffline = defaultOffline): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? EXPORT_SAMPLE_RATE
  const ctx = createContext(2, renderLength(options.state.bpm, options.bars, sampleRate), sampleRate)
  const master = createMasterChain(ctx)
  for (const { pad, time } of exportHits(options.state, options.bars, options.includeTake)) {
    playPad(ctx, master, options.kit, pad, time)
  }
  return ctx.startRendering()
}
