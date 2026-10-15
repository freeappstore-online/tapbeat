// The live audio engine: one AudioContext, created and unlocked on the first
// user gesture (mobile browsers start it suspended), feeding a master gain and
// a limiter so stacked hits never clip.

import { DEFAULT_KIT, getKit, type Kit, type KitId, playPad } from './kits'

/**
 * Builds the master chain on any context: gain → compressor (as a limiter) →
 * soft clipper → destination. Returns the node voices should connect to.
 * Shared with the offline renderer so exports sound like the live pads.
 */
export function createMasterChain(ctx: BaseAudioContext, volume = 0.8): GainNode {
  const master = ctx.createGain()
  master.gain.value = volume

  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  // The compressor's attack lets the first millisecond through; this catches
  // it. Linear up to 0.8, then eases towards a 0.98 ceiling.
  const clipper = ctx.createWaveShaper()
  clipper.curve = softClipCurve()

  master.connect(limiter).connect(clipper).connect(ctx.destination)
  return master
}

export function softClipCurve(size = 2048, knee = 0.8, ceiling = 0.98): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    const ax = Math.abs(x)
    const y = ax <= knee ? ax : knee + (ceiling - knee) * Math.tanh((ax - knee) / (ceiling - knee))
    curve[i] = Math.sign(x) * y
  }
  return curve
}

function defaultContext(): AudioContext {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new Ctor({ latencyHint: 'interactive' })
}

// Gestures that count as user activation. iOS unlocks on touchend, the rest
// on pointerdown; keydown covers keyboard drummers.
const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const

export interface EngineOptions {
  createContext?: () => AudioContext
  kit?: KitId
  volume?: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private input: GainNode | null = null
  private currentKit: Kit
  private readonly createContext: () => AudioContext
  private readonly volume: number

  constructor(options: EngineOptions = {}) {
    this.createContext = options.createContext ?? defaultContext
    this.currentKit = getKit(options.kit ?? DEFAULT_KIT)
    this.volume = options.volume ?? 0.8
  }

  /** The context, or null until the first gesture has created it. */
  get context(): AudioContext | null {
    return this.ctx
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0
  }

  get kit(): Kit {
    return this.currentKit
  }

  /** Switching kit is instant: every sound is generated per hit. */
  setKit(id: KitId) {
    this.currentKit = getKit(id)
  }

  setVolume(volume: number) {
    if (this.input && this.ctx) this.input.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01)
  }

  private ensure(): { ctx: AudioContext; input: GainNode } {
    if (!this.ctx || !this.input) {
      this.ctx = this.createContext()
      this.input = createMasterChain(this.ctx, this.volume)
    }
    return { ctx: this.ctx, input: this.input }
  }

  /**
   * Creates the context if needed and resumes it. Call from inside a user
   * gesture handler; resolves once the context is running (or has refused).
   */
  unlock(): Promise<void> {
    const { ctx } = this.ensure()
    // iOS only routes audio once something has played inside a gesture.
    const blip = ctx.createBufferSource()
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    blip.connect(ctx.destination)
    blip.start(0)
    if (ctx.state === 'running') return Promise.resolve()
    try {
      return ctx.resume().catch(() => {})
    } catch {
      return Promise.resolve()
    }
  }

  /**
   * Unlocks audio on the first gesture on `target`. Listeners stay until the
   * context is actually running, since some gestures (e.g. a scroll's touch)
   * don't count as activation. Returns a function that removes them.
   */
  unlockOnFirstGesture(target: EventTarget = window): () => void {
    const dispose = () => {
      for (const type of GESTURES) target.removeEventListener(type, handler, { capture: true })
    }
    const handler = () => {
      void this.unlock().then(() => {
        if (this.ctx?.state === 'running') dispose()
      })
    }
    for (const type of GESTURES) target.addEventListener(type, handler, { capture: true, passive: true })
    return dispose
  }

  /**
   * Plays a pad of the current kit. `time` is on the context clock; omit it
   * (or pass a past time) to play now. Returns the time the hit ends.
   */
  play(pad: number, time = 0, velocity = 1): number {
    const { ctx, input } = this.ensure()
    if (ctx.state !== 'running') void this.unlock()
    return playPad(ctx, input, this.currentKit, pad, Math.max(time, ctx.currentTime), velocity)
  }
}
