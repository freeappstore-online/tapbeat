import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'

test.describe('pads', () => {
  test('a tap plays the pad, unlocking audio, with a hit flash', async ({ app }) => {
    await app.open('/')
    expect(await app.audioState()).toBeNull() // no AudioContext before the first tap
    await app.pad('Kick').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0 })
    await expect.poll(() => app.flashes()).toEqual(['Kick'])
    await expect.poll(() => app.audioState()).toBe('running')
    const starts = await app.liveStarts()
    expect(starts.some((s) => s.type === 'OscillatorNode')).toBe(true)
  })

  test('two simultaneous touches both sound', async ({ app, page, browserName }) => {
    test.skip(browserName !== 'chromium', 'uses the Chrome DevTools touch API')
    await app.open('/')
    const centre = async (name: string) => {
      const box = (await app.pad(name).boundingBox())!
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const [kick, tom] = [await centre('Kick'), await centre('Low tom')]
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...kick, id: 1 }, { ...tom, id: 2 }] })
    await expect.poll(() => app.flashes()).toEqual(['Kick', 'Low tom'])
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    // Kick body (sine) and low tom (sine): two oscillators, no double trigger from the touch's click.
    await expect.poll(async () => (await app.liveStarts()).filter((s) => s.type === 'OscillatorNode').length).toBe(2)
  })

  test('keyboard plays pads', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on the phone profile')
    await app.open('/')
    await page.keyboard.press('KeyW')
    await expect.poll(() => app.flashes()).toEqual(['Low tom'])
  })

  test('switching kit changes the sound', async ({ app, page }) => {
    await app.open('/')
    const kickPitch = async () => {
      const before = (await app.liveStarts()).length
      await app.pad('Kick').dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 })
      await expect.poll(async () => (await app.liveStarts()).length).toBeGreaterThan(before)
      return (await app.liveStarts()).slice(before).find((s) => s.type === 'OscillatorNode')!.freq
    }
    const k808 = await kickPitch()
    await page.getByRole('radio', { name: 'Electro' }).click()
    await expect(page.getByRole('radio', { name: 'Electro' })).toHaveAttribute('aria-checked', 'true')
    const electro = await kickPitch()
    expect(k808).toBeCloseTo(144) // 808 kick starts at 48 Hz × 3
    expect(electro).toBeCloseTo(135) // electro kick at 45 Hz × 3
  })
})

test.describe('sequencer', () => {
  test('program a pattern and play it, with the playhead moving', async ({ app, page }) => {
    await app.open('/sequencer')
    await page.getByRole('button', { name: 'Clear pattern A' }).click()
    await page.getByRole('radio', { name: /Low tom/ }).click()
    await app.step(1).click()
    await app.step(9).click()
    await expect(app.step(1)).toHaveAttribute('aria-pressed', 'true')

    const before = (await app.liveStarts()).length
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('[data-playhead]')).toBeVisible()
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      seen.add((await page.locator('[data-playhead]').textContent()) ?? '')
      await page.waitForTimeout(100)
    }
    expect(seen.size).toBeGreaterThan(3) // the playhead walks the steps
    await page.waitForTimeout(1500) // past step 9 at 100 BPM
    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.locator('[data-playhead]')).toHaveCount(0)

    // Only the low tom was programmed: one sine per hit, all the same pitch.
    const hits = (await app.liveStarts()).slice(before).filter((s) => s.type === 'OscillatorNode')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(new Set(hits.map((h) => h.freq)).size).toBe(1)
    // Scheduled ahead on the audio clock, a bar (16 steps × 0.15 s) ÷ 2 apart.
    expect(hits[1].time - hits[0].time).toBeCloseTo(1.2, 5)
  })

  test('A/B switch waits for the bar line', async ({ app, page }) => {
    await app.open('/sequencer')
    await page.getByRole('button', { name: 'Play' }).click()
    await page.getByRole('radio', { name: 'Pattern B' }).click()
    await expect(page.getByRole('radio', { name: 'Pattern B, starts at the next bar' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Pattern B' })).toHaveAttribute('aria-checked', 'true', { timeout: 4000 })
    await page.getByRole('button', { name: 'Stop' }).click()
  })

  test('export WAV downloads a valid file of the chosen length', async ({ app, page }) => {
    await app.open('/sequencer')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('combobox').selectOption('2')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()])
    expect(download.suggestedFilename()).toBe('tapbeat-2-bars.wav')
    const wav = readFileSync((await download.path())!)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt32LE(24)).toBe(44100)
    expect(wav.readUInt16LE(22)).toBe(2)
    expect(wav.readUInt16LE(34)).toBe(16)
    const frames = Math.round(2 * 16 * (60 / 100 / 4) * 44100) // 2 bars at 100 BPM
    expect(wav.readUInt32LE(40)).toBe(frames * 4)
    expect(wav.length).toBe(44 + frames * 4)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('record a jam over the loop and hear it replay', async ({ app, page }) => {
    await app.open('/sequencer')
    await page.getByRole('button', { name: 'Clear pattern A' }).click()
    await app.go('/')
    await page.getByRole('button', { name: 'Record' }).click()
    await page.waitForTimeout(400)
    await app.pad('Cowbell').dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Record' }).click()
    await expect(page.getByText('Jam: 1 bar, loops with the pattern')).toBeVisible()
    const before = (await app.liveStarts()).length
    await page.waitForTimeout(2600) // more than a bar: the cowbell comes round again
    const replayed = (await app.liveStarts()).slice(before).filter((s) => s.type === 'OscillatorNode')
    expect(replayed.length).toBeGreaterThanOrEqual(2) // the cowbell's two squares
    await page.getByRole('button', { name: 'Stop' }).click()
  })
})

