// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PAD_NAMES } from '../audio/kits'
import { PadGrid } from './PadGrid'

function setup() {
  const hits: number[] = []
  render(<PadGrid names={PAD_NAMES} onHit={(pad) => hits.push(pad)} />)
  const pads = screen.getAllByRole('button')
  return { hits, pads }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PadGrid', () => {
  it('renders 16 labelled pads in a group', () => {
    const { pads } = setup()
    expect(screen.getByRole('group', { name: 'Drum pads' })).toBeTruthy()
    expect(pads).toHaveLength(16)
    expect(screen.getByRole('button', { name: 'Kick (key 1)' })).toBe(pads[0])
    expect(screen.getByRole('button', { name: 'Open hat (key Q)' })).toBe(pads[4])
    expect(screen.getByRole('button', { name: 'Chord 3 (key V)' })).toBe(pads[15])
    expect(pads[4].getAttribute('aria-keyshortcuts')).toBe('Q')
  })

  it('tells the CSS where the grid starts so it can fit the viewport', () => {
    setup()
    const grid = screen.getByRole('group', { name: 'Drum pads' })
    expect(grid.style.getPropertyValue('--pad-top')).toMatch(/^\d+px$/)
  })

  it('plays on pointerdown, before the finger lifts', () => {
    const { hits, pads } = setup()
    fireEvent.pointerDown(pads[0], { pointerId: 1, pointerType: 'touch' })
    expect(hits).toEqual([0])
  })

  it('plays two simultaneous touches on different pads', () => {
    const { hits, pads } = setup()
    fireEvent.pointerDown(pads[0], { pointerId: 1, pointerType: 'touch', isPrimary: true })
    fireEvent.pointerDown(pads[3], { pointerId: 2, pointerType: 'touch', isPrimary: false })
    expect(hits).toEqual([0, 3])
    fireEvent.pointerUp(pads[0], { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(pads[3], { pointerId: 2, pointerType: 'touch' })
    expect(hits).toEqual([0, 3])
  })

  it('does not double-trigger on the click that follows a touch or mouse press', () => {
    const { hits, pads } = setup()
    fireEvent.pointerDown(pads[1], { pointerId: 1, pointerType: 'touch' })
    fireEvent.click(pads[1], { detail: 1 })
    fireEvent.pointerDown(pads[2], { pointerId: 2, pointerType: 'mouse', button: 0 })
    fireEvent.mouseDown(pads[2])
    fireEvent.click(pads[2], { detail: 1 })
    expect(hits).toEqual([1, 2])
  })

  it('ignores right and middle mouse buttons', () => {
    const { hits, pads } = setup()
    fireEvent.pointerDown(pads[0], { pointerType: 'mouse', button: 2 })
    fireEvent.pointerDown(pads[0], { pointerType: 'mouse', button: 1 })
    expect(hits).toEqual([])
  })

  it('cancels the default on pointerdown so a tap cannot scroll, select or emulate mouse events', () => {
    const { pads } = setup()
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })
    pads[5].dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('plays a click with no pointer (keyboard or screen reader activation)', () => {
    const { hits, pads } = setup()
    fireEvent.click(pads[9], { detail: 0 })
    expect(hits).toEqual([9])
  })

  it('plays from the keyboard', () => {
    const { hits } = setup()
    fireEvent.keyDown(window, { code: 'Digit1', key: '1' })
    fireEvent.keyDown(window, { code: 'KeyQ', key: 'q' })
    fireEvent.keyDown(window, { code: 'KeyV', key: 'v' })
    fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', repeat: true })
    fireEvent.keyDown(window, { code: 'KeyP', key: 'p' })
    expect(hits).toEqual([0, 4, 15])
  })

  it('stops listening to the keyboard when unmounted', () => {
    const { hits } = setup()
    cleanup()
    fireEvent.keyDown(window, { code: 'Digit1' })
    expect(hits).toEqual([])
  })

  it('flashes the pad on every hit, then clears', () => {
    const { pads } = setup()
    fireEvent.pointerDown(pads[0], { pointerType: 'touch' })
    expect(pads[0].classList.contains('pad-hit')).toBe(true)
    fireEvent.keyDown(window, { code: 'KeyW' })
    expect(pads[5].classList.contains('pad-hit')).toBe(true)
    act(() => vi.advanceTimersByTime(100))
    // A repeat hit restarts the flash rather than letting the first one end it.
    fireEvent.pointerDown(pads[0], { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(100))
    expect(pads[0].classList.contains('pad-hit')).toBe(true)
    expect(pads[5].classList.contains('pad-hit')).toBe(false)
    act(() => vi.advanceTimersByTime(100))
    expect(pads[0].classList.contains('pad-hit')).toBe(false)
  })
})
