import { OfflineAudioContext } from 'node-web-audio-api'
import { describe, expect, it } from 'vitest'
import { getKit } from '../audio/kits'
import { initialState } from './pattern'
import { EXPORT_SAMPLE_RATE, renderBars, renderLength } from './render'
import { encodeWav, WAV_HEADER_BYTES, wavBlob, type PcmSource } from './wav'

const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

/** Reads a WAV header back, checking every field a player relies on. */
function parseWav(bytes: ArrayBuffer) {
  const view = new DataView(bytes)
  return {
    riff: text(view, 0, 4),
    riffSize: view.getUint32(4, true),
    wave: text(view, 8, 4),
    fmt: text(view, 12, 4),
    fmtSize: view.getUint32(16, true),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    data: text(view, 36, 4),
    dataSize: view.getUint32(40, true),
    sample: (frame: number, channel: number, channels: number) =>
      view.getInt16(WAV_HEADER_BYTES + (frame * channels + channel) * 2, true),
  }
}

function source(channels: number[][], sampleRate = 44100): PcmSource {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    getChannelData: (c) => Float32Array.from(channels[c]),
  }
}

describe('encodeWav', () => {
  it('writes a valid 16-bit PCM RIFF/WAVE header', () => {
    const bytes = encodeWav(source([[0, 0.5, -0.5], [1, -1, 0]], 44100))
    const wav = parseWav(bytes)
    expect(wav).toMatchObject({
      riff: 'RIFF',
      wave: 'WAVE',
      fmt: 'fmt ',
      fmtSize: 16,
      format: 1,
      channels: 2,
      sampleRate: 44100,
      byteRate: 44100 * 2 * 2,
      blockAlign: 4,
      bitsPerSample: 16,
      data: 'data',
      dataSize: 3 * 2 * 2,
    })
    expect(wav.riffSize).toBe(bytes.byteLength - 8)
    expect(bytes.byteLength).toBe(WAV_HEADER_BYTES + 12)
  })

  it('interleaves channels and converts to 16-bit, clamping out-of-range samples', () => {
    const wav = parseWav(encodeWav(source([[0, 0.5, 2], [1, -1, -3]])))
    expect([wav.sample(0, 0, 2), wav.sample(0, 1, 2)]).toEqual([0, 32767])
    expect([wav.sample(1, 0, 2), wav.sample(1, 1, 2)]).toEqual([16383, -32768])
    expect([wav.sample(2, 0, 2), wav.sample(2, 1, 2)]).toEqual([32767, -32768])
  })

  it('keeps the sample rate it is given', () => {
    expect(parseWav(encodeWav(source([[0]], 48000))).sampleRate).toBe(48000)
  })

  it('makes an audio/wav Blob', async () => {
    const blob = wavBlob(source([[0, 0]]))
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(WAV_HEADER_BYTES + 4)
  })
})

describe('exported WAV of a render', () => {
  const offline = (channels: number, length: number, rate: number) => new OfflineAudioContext(channels, length, rate)

  for (const { bpm, bars } of [
    { bpm: 100, bars: 1 },
    { bpm: 60, bars: 2 },
    { bpm: 180, bars: 4 },
  ]) {
    it(`is exactly ${bars} bar(s) at ${bpm} BPM, 44.1 kHz stereo, with sound in it`, async () => {
      const buffer = await renderBars({ state: { ...initialState(), bpm }, kit: getKit('808'), bars, includeTake: false }, offline)
      const frames = Math.round(bars * 4 * (60 / bpm) * EXPORT_SAMPLE_RATE)
      expect(renderLength(bpm, bars)).toBe(frames)
      expect(buffer.length).toBe(frames)
      expect(buffer.sampleRate).toBe(44100)

      const bytes = encodeWav(buffer)
      const wav = parseWav(bytes)
      expect(wav).toMatchObject({ riff: 'RIFF', wave: 'WAVE', channels: 2, sampleRate: 44100, bitsPerSample: 16 })
      expect(wav.dataSize).toBe(frames * 4)
      expect(bytes.byteLength).toBe(WAV_HEADER_BYTES + frames * 4)

      let peak = 0
      for (let i = 0; i < frames; i += 7) peak = Math.max(peak, Math.abs(wav.sample(i, 0, 2)))
      expect(peak).toBeGreaterThan(1000)
      expect(peak).toBeLessThan(32767)
    })
  }
})
