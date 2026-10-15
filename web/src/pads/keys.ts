// Keyboard play: a 4×4 block on the left of the keyboard, laid out like the
// pads (1 2 3 4 / Q W E R / A S D F / Z X C V). Matched on `code`, the
// physical key, so the block keeps its shape on any keyboard layout.

export const PAD_KEY_CODES = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR',
  'KeyA', 'KeyS', 'KeyD', 'KeyF',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV',
] as const

/** What each key is labelled on a QWERTY keyboard, for the pad hints. */
export const PAD_KEY_LABELS = PAD_KEY_CODES.map((code) => code.replace(/^(Digit|Key)/, ''))

interface KeyLike {
  code: string
  repeat?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  target?: EventTarget | null
}

function isTyping(target: EventTarget | null | undefined): boolean {
  if (!target || !(target as Element).tagName) return false
  const el = target as HTMLElement
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * The pad a key press plays, or -1. Ignores held-key repeats, shortcuts
 * (Ctrl/Cmd/Alt) and typing in form fields.
 */
export function padForKey(event: KeyLike): number {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return -1
  if (isTyping(event.target)) return -1
  return (PAD_KEY_CODES as readonly string[]).indexOf(event.code)
}
