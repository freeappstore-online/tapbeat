// Backups: every saved pattern as one JSON file, and restoring from one.
// All local; nothing here touches the network.

import { type KeyValueStore, isSavedPattern, LIBRARY_KEY, loadLibrary, type SavedPattern, saveLibrary } from './library'
import { SESSION_KEY } from './session'

export const BACKUP_FORMAT = 'tapbeat-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  patterns: SavedPattern[]
}

export function makeBackup(store: KeyValueStore, now: number): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    patterns: loadLibrary(store),
  }
}

/** Named by the local date: the day on the person's calendar, not UTC's. */
export function backupFileName(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tapbeat-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

export class BackupError extends Error {}

/**
 * Reads a backup file's text. All or nothing: throws BackupError, with a
 * message fit to show the user, if anything in it is missing or damaged.
 */
export function parseBackup(text: string): SavedPattern[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a TapBeat backup (it isn't valid JSON).")
  }
  const b = data as Partial<Backup> | null
  if (typeof b !== 'object' || b === null || b.format !== BACKUP_FORMAT || !Array.isArray(b.patterns)) {
    throw new BackupError("That file isn't a TapBeat backup.")
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of TapBeat. Reload the app and try again.')
  }
  if (!b.patterns.every(isSavedPattern)) {
    throw new BackupError('Some patterns in that backup are damaged, so nothing was restored.')
  }
  if (new Set(b.patterns.map((p) => p.id)).size !== b.patterns.length) {
    throw new BackupError('That backup lists the same pattern twice, so nothing was restored.')
  }
  return b.patterns
}

/** Replaces the saved patterns on this device with the backup's. */
export function restoreBackup(store: KeyValueStore, patterns: readonly SavedPattern[]): boolean {
  return saveLibrary(store, patterns)
}

/** Deletes every saved pattern and the work in progress. */
export function eraseAll(store: KeyValueStore) {
  store.removeItem(LIBRARY_KEY)
  store.removeItem(SESSION_KEY)
}
