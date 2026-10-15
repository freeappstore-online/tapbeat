import { expect, type Page, test as base } from '@playwright/test'

// Every page gets a probe: each oscillator or buffer source started is logged
// (live or offline context, start time, frequency), and the live AudioContext
// is kept, so tests can check what was actually played.
export interface Probe {
  starts: { offline: boolean; type: string; time: number; freq: number | null }[]
  ctx: AudioContext | null
  /** Pads that flashed, by label, in order (the flash itself only lasts 140 ms). */
  flashes: string[]
}

declare global {
  interface Window {
    __probe: Probe
  }
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      const probe: Probe = { starts: [], ctx: null, flashes: [] }
      window.__probe = probe
      // flash() removes then re-adds the class (to restart the animation): one
      // batch of records per hit, so count each pad once per batch.
      new MutationObserver((records) => {
        const lit = new Set<Element>()
        for (const r of records) {
          const el = r.target as Element
          if (el.classList.contains('pad-hit') && !lit.has(el)) {
            lit.add(el)
            probe.flashes.push(el.getAttribute('aria-label') ?? '')
          }
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
      for (const Node of [OscillatorNode, AudioBufferSourceNode]) {
        const start = Node.prototype.start
        Node.prototype.start = function (this: AudioScheduledSourceNode, ...args: [number?, number?, number?]) {
          probe.starts.push({
            offline: this.context instanceof OfflineAudioContext,
            type: this.constructor.name,
            time: args[0] ?? 0,
            freq: this instanceof OscillatorNode ? this.frequency.value : null,
          })
          return start.apply(this, args as [number?])
        } as typeof start
      }
      const Live = window.AudioContext
      window.AudioContext = class extends Live {
        constructor(options?: AudioContextOptions) {
          super(options)
          probe.ctx = this
        }
      }
    })
    await use(new App(page))
  },
})

export { expect }

export class App {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async open(path = '/') {
    await this.page.goto(path)
    await expect(this.page.locator('main')).toBeVisible()
  }

  /** Switches screen in-app, the way the nav does, keeping state. */
  async go(path: string) {
    await this.page.evaluate((to) => {
      history.pushState(null, '', to)
      dispatchEvent(new PopStateEvent('popstate'))
    }, path)
  }

  /** Live (not offline-render) sources started so far. */
  liveStarts() {
    return this.page.evaluate(() => window.__probe.starts.filter((s) => !s.offline))
  }

  /** Pad names that have flashed so far. */
  flashes() {
    return this.page.evaluate(() => window.__probe.flashes.map((label) => label.replace(/ \(key .*\)$/, '')))
  }

  audioState() {
    return this.page.evaluate(() => window.__probe.ctx?.state ?? null)
  }

  pad(name: string) {
    return this.page.getByRole('button', { name: new RegExp(`^${name} \\(key`) })
  }

  step(n: number) {
    return this.page.getByRole('button', { name: `Step ${n}`, exact: true })
  }
}
