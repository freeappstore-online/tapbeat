import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { ConfirmDialog } from '@freeappstore/sdk/ui'
import { getKit, type KitId } from '../audio/kits'
import type { Sequencer } from '../sequencer/sequencer'
import { BackupError, backupFileName, eraseAll, makeBackup, parseBackup, restoreBackup } from './backup'
import {
  findByName,
  type KeyValueStore,
  loadLibrary,
  MAX_NAME_LENGTH,
  newId,
  removeById,
  type SavedPattern,
  saveLibrary,
  snapshot,
  stateFrom,
  upsert,
} from './library'

interface SavesViewProps {
  store: KeyValueStore
  sequencer: Sequencer
  /** The kit in use now, and a way to switch to a save's kit. */
  kit: () => KitId
  setKit: (id: KitId) => void
  /** Opens the Privacy screen. */
  onPrivacy?: () => void
  /** For tests: a fixed clock. */
  now?: () => number
}

const plural = (n: number) => `${n} ${n === 1 ? 'pattern' : 'patterns'}`

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 id={id} className="font-semibold text-[var(--ink)]">
        {title}
      </h2>
      <div className="mt-2 grid gap-3 text-sm text-[var(--muted)]">{children}</div>
    </section>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Pending =
  | { kind: 'replace'; existing: SavedPattern; name: string }
  | { kind: 'load'; item: SavedPattern }
  | { kind: 'delete'; item: SavedPattern }
  | { kind: 'import'; patterns: SavedPattern[] }
  | { kind: 'erase' }

/** Save, name, load and delete patterns; back them all up as JSON and restore. */
export function SavesView({ store, sequencer, kit, setKit, onPrivacy, now = Date.now }: SavesViewProps) {
  const [list, setList] = useState(() => loadLibrary(store))
  const [name, setName] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const report = (ok: string | null, problem: string | null = null) => {
    setMessage(ok)
    setError(problem)
  }

  const write = (next: SavedPattern[], ok: string) => {
    if (saveLibrary(store, next)) {
      setList(next)
      report(ok)
    } else {
      report(null, "This browser wouldn't store it (its storage may be full or blocked). Export a backup to keep a copy.")
    }
  }

  const save = (id: string, saveName: string) => {
    write(upsert(list, snapshot(sequencer.getState(), kit(), saveName, id, now())), `Saved “${saveName.trim()}”.`)
    setName('')
  }

  const onSave = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return report(null, 'Give the pattern a name first.')
    const existing = findByName(list, trimmed)
    if (existing) setPending({ kind: 'replace', existing, name: trimmed })
    else save(newId(), trimmed)
  }

  const confirm = () => {
    if (!pending) return
    switch (pending.kind) {
      case 'replace':
        save(pending.existing.id, pending.name)
        break
      case 'load':
        sequencer.replace(stateFrom(pending.item))
        setKit(pending.item.kit)
        report(`Loaded “${pending.item.name}”.`)
        break
      case 'delete':
        write(removeById(list, pending.item.id), `Deleted “${pending.item.name}”.`)
        break
      case 'import':
        if (restoreBackup(store, pending.patterns)) {
          setList(loadLibrary(store))
          report(`Restored ${plural(pending.patterns.length)}.`)
        } else {
          report(null, "This browser wouldn't store the backup (its storage may be full or blocked).")
        }
        break
      case 'erase':
        eraseAll(store)
        setList([])
        report('All TapBeat data on this device was erased.')
        break
    }
    setPending(null)
  }

  const dialog = (() => {
    switch (pending?.kind) {
      case 'replace':
        return { title: `Replace “${pending.existing.name}”?`, message: 'A saved pattern already has this name. Saving replaces it with the beat you have now.', label: 'Replace' }
      case 'load':
        return { title: `Load “${pending.item.name}”?`, message: 'It replaces the beat you’re working on. Save that first if you want to keep it.', label: 'Load' }
      case 'delete':
        return { title: `Delete “${pending.item.name}”?`, message: 'This removes the saved pattern from this device. It can’t be undone.', label: 'Delete', danger: true }
      case 'import':
        return {
          title: 'Restore this backup?',
          message: `This replaces the ${plural(list.length)} saved on this device with the ${plural(pending.patterns.length)} in the file. It can’t be undone.`,
          label: 'Restore',
        }
      case 'erase':
        return {
          title: 'Erase all TapBeat data?',
          message: 'This deletes every saved pattern and the beat you’re working on from this device. It can’t be undone.',
          label: 'Erase everything',
          danger: true,
        }
      default:
        return null
    }
  })()

  return (
    <>
      <Section id="save-current" title="Save the current beat">
        <p>Both patterns (A and B), the kit, tempo, swing, mute and solo, and your recorded jam.</p>
        <form className="save-form" onSubmit={onSave}>
          <label className="sr-only" htmlFor="save-name">
            Pattern name
          </label>
          <input
            id="save-name"
            className="save-name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Name, e.g. Sunday groove"
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="save-button">
            Save
          </button>
        </form>
      </Section>

      {message && (
        <p role="status" className="mt-4 text-sm text-[var(--ink)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}

      <Section id="saved-list" title="Saved patterns">
        {list.length === 0 ? (
          <p>No saved patterns yet.</p>
        ) : (
          <ul className="saved-list">
            {list.map((item) => (
              <li key={item.id} className="saved-item">
                <div className="min-w-0">
                  <p className="saved-name">{item.name}</p>
                  <p className="text-xs">
                    {getKit(item.kit).name} · {item.bpm} BPM ·{' '}
                    {new Date(item.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button type="button" aria-label={`Load ${item.name}`} onClick={() => setPending({ kind: 'load', item })}>
                  Load
                </button>
                <button type="button" aria-label={`Delete ${item.name}`} onClick={() => setPending({ kind: 'delete', item })}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="backup" title="Backup">
        <p>
          Save all your patterns as one JSON file. Keep it somewhere safe and restore it here on this or
          another device. Saves live only in this browser, so clearing its data deletes them.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="save-button"
            onClick={() => {
              const at = now()
              const backup = makeBackup(store, at)
              download(backupFileName(at), JSON.stringify(backup, null, 2))
              report(`Exported ${plural(backup.patterns.length)}.`)
            }}
          >
            Export backup
          </button>
          <button type="button" className="quiet-button" onClick={() => fileInput.current?.click()}>
            Restore from file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Backup file to restore"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                setPending({ kind: 'import', patterns: parseBackup(await file.text()) })
                report(null)
              } catch (err) {
                report(null, err instanceof BackupError ? err.message : "That file couldn't be read.")
              }
            }}
          />
        </div>
        <p>
          <button type="button" className="text-[var(--danger)] underline" onClick={() => setPending({ kind: 'erase' })}>
            Erase all TapBeat data on this device
          </button>
        </p>
        <p>
          Everything here stays on this device.{' '}
          {onPrivacy && (
            <button type="button" className="text-[var(--ink)] underline" onClick={onPrivacy}>
              Read the privacy note
            </button>
          )}
        </p>
      </Section>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.label}
        variant={dialog?.danger ? 'danger' : 'default'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
