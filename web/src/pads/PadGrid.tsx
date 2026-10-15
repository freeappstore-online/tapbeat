import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { useFitTop } from '../useFitTop'
import { PAD_KEY_LABELS, padForKey } from './keys'

// Colour groups, by pad index: drums, hats, percussion, then bass and chords.
export const PAD_GROUPS = ['drum', 'drum', 'drum', 'hat', 'hat', 'perc', 'perc', 'perc', 'perc', 'perc', 'tone', 'tone', 'tone', 'tone', 'tone', 'tone']

const FLASH_MS = 140
const flashTimers = new WeakMap<HTMLElement, number>()

/** Restarts the pad's hit flash (CSS turns it into a colour change under reduced motion). */
export function flash(el: HTMLElement) {
  el.classList.remove('pad-hit')
  void el.offsetWidth // restart the animation on rapid repeat hits
  el.classList.add('pad-hit')
  window.clearTimeout(flashTimers.get(el))
  flashTimers.set(el, window.setTimeout(() => el.classList.remove('pad-hit'), FLASH_MS))
}

interface PadGridProps {
  /** One label per pad, in pad order. */
  names: readonly string[]
  /** Called the instant a pad is struck. */
  onHit: (pad: number) => void
}

/**
 * The 4×4 pads. Plays on pointerdown, so a touch sounds before the finger
 * lifts and every finger is its own pointer (multi-touch). The click that
 * follows a pointer press is ignored; clicks with no pointer (keyboard or a
 * screen reader activating the button) still play.
 */
export function PadGrid({ names, onHit }: PadGridProps) {
  // The grid takes exactly the height left in the viewport.
  const grid = useFitTop<HTMLDivElement>()
  const pads = useRef<(HTMLButtonElement | null)[]>([])
  const onHitRef = useRef(onHit)
  useEffect(() => {
    onHitRef.current = onHit
  }, [onHit])

  const hit = (pad: number) => {
    onHitRef.current(pad)
    const el = pads.current[pad]
    if (el) flash(el)
  }

  // Keyboard play while the grid is on screen. `hit` only reads refs, so the
  // listener needn't be rebound when it changes.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const pad = padForKey(event)
      if (pad < 0 || pad >= names.length) return
      event.preventDefault()
      hit(pad)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [names.length])

  const onPointerDown = (pad: number) => (event: PointerEvent<HTMLButtonElement>) => {
    // Primary button only for mice; touch and pen always count.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Stops the emulated mouse events and focus/text selection on a tap.
    event.preventDefault()
    hit(pad)
  }

  const onClick = (pad: number) => (event: MouseEvent<HTMLButtonElement>) => {
    // detail is the click count: 0 means no pointer was involved.
    if (event.detail === 0) hit(pad)
  }

  return (
    <div ref={grid} className="pad-grid" role="group" aria-label="Drum pads" onContextMenu={(e) => e.preventDefault()}>
      {names.map((name, pad) => (
        <button
          key={pad}
          ref={(el) => {
            pads.current[pad] = el
          }}
          type="button"
          className="pad"
          data-group={PAD_GROUPS[pad]}
          aria-label={PAD_KEY_LABELS[pad] ? `${name} (key ${PAD_KEY_LABELS[pad]})` : name}
          aria-keyshortcuts={PAD_KEY_LABELS[pad]}
          onPointerDown={onPointerDown(pad)}
          onClick={onClick(pad)}
        >
          <span className="pad-name">{name}</span>
          {PAD_KEY_LABELS[pad] && (
            <kbd className="pad-key" aria-hidden="true">
              {PAD_KEY_LABELS[pad]}
            </kbd>
          )}
        </button>
      ))}
    </div>
  )
}
