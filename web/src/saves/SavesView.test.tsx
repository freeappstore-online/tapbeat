// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no matchMedia; the SDK's UI reads it (theme, motion) when it loads.
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
})
import type { KitId } from '../audio/kits'
import type { Timer } from '../audio/scheduler'
import { Sequencer } from '../sequencer/sequencer'
import Privacy from '../Privacy'
import { busyState, memoryStore } from './testing'
import { loadLibrary } from './library'
import { SavesView } from './SavesView'

function setup() {
  const store = memoryStore()
  const timer: Timer = { set: () => 1, clear: () => {} }
  const sequencer = new Sequencer({ clock: () => 0, play: () => {}, timer, initial: busyState() })
  let kit: KitId = 'lofi'
  const setKit = vi.fn((id: KitId) => {
    kit = id
  })
  const onPrivacy = vi.fn()
  let clock = Date.UTC(2026, 9, 16)
  render(
    <SavesView store={store} sequencer={sequencer} kit={() => kit} setKit={setKit} onPrivacy={onPrivacy} now={() => clock++} />,
  )
  return { store, sequencer, setKit, onPrivacy }
}

function saveAs(name: string) {
  fireEvent.change(screen.getByLabelText('Pattern name'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

const confirmDialog = (label: string) => {
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

// Downloads go through an object URL; capture the Blob instead.
let downloads: Blob[] = []
beforeEach(() => {
  downloads = []
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloads.push(blob)
    return 'blob:test'
  })
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('SavesView', () => {
  it('saves the current beat under a name, with kit and tempo', () => {
    const { store } = setup()
    expect(screen.getByText('No saved patterns yet.')).toBeTruthy()
    saveAs('Late night')
    expect(screen.getByRole('status').textContent).toBe('Saved “Late night”.')
    const [saved] = loadLibrary(store)
    expect(saved).toMatchObject({ name: 'Late night', kit: 'lofi', bpm: 137 })
    expect(screen.getByText('Lo-fi · 137 BPM', { exact: false })).toBeTruthy()
  })

  it('asks for a name', () => {
    const { store } = setup()
    saveAs('   ')
    expect(screen.getByRole('alert').textContent).toMatch(/name/)
    expect(loadLibrary(store)).toEqual([])
  })

  it('confirms before replacing a save with the same name', () => {
    const { store, sequencer } = setup()
    saveAs('Groove')
    sequencer.setBpm(90)
    saveAs('groove')
    expect(screen.getByRole('dialog').textContent).toMatch(/Replace “Groove”/)
    confirmDialog('Replace')
    const list = loadLibrary(store)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'groove', bpm: 90 })
  })

  it('loads a save after confirming, kit included', () => {
    const { sequencer, setKit } = setup()
    saveAs('Keep me')
    sequencer.clear()
    sequencer.setBpm(60)
    fireEvent.click(screen.getByRole('button', { name: 'Load Keep me' }))
    confirmDialog('Load')
    expect(sequencer.getState().bpm).toBe(137)
    expect(sequencer.getState().patterns.A).toEqual(busyState().patterns.A)
    expect(setKit).toHaveBeenCalledWith('lofi')
  })

  it('deletes after confirming, and Cancel keeps it', () => {
    const { store } = setup()
    saveAs('Doomed')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Doomed' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(loadLibrary(store)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Doomed' }))
    confirmDialog('Delete')
    expect(loadLibrary(store)).toEqual([])
  })

  it('exports all patterns, then imports them back after a confirmation (round trip)', async () => {
    const { store } = setup()
    saveAs('One')
    saveAs('Two')
    const before = loadLibrary(store)

    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }))
    expect(downloads).toHaveLength(1)
    const file = new File([await downloads[0].text()], 'tapbeat-backup.json', { type: 'application/json' })

    fireEvent.click(screen.getByRole('button', { name: 'Erase all TapBeat data on this device' }))
    confirmDialog('Erase everything')
    expect(loadLibrary(store)).toEqual([])
    expect(screen.getByText('No saved patterns yet.')).toBeTruthy()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Backup file to restore'), { target: { files: [file] } })
    })
    expect(screen.getByRole('dialog').textContent).toMatch(/replaces the 0 patterns saved on this device with the 2 patterns/)
    confirmDialog('Restore')
    expect(loadLibrary(store)).toEqual(before)
    expect(screen.getByRole('button', { name: 'Load One' })).toBeTruthy()
  })

  it('refuses a damaged backup without touching saves', async () => {
    const { store } = setup()
    saveAs('Safe')
    const bad = new File(['{"format":"tapbeat-backup","version":1,"patterns":[{"name":1}]}'], 'b.json')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Backup file to restore'), { target: { files: [bad] } })
    })
    expect(screen.getByRole('alert').textContent).toMatch(/damaged/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(loadLibrary(store).map((s) => s.name)).toEqual(['Safe'])
  })

  it('links to the privacy note', () => {
    const { onPrivacy } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Read the privacy note' }))
    expect(onPrivacy).toHaveBeenCalled()
  })
})

describe('Privacy', () => {
  it('shows the privacy note: on-device only, analytics, no account', () => {
    render(<Privacy />)
    const note = screen.getByRole('region', { name: 'Your beats stay on this device' })
    expect(note.textContent).toMatch(/Nothing you play or record leaves this device/)
    expect(note.textContent).toMatch(/never uses the microphone/)
    expect(note.textContent).toMatch(/store analytics script/)
    expect(note.textContent).toMatch(/Cloudflare Web Analytics/)
    expect(note.textContent).toMatch(/No account is needed/)
  })
})
