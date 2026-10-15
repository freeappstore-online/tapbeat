import { useLayoutEffect, useRef } from 'react'

/**
 * Sets `--fit-top` on the element to where it starts on the page, so CSS can
 * give it exactly the viewport height left below (`100dvh - var(--fit-top)`).
 * Re-measured when anything above it (navbar, controls) or the window resizes.
 */
export function useFitTop<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => el.style.setProperty('--fit-top', `${Math.ceil(el.getBoundingClientRect().top + window.scrollY)}px`)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return ref
}
