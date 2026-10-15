// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Timer } from '../audio/scheduler'
import { ExportPanel } from './ExportPanel'
import { JamBar } from './JamBar'
import { exportFileName } from './export'
import { Sequencer } from './sequencer'
import { SequencerView } from './SequencerView'

// A clock tests can move by hand.
const clock = { now: 0 }

function makeSequencer() {
  clock.now = 0
  const timer: Timer = { set: () => 1, clear: () => {} }
  return new Sequencer({ clock: () => clock.now, play: () => {}, timer })
}

afterEach(cleanup)

describe('JamBar', () => {
  it('records from the pads screen, starting playback and unlocking audio', () => {
    const sequencer = makeSequencer()
    const onBeforePlay = vi.fn()
    render(<JamBar sequencer={sequencer} onBeforePlay={onBeforePlay} />)
    expect(screen.getByText('Record a jam over the loop')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(onBeforePlay).toHaveBeenCalledOnce()
    expect(sequencer.getState()).toMatchObject({ playing: true, recording: true })
    expect(screen.getByRole('button', { name: 'Record' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Recording: play the pads')).toBeTruthy()

    clock.now = 0.5 // past the first step (at 0.05 s)
    sequencer.recordHit(3)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByText('Jam: 1 bar, loops with the pattern')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear jam' }))
    expect(sequencer.getState().take).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(sequencer.getState().playing).toBe(false)
  })
})

describe('ExportPanel', () => {
  it('exports the chosen number of bars, with the jam when there is one', async () => {
    const onExport = vi.fn(() => Promise.resolve())
    const onClose = vi.fn()
    render(<ExportPanel take={{ bars: 3, hits: [{ pad: 0, step: 0 }] }} onExport={onExport} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Export WAV' })).toBeTruthy()
    const length = screen.getByRole('combobox') as HTMLSelectElement
    expect(length.value).toBe('4') // shortest length that holds the 3-bar jam
    expect(document.activeElement).toBe(length)
    fireEvent.change(length, { target: { value: '8' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download' })))
    expect(onExport).toHaveBeenCalledWith(8, true)
    expect(onClose).toHaveBeenCalled()
  })

  it('exports the pattern alone when there is no jam', async () => {
    const onExport = vi.fn(() => Promise.resolve())
    render(<ExportPanel take={null} onExport={onExport} onClose={() => {}} />)
    const include = screen.getByRole('checkbox') as HTMLInputElement
    expect(include.disabled).toBe(true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download' })))
    expect(onExport).toHaveBeenCalledWith(4, false)
  })

  it('can leave the jam out', async () => {
    const onExport = vi.fn(() => Promise.resolve())
    render(<ExportPanel take={{ bars: 1, hits: [{ pad: 0, step: 0 }] }} onExport={onExport} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download' })))
    expect(onExport).toHaveBeenCalledWith(1, false)
  })

  it('shows an error and stays open if rendering fails', async () => {
    const onClose = vi.fn()
    render(<ExportPanel take={null} onExport={() => Promise.reject(new Error('no'))} onClose={onClose} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Download' })))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape and Cancel', () => {
    const onClose = vi.fn()
    render(<ExportPanel take={null} onExport={() => Promise.resolve()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('SequencerView record and export', () => {
  it('has Record, and Export opens the panel', () => {
    const sequencer = makeSequencer()
    render(<SequencerView sequencer={sequencer} now={() => 0} onExport={() => Promise.resolve()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(sequencer.getState().recording).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.getByRole('dialog', { name: 'Export WAV' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('exportFileName', () => {
  it('names the file by length and content', () => {
    expect(exportFileName(1, false)).toBe('tapbeat-1-bar.wav')
    expect(exportFileName(4, true)).toBe('tapbeat-4-bars-with-jam.wav')
  })
})
