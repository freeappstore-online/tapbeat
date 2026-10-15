// WAV encoding: 16-bit PCM in a RIFF container, channels interleaved.

/** The parts of an AudioBuffer the encoder reads. */
export interface PcmSource {
  numberOfChannels: number
  sampleRate: number
  length: number
  getChannelData(channel: number): Float32Array
}

export const WAV_HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 2

export function encodeWav(source: PcmSource): ArrayBuffer {
  const { numberOfChannels: channels, sampleRate, length } = source
  const blockAlign = channels * BYTES_PER_SAMPLE
  const dataBytes = length * blockAlign
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // size of everything after this field
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const data = Array.from({ length: channels }, (_, c) => source.getChannelData(c))
  let offset = WAV_HEADER_BYTES
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.min(Math.max(data[c][i] || 0, -1), 1)
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += BYTES_PER_SAMPLE
    }
  }
  return buffer
}

export function wavBlob(source: PcmSource): Blob {
  return new Blob([encodeWav(source)], { type: 'audio/wav' })
}
