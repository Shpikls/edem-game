/**
 * Procedural sound effects (Web Audio, no assets). Every sound is a few
 * oscillators / filtered noise bursts, so it is easy to tweak by ear.
 */

const MUTE_KEY = 'sound.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
// Storage may be blocked (private mode, sandboxed iframes): sound must not break the game.
const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* not persisted */
    }
  },
}
let muted = storage.get(MUTE_KEY) === '1'
const listeners = new Set<() => void>()
const lastPlayed = new Map<string, number>()

function audio(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  const comp = ctx.createDynamicsCompressor()
  comp.connect(ctx.destination)
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.6
  master.connect(comp)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

/** Browsers start audio only after a user gesture; call once at startup. */
export function initSound(): void {
  const unlock = () => {
    const c = audio()
    if (c && c.state === 'suspended' && !document.hidden) void c.resume()
  }
  // Older iOS Safari only unlocks audio on touchend/click.
  for (const type of ['pointerdown', 'touchend', 'click', 'keydown'])
    window.addEventListener(type, unlock, true)
  // Silence in background tabs (also required by Yandex Games).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  })
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  storage.set(MUTE_KEY, value ? '1' : '0')
  if (master && ctx)
    master.gain.setTargetAtTime(value ? 0 : 0.6, ctx.currentTime, 0.02)
  listeners.forEach((l) => l())
}

export function onMuteChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

interface ToneOpts {
  type?: OscillatorType
  f0: number
  f1?: number
  dur: number
  vol: number
  delay?: number
  attack?: number
  /** Optional lowpass cutoff. */
  lp?: number
}

function tone(o: ToneOpts) {
  const c = ctx!
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.f0, t0)
  if (o.f1 !== undefined)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur)
  const g = c.createGain()
  const attack = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(o.vol, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  let out: AudioNode = g
  osc.connect(g)
  if (o.lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lp
    g.connect(f)
    out = f
  }
  out.connect(master!)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

interface NoiseOpts {
  dur: number
  vol: number
  filter?: BiquadFilterType
  f0: number
  f1?: number
  q?: number
  delay?: number
  attack?: number
}

function noise(o: NoiseOpts) {
  const c = ctx!
  const t0 = c.currentTime + (o.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = o.filter ?? 'lowpass'
  f.Q.value = o.q ?? 1
  f.frequency.setValueAtTime(o.f0, t0)
  if (o.f1 !== undefined)
    f.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(o.vol, t0 + (o.attack ?? 0.004))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(f).connect(g).connect(master!)
  src.start(t0, Math.random() * 0.5)
  src.stop(t0 + o.dur + 0.02)
}

const arp = (
  notes: number[],
  step: number,
  type: OscillatorType,
  vol: number,
  len = step * 1.6,
) =>
  notes.forEach((f, i) =>
    tone({ type, f0: f, dur: len, vol, delay: i * step, lp: 4000 }),
  )

const SOUNDS = {
  // — shipyard —
  pick: () =>
    tone({ type: 'triangle', f0: 520, f1: 760, dur: 0.06, vol: 0.12 }),
  drop: () => {
    tone({ type: 'triangle', f0: 260, f1: 140, dur: 0.09, vol: 0.28 })
    noise({ f0: 1400, dur: 0.05, vol: 0.12 })
  },
  error: () => {
    tone({ type: 'square', f0: 150, dur: 0.08, vol: 0.08, lp: 1200 })
    tone({
      type: 'square',
      f0: 112,
      dur: 0.12,
      vol: 0.08,
      lp: 1200,
      delay: 0.09,
    })
  },
  rotate: () => {
    tone({ type: 'triangle', f0: 640, f1: 960, dur: 0.07, vol: 0.12 })
    noise({ filter: 'highpass', f0: 4000, dur: 0.04, vol: 0.05 })
  },
  buy: () => arp([988, 1319], 0.06, 'square', 0.07),
  sell: () => arp([1319, 988, 784], 0.05, 'square', 0.06),
  reroll: () =>
    noise({ filter: 'bandpass', f0: 600, f1: 3500, q: 3, dur: 0.22, vol: 0.2 }),
  repair: () => {
    for (let i = 0; i < 3; i++)
      noise({
        filter: 'highpass',
        f0: 2500,
        dur: 0.035,
        vol: 0.14,
        delay: i * 0.07,
      })
    tone({
      type: 'triangle',
      f0: 420,
      f1: 620,
      dur: 0.18,
      vol: 0.08,
      delay: 0.05,
    })
  },
  launch: () => {
    tone({
      type: 'sawtooth',
      f0: 90,
      f1: 260,
      dur: 0.45,
      vol: 0.12,
      lp: 900,
      attack: 0.05,
    })
    noise({
      filter: 'bandpass',
      f0: 300,
      f1: 1800,
      q: 2,
      dur: 0.45,
      vol: 0.12,
      attack: 0.08,
    })
  },
  click: () => tone({ type: 'triangle', f0: 880, dur: 0.04, vol: 0.08 }),

  // — battle (enemy = slightly lower) —
  laser: (enemy = false) =>
    tone({
      type: 'sawtooth',
      f0: enemy ? 1100 : 1500,
      f1: enemy ? 220 : 300,
      dur: 0.14,
      vol: 0.07,
      lp: 3500,
    }),
  machinegun: (enemy = false) => {
    noise({
      filter: 'bandpass',
      f0: enemy ? 1300 : 1800,
      q: 1.5,
      dur: 0.04,
      vol: 0.16,
    })
    tone({
      type: 'square',
      f0: enemy ? 160 : 200,
      f1: 70,
      dur: 0.035,
      vol: 0.06,
      lp: 1500,
    })
  },
  railgun: (enemy = false) => {
    tone({
      type: 'sawtooth',
      f0: enemy ? 1600 : 2200,
      f1: 90,
      dur: 0.25,
      vol: 0.1,
      lp: 5000,
    })
    noise({ filter: 'highpass', f0: 3000, dur: 0.08, vol: 0.1 })
    tone({ type: 'sine', f0: 90, f1: 45, dur: 0.2, vol: 0.25 })
  },
  missile: (enemy = false) =>
    noise({
      filter: 'bandpass',
      f0: enemy ? 500 : 650,
      f1: 1700,
      q: 2,
      dur: 0.5,
      vol: 0.14,
      attack: 0.05,
    }),
  hitHull: () => {
    noise({ f0: 1000, f1: 180, dur: 0.16, vol: 0.22 })
    tone({ type: 'sine', f0: 120, f1: 60, dur: 0.12, vol: 0.18 })
  },
  hitShield: () => {
    tone({ type: 'sine', f0: 700, f1: 1100, dur: 0.12, vol: 0.06 })
    noise({ filter: 'highpass', f0: 3500, dur: 0.08, vol: 0.05 })
  },
  boom: () => {
    noise({ f0: 1400, f1: 90, dur: 0.6, vol: 0.4 })
    tone({ type: 'sine', f0: 80, f1: 35, dur: 0.6, vol: 0.4 })
  },
  explosion: () => {
    noise({ f0: 1800, f1: 60, dur: 1.6, vol: 0.55, attack: 0.01 })
    tone({ type: 'sine', f0: 70, f1: 28, dur: 1.3, vol: 0.5 })
    noise({
      filter: 'bandpass',
      f0: 500,
      f1: 120,
      q: 1,
      dur: 1.0,
      vol: 0.25,
      delay: 0.25,
    })
  },
  overheat: () => {
    tone({ type: 'square', f0: 220, dur: 0.16, vol: 0.05, lp: 1200 })
    tone({ type: 'square', f0: 233, dur: 0.16, vol: 0.05, lp: 1200 })
  },
  tick: (high = false) =>
    tone({ type: 'sine', f0: high ? 1500 : 1000, dur: 0.07, vol: 0.18 }),
  jump: () => {
    tone({
      type: 'sawtooth',
      f0: 60,
      f1: 1800,
      dur: 1.2,
      vol: 0.12,
      lp: 2500,
      attack: 0.3,
    })
    noise({
      filter: 'bandpass',
      f0: 200,
      f1: 5000,
      q: 2,
      dur: 1.3,
      vol: 0.2,
      attack: 0.4,
    })
  },
  warp: () => {
    noise({
      filter: 'bandpass',
      f0: 3000,
      f1: 250,
      q: 2,
      dur: 0.9,
      vol: 0.18,
      attack: 0.1,
    })
    tone({ type: 'sine', f0: 400, f1: 90, dur: 0.8, vol: 0.12 })
  },

  // — results / salvage —
  win: () => arp([523, 659, 784, 1047], 0.09, 'square', 0.07, 0.3),
  lose: () => arp([392, 311, 262, 196], 0.16, 'sawtooth', 0.07, 0.4),
  scan: () => {
    tone({
      type: 'triangle',
      f0: 300,
      f1: 900,
      dur: 3.3,
      vol: 0.05,
      attack: 0.3,
    })
    for (let i = 0; i < 9; i++)
      tone({
        type: 'sine',
        f0: 1200 + i * 60,
        dur: 0.05,
        vol: 0.08,
        delay: 0.2 + i * 0.36,
      })
  },
  found: (tier = 1) =>
    arp(
      [659, 880, 1109, 1319, 1760].slice(0, 2 + tier),
      0.08,
      'triangle',
      0.14,
      0.35,
    ),
}

export type SoundName = keyof typeof SOUNDS

/** Same sound no more often than this (fast battles at x4). */
const MIN_GAP_MS = 45

export function sfx<N extends SoundName>(
  name: N,
  ...args: Parameters<(typeof SOUNDS)[N]>
): void {
  if (muted) return
  const c = audio()
  if (!c || c.state !== 'running') return
  const now = performance.now()
  const key = `${name}:${String(args[0] ?? '')}`
  if (now - (lastPlayed.get(key) ?? -1e9) < MIN_GAP_MS) return
  lastPlayed.set(key, now)
  ;(SOUNDS[name] as (...a: unknown[]) => void)(...args)
}
