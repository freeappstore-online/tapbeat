// Synthesised drum voices. Every sound is built from oscillators, filtered
// noise and envelopes, so there are no samples to license or download.
//
// A voice is a pure function of (context, output, time, params): it schedules
// nodes on whatever BaseAudioContext it is given and returns the time at which
// the hit is silent. The same functions drive the live AudioContext and an
// OfflineAudioContext for WAV export.

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth'

export type Sound =
  | { voice: 'kick'; pitch: number; sweep: number; decay: number; click: number }
  | { voice: 'snare'; tone: number; decay: number; snap: number; cutoff: number }
  | { voice: 'clap'; decay: number; cutoff: number }
  | { voice: 'hat'; decay: number; cutoff: number; metallic: boolean }
  | { voice: 'tom'; pitch: number; decay: number }
  | { voice: 'rim'; pitch: number; decay: number }
  | { voice: 'cowbell'; pitch: number; decay: number }
  | { voice: 'bass'; note: number; wave: Wave; decay: number; cutoff: number }
  | { voice: 'chord'; notes: number[]; wave: Wave; decay: number; cutoff: number }

export type VoiceName = Sound['voice']

// Exponential ramps can't reach zero; this is about -80 dB.
const SILENT = 0.0001
// Sources keep running a little past the envelope so the tail isn't cut.
const TAIL = 0.02

/** MIDI note number to frequency in Hz (A4 = 69 = 440 Hz). */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

/** A gain node shaped as a fast attack and an exponential decay. */
function envelope(ctx: BaseAudioContext, time: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(SILENT, time)
  g.gain.linearRampToValueAtTime(Math.max(peak, SILENT), time + attack)
  g.gain.exponentialRampToValueAtTime(SILENT, time + attack + decay)
  return g
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = q
  return f
}

function oscillator(ctx: BaseAudioContext, type: Wave, frequency: number): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = frequency
  return o
}

// One second of white noise per context, looped. Seeded so renders (and tests)
// are repeatable.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()

function noise(ctx: BaseAudioContext): AudioBufferSourceNode {
  let buffer = noiseBuffers.get(ctx)
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = 0x2f6b1d3
    for (let i = 0; i < data.length; i++) {
      // xorshift32
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1
    }
    noiseBuffers.set(ctx, buffer)
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function run(source: AudioScheduledSourceNode, time: number, end: number) {
  source.start(time)
  source.stop(end + TAIL)
}

type Voice<S extends Sound> = (ctx: BaseAudioContext, out: AudioNode, time: number, s: S, v: number) => number

const kick: Voice<Extract<Sound, { voice: 'kick' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.002 + s.decay
  const body = oscillator(ctx, 'sine', s.pitch * 3)
  body.frequency.setValueAtTime(s.pitch * 3, time)
  body.frequency.exponentialRampToValueAtTime(s.pitch, time + s.sweep)
  body.connect(envelope(ctx, time, 0.75 * v, 0.002, s.decay)).connect(out)
  run(body, time, end)
  if (s.click > 0) {
    const click = noise(ctx)
    click.connect(filter(ctx, 'highpass', 2500)).connect(envelope(ctx, time, 0.2 * s.click * v, 0.001, 0.012)).connect(out)
    run(click, time, time + 0.015)
  }
  return end
}

const snare: Voice<Extract<Sound, { voice: 'snare' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.001 + s.decay
  const body = oscillator(ctx, 'triangle', s.tone)
  body.frequency.setValueAtTime(s.tone * 1.5, time)
  body.frequency.exponentialRampToValueAtTime(s.tone, time + 0.03)
  const bodyDecay = Math.min(s.decay, 0.12)
  body.connect(envelope(ctx, time, 0.4 * v, 0.001, bodyDecay)).connect(out)
  run(body, time, time + 0.001 + bodyDecay)
  const rattle = noise(ctx)
  rattle.connect(filter(ctx, 'highpass', s.cutoff)).connect(envelope(ctx, time, 0.5 * s.snap * v, 0.001, s.decay)).connect(out)
  run(rattle, time, end)
  return end
}

const clap: Voice<Extract<Sound, { voice: 'clap' }>> = (ctx, out, time, s, v) => {
  // Three quick bursts then a tail, like several hands landing slightly apart.
  const peak = 1.6 * v
  const g = ctx.createGain()
  g.gain.setValueAtTime(SILENT, time)
  for (const offset of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(SILENT, time + offset)
    g.gain.linearRampToValueAtTime(peak, time + offset + 0.001)
    g.gain.exponentialRampToValueAtTime(peak * 0.15, time + offset + 0.01)
  }
  g.gain.setValueAtTime(SILENT, time + 0.033)
  g.gain.linearRampToValueAtTime(peak, time + 0.034)
  g.gain.exponentialRampToValueAtTime(SILENT, time + 0.034 + s.decay)
  const end = time + 0.034 + s.decay
  const src = noise(ctx)
  src.connect(filter(ctx, 'bandpass', s.cutoff, 1.2)).connect(g).connect(out)
  run(src, time, end)
  return end
}

// The 808 hat: six detuned square waves, which sound metallic once filtered.
const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21]

