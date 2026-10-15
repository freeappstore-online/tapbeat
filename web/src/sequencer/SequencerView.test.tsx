// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Timer } from '../audio/scheduler'
import { Sequencer } from './sequencer'
import { SequencerView } from './SequencerView'

function setup() {
  let now = 0
  const timer: Timer = { set: () => 1, clear: () => {} }
  const sequencer = new Sequencer({ clock: () => now, play: () => {}, timer })
  const onBeforePlay = vi.fn()
  const audition = vi.fn()
  render(<SequencerView sequencer={sequencer} now={() => now} onBeforePlay={onBeforePlay} audition={audition} />)
  return {
    sequencer,
    onBeforePlay,
    audition,
    setNow: (t: number) => {
      now = t
    },
  }
}

const step = (n: number) => screen.getByRole('button', { name: `Step ${n}` })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SequencerView', () => {
  it('shows the selected pad’s 16 steps and toggles them on tap', () => {
    const { sequencer } = setup()
    expect(screen.getByRole('group', { name: 'Kick steps' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Step \d+$/ })).toHaveLength(16)
    expect(step(1).getAttribute('aria-pressed')).toBe('true') // starter beat
    fireEvent.click(step(2))
    expect(step(2).getAttribute('aria-pressed')).toBe('true')
    expect(sequencer.getState().patterns.A[0][1]).toBe(true)
  })

  it('picks the pad to edit (and lets you hear it when stopped)', () => {
    const { sequencer, audition } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /Snare/ }))
    expect(audition).toHaveBeenCalledWith(1)
    expect(screen.getByRole('group', { name: 'Snare steps' })).toBeTruthy()
    fireEvent.click(step(16))
    expect(sequencer.getState().patterns.A[1][15]).toBe(true)
  })

  it('mutes and solos the selected pad', () => {
    const { sequencer } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(sequencer.getState().mute[0]).toBe(true)
    expect(screen.getByRole('button', { name: 'Mute' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Solo' }))
    expect(sequencer.getState().solo[0]).toBe(true)
  })

  it('plays and stops, unlocking audio inside the tap', () => {
    const { sequencer, onBeforePlay } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onBeforePlay).toHaveBeenCalledOnce()
    expect(sequencer.getState().playing).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(sequencer.getState().playing).toBe(false)
  })

  it('switches patterns, queuing the switch while playing', () => {
    const { sequencer } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Pattern B' }))
    expect(sequencer.getState().pattern).toBe('B')
    expect(step(1).getAttribute('aria-pressed')).toBe('false') // B starts empty
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Pattern A' }))
    expect(screen.getByRole('radio', { name: 'Pattern A, starts at the next bar' })).toBeTruthy()
  })

  it('clears the current pattern', () => {
    const { sequencer } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Clear pattern A' }))
    expect(sequencer.getState().patterns.A.flat().some(Boolean)).toBe(false)
  })

  it('sets tempo and swing', () => {
    const { sequencer } = setup()
    const [tempo, swing] = screen.getAllByRole('slider')
    fireEvent.change(tempo, { target: { value: '140' } })
    fireEvent.change(swing, { target: { value: '50' } })
    expect(sequencer.getState()).toMatchObject({ bpm: 140, swing: 0.25 })
    expect(screen.getByText('140 BPM')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('highlights the step being heard', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const { setNow } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    // 100 BPM: a step is 0.15 s; the first lands at 0.05.
    setNow(0.05 + 0.15 * 0 + 0.01)
    act(() => vi.advanceTimersToNextFrame())
    expect(step(1).hasAttribute('data-playhead')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(document.querySelector('[data-playhead]')).toBeNull()
  })
})
