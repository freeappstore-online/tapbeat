import { describe, expect, it } from 'vitest'
import { initialState } from '../sequencer/pattern'
import { BACKUP_FORMAT, BackupError, backupFileName, eraseAll, makeBackup, parseBackup, restoreBackup } from './backup'
import { busyState, memoryStore } from './testing'
import { LIBRARY_KEY, loadLibrary, saveLibrary, snapshot } from './library'
import { loadSession, saveSession, SESSION_KEY } from './session'

function library() {
  return [
    snapshot(busyState(), 'lofi', 'Late night', 'id-1', Date.UTC(2026, 9, 1)),
    snapshot(initialState(), '808', 'Starter', 'id-2', Date.UTC(2026, 9, 2)),
    snapshot({ ...busyState(), take: null, pattern: 'B' }, 'electro', 'Électro « B »', 'id-3', Date.UTC(2026, 9, 3)),
  ]
}

describe('backup round trip', () => {
  it('export → clear → import restores every pattern exactly', () => {
    const store = memoryStore()
    saveLibrary(store, library())
    const before = loadLibrary(store)
    expect(before).toHaveLength(3)

    const file = JSON.stringify(makeBackup(store, Date.UTC(2026, 9, 16)), null, 2)
    eraseAll(store)
    expect(loadLibrary(store)).toEqual([])

    expect(restoreBackup(store, parseBackup(file))).toBe(true)
    expect(loadLibrary(store)).toEqual(before)
  })

  it('restores onto a different device (an empty store)', () => {
    const source = memoryStore()
    saveLibrary(source, library())
    const target = memoryStore()
    restoreBackup(target, parseBackup(JSON.stringify(makeBackup(source, 0))))
    expect(loadLibrary(target)).toEqual(loadLibrary(source))
  })

  it('labels the file and names it by date', () => {
    const backup = makeBackup(memoryStore(), Date.UTC(2026, 9, 16, 12))
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-10-16T12:00:00.000Z', patterns: [] })
    expect(backupFileName(new Date(2026, 9, 16, 23, 30).getTime())).toBe('tapbeat-backup-2026-10-16.json')
  })
})

describe('parseBackup validation', () => {
  const valid = () => JSON.parse(JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '', patterns: library() }))

  it.each([
    ['not JSON', '{oops', /isn't valid JSON/],
    ['another app', JSON.stringify({ format: 'fastclock-backup', version: 1, fasts: [] }), /isn't a TapBeat backup/],
    ['a newer version', JSON.stringify({ ...valid(), version: 2 }), /newer version/],
    ['a damaged pattern', JSON.stringify({ ...valid(), patterns: [...valid().patterns, { name: 'x' }] }), /damaged/],
    ['a duplicate id', JSON.stringify({ ...valid(), patterns: [valid().patterns[0], valid().patterns[0]] }), /same pattern twice/],
  ])('rejects %s, all or nothing', (_, text, message) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
    expect(() => parseBackup(text)).toThrow(message)
  })

  it('accepts an empty backup', () => {
    expect(parseBackup(JSON.stringify({ ...valid(), patterns: [] }))).toEqual([])
  })
})

describe('session', () => {
  it('keeps the work in progress and kit between visits', () => {
    const store = memoryStore()
    expect(loadSession(store)).toBeNull()
    const state = { ...busyState(), playing: true, recording: true }
    saveSession(store, state, 'acoustic')
    const session = loadSession(store)!
    expect(session.kit).toBe('acoustic')
    expect(session.state.patterns).toEqual(state.patterns)
    expect(session.state.take).toEqual(state.take)
    expect(session.state).toMatchObject({ bpm: 137, playing: false, recording: false })
  })

  it('ignores a damaged session and survives storage errors', () => {
    const store = memoryStore()
    store.setItem(SESSION_KEY, '{"broken":')
    expect(loadSession(store)).toBeNull()
    const refusing = { ...store, setItem: () => { throw new Error('quota') } }
    expect(() => saveSession(refusing, initialState(), '808')).not.toThrow()
  })

  it('is erased with everything else', () => {
    const store = memoryStore()
    saveSession(store, initialState(), '808')
    saveLibrary(store, library())
    eraseAll(store)
    expect(store.getItem(SESSION_KEY)).toBeNull()
    expect(store.getItem(LIBRARY_KEY)).toBeNull()
  })
})
