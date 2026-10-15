import { useEffect, useRef, useState } from 'react'
import type { Take } from './recorder'
import { EXPORT_BAR_CHOICES } from './render'

interface ExportPanelProps {
  take: Take | null
  onExport: (bars: number, includeTake: boolean) => Promise<void>
  onClose: () => void
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The shortest export that holds the whole take, or 4 bars of the loop. */
function defaultBars(take: Take | null): number {
  if (!take) return 4
  return EXPORT_BAR_CHOICES.find((n) => n >= take.bars) ?? EXPORT_BAR_CHOICES[EXPORT_BAR_CHOICES.length - 1]
}

/** A small modal: length in bars, with or without the recorded jam, then download. */
export function ExportPanel({ take, onExport, onClose }: ExportPanelProps) {
  const [bars, setBars] = useState(() => defaultBars(take))
  const [includeTake, setIncludeTake] = useState(take !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const first = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async () => {
    setBusy(true)
    setError(false)
    try {
      await onExport(bars, includeTake && take !== null)
      onClose()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="export-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="export-panel">
        <h2 id="export-title" className="display-font text-xl font-semibold">
          Export WAV
        </h2>
        <label className="export-row">
          <span>Length</span>
          <select ref={first} value={bars} onChange={(e) => setBars(Number(e.target.value))}>
            {EXPORT_BAR_CHOICES.map((n) => (
              <option key={n} value={n}>
                {plural(n, 'bar')}
              </option>
            ))}
          </select>
        </label>
        <label className="export-row">
          <input
            type="checkbox"
            checked={includeTake && take !== null}
            disabled={take === null}
            onChange={(e) => setIncludeTake(e.target.checked)}
          />
          <span>
            Include the recorded jam
            {take ? ` (${plural(take.bars, 'bar')}, looped)` : ' (record one first)'}
          </span>
        </label>
        <p className="text-sm text-[var(--muted)]">
          The pattern is rendered on this device as a 44.1 kHz WAV. Nothing is uploaded.
        </p>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            The export failed. Try a shorter length.
          </p>
        )}
        <div className="export-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="export-go" disabled={busy} onClick={run}>
            {busy ? 'Rendering…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
