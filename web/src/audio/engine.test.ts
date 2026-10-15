import { OfflineAudioContext } from 'node-web-audio-api'
import { describe, expect, it } from 'vitest'
import { AudioEngine, softClipCurve } from './engine'

// An OfflineAudioContext standing in for the live one. It starts suspended,
// like a real context on a phone, and records resume() calls. `allowed` says
// whether a resume succeeds (browsers refuse outside a real user gesture).
function fakeContext(allowed: () => boolean = () => true) {
  const ctx = new OfflineAudioContext(2, 44100, 44100)
  let state: AudioContextState = 'suspended'
  const calls = { resume: 0 }
  Object.defineProperty(ctx, 'state', { get: () => state })
  Object.defineProperty(ctx, 'resume', {
    value: () => {
      calls.resume++
      if (!allowed()) return Promise.reject(new Error('not allowed'))
      state = 'running'
      return Promise.resolve()
    },
  })
  return { ctx: ctx as unknown as AudioContext, calls, render: () => ctx.startRendering() }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('AudioEngine', () => {
  it('creates no AudioContext until it is needed', () => {
    let created = 0
    const engine = new AudioEngine({
      createContext: () => {
        created++
        return fakeContext().ctx
      },
    })
    expect(engine.context).toBeNull()
    expect(engine.currentTime).toBe(0)
    expect(created).toBe(0)
  })

  it('creates and resumes the context on the first gesture, then stops listening', async () => {
    const fake = fakeContext()
    let created = 0
    const engine = new AudioEngine({
      createContext: () => {
        created++
        return fake.ctx
      },
    })
    const target = new EventTarget()
    engine.unlockOnFirstGesture(target)
    expect(created).toBe(0)

    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(created).toBe(1)
    expect(fake.calls.resume).toBe(1)
    expect(engine.context?.state).toBe('running')

    target.dispatchEvent(new Event('touchend'))
    target.dispatchEvent(new Event('keydown'))
    await flush()
    expect(created).toBe(1)
    expect(fake.calls.resume).toBe(1)
  })

  it('keeps listening if a gesture did not unlock the context', async () => {
    let allow = false
    const fake = fakeContext(() => allow)
    const engine = new AudioEngine({ createContext: () => fake.ctx })
    const target = new EventTarget()
    engine.unlockOnFirstGesture(target)

    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(engine.context?.state).toBe('suspended')

    allow = true
    target.dispatchEvent(new Event('touchend'))
    await flush()
    expect(engine.context?.state).toBe('running')
  })

  it('removes its listeners when disposed', async () => {
    let created = 0
    const engine = new AudioEngine({
      createContext: () => {
        created++
        return fakeContext().ctx
      },
    })
    const target = new EventTarget()
    const dispose = engine.unlockOnFirstGesture(target)
    dispose()
    target.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(created).toBe(0)
  })

  it('plays pads of the current kit through the master chain', async () => {
    const fake = fakeContext()
    const engine = new AudioEngine({ createContext: () => fake.ctx })
    await engine.unlock()
    engine.setKit('electro')
    expect(engine.kit.id).toBe('electro')
    const end = engine.play(0, 0.01)
    engine.play(1, 0.25)
    expect(end).toBeGreaterThan(0.01)
    const buffer = await fake.render()
    const samples = buffer.getChannelData(0)
    const max = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0)
    expect(max).toBeGreaterThan(0.05)
    expect(max).toBeLessThan(1)
  })

  it('ignores pads that do not exist', () => {
    const engine = new AudioEngine({ createContext: () => fakeContext().ctx })
    expect(engine.play(99, 0.5)).toBe(0.5)
  })
})

describe('softClipCurve', () => {
  it('is linear below the knee and never reaches full scale', () => {
    const curve = softClipCurve(2001)
    expect(curve[1000]).toBeCloseTo(0)
    expect(curve[1500]).toBeCloseTo(0.5)
    expect(curve[0]).toBeGreaterThan(-1)
    expect(curve[2000]).toBeLessThan(1)
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1])
  })
})
