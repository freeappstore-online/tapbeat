import { describe, expect, it } from 'vitest'
import { PAD_KEY_CODES, PAD_KEY_LABELS, padForKey } from './keys'

describe('padForKey', () => {
  it('maps the 4×4 key block to pads row by row', () => {
    expect(PAD_KEY_CODES).toHaveLength(16)
    expect(PAD_KEY_LABELS.join('')).toBe('1234QWERASDFZXCV')
    PAD_KEY_CODES.forEach((code, pad) => expect(padForKey({ code })).toBe(pad))
    expect(padForKey({ code: 'Digit1' })).toBe(0)
    expect(padForKey({ code: 'KeyR' })).toBe(7)
    expect(padForKey({ code: 'KeyV' })).toBe(15)
  })

  it('ignores other keys, held-key repeats and shortcuts', () => {
    expect(padForKey({ code: 'KeyP' })).toBe(-1)
    expect(padForKey({ code: 'Space' })).toBe(-1)
    expect(padForKey({ code: 'KeyQ', repeat: true })).toBe(-1)
    expect(padForKey({ code: 'KeyC', ctrlKey: true })).toBe(-1)
    expect(padForKey({ code: 'KeyR', metaKey: true })).toBe(-1)
    expect(padForKey({ code: 'KeyA', altKey: true })).toBe(-1)
  })

  it('ignores typing in form fields', () => {
    const fakeEl = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget
    expect(padForKey({ code: 'KeyQ', target: fakeEl('INPUT') })).toBe(-1)
    expect(padForKey({ code: 'KeyQ', target: fakeEl('TEXTAREA') })).toBe(-1)
    expect(padForKey({ code: 'KeyQ', target: fakeEl('DIV', true) })).toBe(-1)
    expect(padForKey({ code: 'KeyQ', target: fakeEl('BUTTON') })).toBe(4)
  })
})
