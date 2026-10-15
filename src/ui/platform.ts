/**
 * Hosting platform glue. The Yandex Games build (VITE_PLATFORM=yandex) talks to
 * the Yandex SDK: loading/gameplay signals, pause events, ads and cloud saves.
 * Everywhere else every call is a harmless no-op.
 */
import { load, setStorageSink } from './storage.ts'

export const platform: 'yandex' | 'web' =
  import.meta.env.VITE_PLATFORM === 'yandex' ? 'yandex' : 'web'

/** Saved in the player's Yandex cloud (everything else stays local). */
const CLOUD_KEYS = [
  'game.run.v14',
  'tutorial.v1',
  'record.v1',
  'run.startedAt',
  'sound.muted',
  'sound.volume',
]

interface YandexPlayer {
  getData: (keys?: string[]) => Promise<Record<string, unknown>>
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>
}

interface AdCallbacks {
  onOpen?: () => void
  onClose?: (wasShown: boolean) => void
  onError?: (error: unknown) => void
  onRewarded?: () => void
}

interface YandexSdk {
  features: {
    LoadingAPI?: { ready: () => void }
    GameplayAPI?: { start: () => void; stop: () => void }
  }
  adv: {
    showFullscreenAdv: (o: { callbacks: AdCallbacks }) => void
    showRewardedVideo: (o: { callbacks: AdCallbacks }) => void
  }
  on: (event: string, cb: () => void) => void
  getPlayer: () => Promise<YandexPlayer>
}

declare global {
  interface Window {
    YaGames?: { init: () => Promise<YandexSdk> }
  }
}

let sdk: YandexSdk | null = null
let player: YandexPlayer | null = null

// ── pause (ads, platform overlays): the game freezes, sound goes quiet ──────

let paused = false
const pauseListeners = new Set<() => void>()

function setPaused(value: boolean) {
  if (paused === value) return
  paused = value
  pauseListeners.forEach((l) => l())
}

export const isPaused = () => paused

export function onPauseChange(listener: () => void): () => void {
  pauseListeners.add(listener)
  return () => pauseListeners.delete(listener)
}

// ── startup ──────────────────────────────────────────────────────────────────

/** Rejects if the promise doesn't settle in time (SDK outside Yandex can hang). */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}

function loadScript(src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    const timer = window.setTimeout(() => resolve(false), timeoutMs)
    s.onload = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    s.onerror = () => {
      window.clearTimeout(timer)
      resolve(false)
    }
    document.head.appendChild(s)
  })
}

/**
 * Connects to Yandex Games and pulls cloud saves into local storage — call
 * before the first render. Never throws: without the SDK the game runs as is.
 */
export async function initPlatform(): Promise<void> {
  if (platform !== 'yandex') return
  try {
    // Archive uploaded to the console: the SDK is served next to the game.
    const ok =
      (await loadScript('/sdk.js', 5_000)) ||
      (await loadScript('https://yandex.ru/games/sdk/v2', 5_000))
    if (!ok || !window.YaGames) return
    const ready = await within(window.YaGames.init(), 6_000)
    sdk = ready
    ready.on('game_api_pause', () => setPaused(true))
    ready.on('game_api_resume', () => setPaused(false))
    const me = await within(ready.getPlayer(), 6_000)
    const cloud = await within(me.getData(CLOUD_KEYS), 6_000)
    player = me
    for (const key of CLOUD_KEYS) {
      const v = cloud[key]
      if (typeof v === 'string') {
        try {
          localStorage.setItem(key, v)
        } catch {
          /* storage blocked: the cloud copy still wins next time */
        }
      }
    }
    setStorageSink(queueCloudSave)
  } catch (e) {
    console.warn('Yandex SDK unavailable', e)
  }
}

// ── cloud saves: batched, a few writes a minute at most ─────────────────────

let saveTimer = 0

function queueCloudSave(key: string) {
  if (!player || !CLOUD_KEYS.includes(key)) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const data: Record<string, string> = {}
    for (const k of CLOUD_KEYS) {
      const v = load(k)
      if (v !== null) data[k] = v
    }
    player?.setData(data).catch(() => {})
  }, 3_000)
}

// ── signals ──────────────────────────────────────────────────────────────────

/** The title screen is interactive: the platform hides its loader. */
export function gameReady(): void {
  sdk?.features.LoadingAPI?.ready()
}

let gameplayOn = false

/** Active play on/off (menus, results and ads are "off"). */
export function setGameplay(active: boolean): void {
  if (!sdk || active === gameplayOn) return
  gameplayOn = active
  if (active) sdk.features.GameplayAPI?.start()
  else sdk.features.GameplayAPI?.stop()
}

// ── ads ──────────────────────────────────────────────────────────────────────

export const adsAvailable = () => sdk !== null

/** Interstitial between runs/missions; resolves when it's over (or skipped). */
export function showFullscreenAd(): Promise<void> {
  if (!sdk) return Promise.resolve()
  const ad = sdk.adv
  return new Promise((resolve) => {
    const done = () => {
      setPaused(false)
      resolve()
    }
    ad.showFullscreenAdv({
      callbacks: {
        onOpen: () => setPaused(true),
        onClose: done,
        onError: done,
      },
    })
  })
}

/** Rewarded video; true when the player earned the reward. */
export function showRewardedAd(): Promise<boolean> {
  if (!sdk) return Promise.resolve(false)
  const ad = sdk.adv
  return new Promise((resolve) => {
    let rewarded = false
    ad.showRewardedVideo({
      callbacks: {
        onOpen: () => setPaused(true),
        onRewarded: () => {
          rewarded = true
        },
        onClose: () => {
          setPaused(false)
          resolve(rewarded)
        },
        onError: () => {
          setPaused(false)
          resolve(false)
        },
      },
    })
  })
}
