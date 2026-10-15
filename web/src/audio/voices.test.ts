import { OfflineAudioContext } from 'node-web-audio-api'
import { describe, expect, it } from 'vitest'
import { createMasterChain } from './engine'
import { KITS, PAD_COUNT, PAD_NAMES, getKit, playPad } from './kits'
import { midiToHz, playSound, type Sound } from './voices'

const RATE = 44100

function peak(buffer: AudioBuffer): number {
  let max = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const sample of buffer.getChannelData(c)) max = Math.max(max, Math.abs(sample))
  }
  return max
}

function hasNaN(buffer: AudioBuffer): boolean {
  return buffer.getChannelData(0).some((sample) => Number.isNaN(sample))
}

describe('kits', () => {
  it('has the four kits', () => {
    expect(KITS.map((kit) => kit.id)).toEqual(['808', 'acoustic', 'lofi', 'electro'])
    expect(new Set(KITS.map((kit) => kit.name)).size).toBe(KITS.length)
  })

  it('gives every kit one sound per pad, in the same pad order', () => {
    expect(PAD_NAMES).toHaveLength(PAD_COUNT)
    const order: Sound['voice'][] = [
      'kick', 'snare', 'clap', 'hat', 'hat', 'tom', 'tom', 'tom',
      'rim', 'cowbell', 'bass', 'bass', 'bass', 'chord', 'chord', 'chord',
    ]
    for (const kit of KITS) expect(kit.pads.map((sound) => sound.voice)).toEqual(order)
  })

  it('has a closed hat shorter than the open hat and toms rising in pitch', () => {
    for (const kit of KITS) {
      const [closed, open] = [kit.pads[3], kit.pads[4]]
      if (closed.voice !== 'hat' || open.voice !== 'hat') throw new Error('hats out of place')
      expect(closed.decay).toBeLessThan(open.decay)
      const toms = kit.pads.slice(5, 8).map((sound) => (sound.voice === 'tom' ? sound.pitch : 0))
      expect(toms).toEqual([...toms].sort((a, b) => a - b))
    }
  })

  it('uses only positive, finite parameters', () => {
    for (const kit of KITS) {
      for (const sound of kit.pads) {
        for (const value of Object.values(sound).flat()) {
          if (typeof value === 'number') expect(Number.isFinite(value) && value > 0).toBe(true)
        }
      }
    }
  })

  it('falls back to the default kit for an unknown id', () => {
    expect(getKit('lofi').id).toBe('lofi')
    expect(getKit('nope' as never).id).toBe('808')
  })

  it('converts MIDI notes to frequencies', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(57)).toBeCloseTo(220)
    expect(midiToHz(60)).toBeCloseTo(261.63, 1)
  })
})

describe('voices in an OfflineAudioContext', () => {
  for (const kit of KITS) {
    describe(kit.name, () => {
      kit.pads.forEach((_, pad) => {
        it(`${PAD_NAMES[pad]} renders non-silent, non-clipping audio that ends`, async () => {
          const ctx = new OfflineAudioContext(1, RATE * 2.5, RATE)
          const end = playPad(ctx, ctx.destination, kit, pad, 0.01)
          expect(end).toBeGreaterThan(0.01)
          expect(end).toBeLessThan(2.2)
          const buffer = await ctx.startRendering()
          expect(hasNaN(buffer)).toBe(false)
          const level = peak(buffer)
          expect(level).toBeGreaterThan(0.05)
          expect(level).toBeLessThan(1)
          // Nothing left ringing after the voice says it has ended.
          const tail = buffer.getChannelData(0).subarray(Math.ceil((end + 0.03) * RATE))
          expect(Math.max(0, ...Array.from(tail, Math.abs))).toBeLessThan(0.001)
        })
      })
    })
  }

  it('scales level with velocity', async () => {
    const render = async (velocity: number) => {
      const ctx = new OfflineAudioContext(1, RATE, RATE)
      playSound(ctx, ctx.destination, { voice: 'tom', pitch: 120, decay: 0.3 }, 0, velocity)
      return peak(await ctx.startRendering())
    }
    const [soft, loud] = [await render(0.3), await render(1)]
    expect(soft).toBeGreaterThan(0)
    expect(soft).toBeLessThan(loud * 0.5)
  })

  it('is repeatable: the same hit renders the same samples', async () => {
    const render = async () => {
      const ctx = new OfflineAudioContext(1, RATE / 2, RATE)
      playPad(ctx, ctx.destination, getKit('acoustic'), 1, 0)
      return Array.from((await ctx.startRendering()).getChannelData(0))
    }
    expect(await render()).toEqual(await render())
  })

  it('keeps every pad of a kit hit at once under 0 dBFS through the master chain', async () => {
    for (const kit of KITS) {
      const ctx = new OfflineAudioContext(2, RATE * 2.5, RATE)
      const master = createMasterChain(ctx, 1)
      for (let pad = 0; pad < PAD_COUNT; pad++) playPad(ctx, master, kit, pad, 0.01)
      const buffer = await ctx.startRendering()
      const level = peak(buffer)
      expect(level).toBeGreaterThan(0.1)
      expect(level).toBeLessThan(1)
    }
  })
})