const hat: Voice<Extract<Sound, { voice: 'hat' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.001 + s.decay
  const env = envelope(ctx, time, 0.4 * v, 0.001, s.decay)
  const hp = filter(ctx, 'highpass', s.cutoff)
  hp.connect(env).connect(out)
  if (s.metallic) {
    const bp = filter(ctx, 'bandpass', 10000, 0.8)
    const mix = ctx.createGain()
    mix.gain.value = 3 / HAT_RATIOS.length
    mix.connect(bp).connect(hp)
    for (const ratio of HAT_RATIOS) {
      const o = oscillator(ctx, 'square', 40 * ratio)
      o.connect(mix)
      run(o, time, end)
    }
  } else {
    const src = noise(ctx)
    src.connect(hp)
    run(src, time, end)
  }
  return end
}

const tom: Voice<Extract<Sound, { voice: 'tom' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.002 + s.decay
  const o = oscillator(ctx, 'sine', s.pitch)
  o.frequency.setValueAtTime(s.pitch * 1.6, time)
  o.frequency.exponentialRampToValueAtTime(s.pitch, time + s.decay * 0.5)
  o.connect(envelope(ctx, time, 0.75 * v, 0.002, s.decay)).connect(out)
  run(o, time, end)
  return end
}

const rim: Voice<Extract<Sound, { voice: 'rim' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.001 + s.decay
  const env = envelope(ctx, time, 0.5 * v, 0.001, s.decay)
  const hp = filter(ctx, 'highpass', 600)
  hp.connect(env).connect(out)
  for (const [type, freq] of [['triangle', s.pitch], ['square', s.pitch * 0.5]] as const) {
    const o = oscillator(ctx, type, freq)
    const g = ctx.createGain()
    g.gain.value = 0.5
    o.connect(g).connect(hp)
    run(o, time, end)
  }
  return end
}

const cowbell: Voice<Extract<Sound, { voice: 'cowbell' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.001 + s.decay
  const bp = filter(ctx, 'bandpass', s.pitch * 1.5, 1.5)
  bp.connect(envelope(ctx, time, 0.6 * v, 0.001, s.decay)).connect(out)
  // The 808 cowbell's two squares sit roughly a fifth apart (540/800 Hz).
  for (const freq of [s.pitch, s.pitch * 1.48]) {
    const o = oscillator(ctx, 'square', freq)
    const g = ctx.createGain()
    g.gain.value = 0.5
    o.connect(g).connect(bp)
    run(o, time, end)
  }
  return end
}

const bass: Voice<Extract<Sound, { voice: 'bass' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.005 + s.decay
  const lp = filter(ctx, 'lowpass', s.cutoff, 2)
  lp.frequency.setValueAtTime(s.cutoff * 3, time)
  lp.frequency.exponentialRampToValueAtTime(s.cutoff, time + s.decay * 0.5)
  lp.connect(envelope(ctx, time, 0.6 * v, 0.005, s.decay)).connect(out)
  const o = oscillator(ctx, s.wave, midiToHz(s.note))
  o.connect(lp)
  run(o, time, end)
  return end
}

const chord: Voice<Extract<Sound, { voice: 'chord' }>> = (ctx, out, time, s, v) => {
  const end = time + 0.01 + s.decay
  const lp = filter(ctx, 'lowpass', s.cutoff)
  lp.connect(envelope(ctx, time, 0.55 * v, 0.01, s.decay)).connect(out)
  const mix = ctx.createGain()
  mix.gain.value = 1 / s.notes.length
  mix.connect(lp)
  for (const note of s.notes) {
    const o = oscillator(ctx, s.wave, midiToHz(note))
    o.connect(mix)
    run(o, time, end)
  }
  return end
}

const VOICES: { [K in VoiceName]: Voice<Extract<Sound, { voice: K }>> } = {
  kick,
  snare,
  clap,
  hat,
  tom,
  rim,
  cowbell,
  bass,
  chord,
}

/**
 * Schedules one hit of `sound` at `time` (seconds on the context's clock) into
 * `out`, scaled by `velocity` (0–1). Returns the time at which it is silent.
 */
export function playSound(ctx: BaseAudioContext, out: AudioNode, sound: Sound, time: number, velocity = 1): number {
  const v = Math.min(Math.max(velocity, 0), 1)
  const voice = VOICES[sound.voice] as Voice<Sound>
  return voice(ctx, out, time, sound, v)
}