test.describe('saves', () => {
  test('save, change, then load a pattern', async ({ app, page }) => {
    await app.open('/sequencer')
    await page.getByLabel('Tempo').fill('150')
    await app.go('/saves')
    await page.getByLabel('Pattern name').fill('E2E groove')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved “E2E groove”.')).toBeVisible()

    await app.go('/sequencer')
    await page.getByLabel('Tempo').fill('70')
    await page.getByRole('button', { name: 'Clear pattern A' }).click()
    await app.go('/saves')
    await page.getByRole('button', { name: 'Load E2E groove' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Load' }).click()
    await app.go('/sequencer')
    await expect(page.getByText('150 BPM')).toBeVisible()
    await expect(app.step(1)).toHaveAttribute('aria-pressed', 'true') // the starter kick is back
  })

  test('work in progress survives a reload', async ({ app, page }) => {
    await app.open('/sequencer')
    await app.step(3).click()
    await page.waitForTimeout(500) // autosave settles
    await page.reload()
    await expect(app.step(3)).toHaveAttribute('aria-pressed', 'true')
  })

  test('export JSON, erase, import: every pattern comes back', async ({ app, page }) => {
    await app.open('/saves')
    for (const name of ['One', 'Two', 'Three']) {
      await page.getByLabel('Pattern name').fill(name)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
    }
    const names = () => page.locator('.saved-name').allTextContents()
    const before = await names()
    expect(before).toEqual(['Three', 'Two', 'One'])

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()])
    const file = (await download.path())!
    expect(JSON.parse(readFileSync(file, 'utf8')).patterns).toHaveLength(3)

    await page.getByRole('button', { name: 'Erase all TapBeat data on this device' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Erase everything' }).click()
    await expect(page.getByText('No saved patterns yet.')).toBeVisible()

    await page.getByLabel('Backup file to restore').setInputFiles(file)
    await expect(page.getByRole('dialog')).toContainText('with the 3 patterns in the file')
    await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click()
    expect(await names()).toEqual(before)
  })
})

test.describe('privacy', () => {
  test('the privacy note is visible', async ({ app, page }) => {
    await app.open('/privacy')
    const note = page.getByRole('region', { name: 'Your beats stay on this device' })
    await expect(note).toBeVisible()
    await expect(note).toContainText('Nothing you play or record leaves this device')
    await expect(note).toContainText('No account is needed')
  })
})
