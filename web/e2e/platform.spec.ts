import { expect, test } from './fixtures'

const SCREENS = ['/', '/sequencer', '/saves', '/privacy', '/about']

/** WCAG contrast ratio of two CSS rgb() colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test.describe('themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every screen renders in the ${theme} theme`, async ({ app, page }) => {
      await page.emulateMedia({ colorScheme: theme })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await app.open('/')
      // The SDK toggle cycles system → light → dark; pick the theme explicitly.
      const toggle = page.getByRole('button', { name: /^Theme:/ })
      while ((await toggle.getAttribute('aria-label')) !== `Theme: ${theme}`) await toggle.click()
      if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')

      for (const screen of SCREENS) {
        await app.go(screen)
        await expect(page.locator('h1')).toBeVisible()
        // The theme tokens, resolved by the browser: paper behind, ink on top.
        const { paper, ink, scheme } = await page.evaluate(() => {
          const probe = document.createElement('div')
          probe.style.cssText = 'background: var(--paper); color: var(--ink)'
          document.body.append(probe)
          const cs = getComputedStyle(probe)
          const out = { paper: cs.backgroundColor, ink: cs.color, scheme: getComputedStyle(document.documentElement).colorScheme }
          probe.remove()
          return out
        })
        expect(scheme).toBe(theme)
        expect(paper).toBe(theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)')
        expect(ink).toBe(theme === 'dark' ? 'rgb(240, 240, 240)' : 'rgb(17, 17, 17)')
      }

      // Text on accent fills stays readable in both themes.
      await app.go('/')
      const play = page.getByRole('button', { name: 'Play' })
      const { color, bg } = await play.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { color: cs.color, bg: cs.backgroundColor }
      })
      expect(contrast(color, bg)).toBeGreaterThanOrEqual(3)
      expect(errors).toEqual([])
    })
  }
})

test.describe('PWA', () => {
  test('installs and plays with the network off', async ({ app, page, context }) => {
    await app.open('/')
    // Wait for the service worker to install and take control (precache done).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
      }
    })
    const manifest = await page.evaluate(async () => (await fetch('/manifest.json')).json())
    expect(manifest).toMatchObject({ name: 'TapBeat', display: 'standalone', start_url: '/' })

    await context.setOffline(true)
    await page.reload()
    await expect(app.pad('Kick')).toBeVisible()
    await app.pad('Kick').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 })
    await expect.poll(() => app.audioState()).toBe('running')

    // A screen never visited online still opens (navigation fallback), and the beat plays.
    await page.goto('/sequencer')
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('[data-playhead]')).toBeVisible()
    await page.getByRole('button', { name: 'Stop' }).click()

    // Self-hosted fonts come from the cache too.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)
    })
    expect(fonts.join(' ')).toMatch(/Manrope/)
    await context.setOffline(false)
  })
})
