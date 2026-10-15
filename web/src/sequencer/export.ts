import type { Kit } from '../audio/kits'
import type { SeqState } from './pattern'
import { renderBars } from './render'
import { wavBlob } from './wav'

export function exportFileName(bars: number, includeTake: boolean): string {
  return `tapbeat-${bars}-bar${bars === 1 ? '' : 's'}${includeTake ? '-with-jam' : ''}.wav`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Renders offline and downloads a WAV. Everything stays on the device. */
export async function exportWav(state: SeqState, kit: Kit, bars: number, includeTake: boolean): Promise<void> {
  const buffer = await renderBars({ state, kit, bars, includeTake })
  download(wavBlob(buffer), exportFileName(bars, includeTake))
}
