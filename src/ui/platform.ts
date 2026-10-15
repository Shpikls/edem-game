/**
 * Hosting platform glue. Platform builds (VITE_PLATFORM=yandex | vk) talk to
 * the host SDK: loading/gameplay signals, pause events, ads and cloud saves.
 * Everywhere else every call is a harmless no-op.
 */
import type { PlatformAdapter } from './platforms/types.ts'
import { load, restore, setStorageSink } from './storage.ts'

export type PlatformName = 'yandex' | 'vk' | 'web'

export const platform: PlatformName =
  import.meta.env.VITE_PLATFORM === 'yandex'
    ? 'yandex'
    : import.meta.env.VITE_PLATFORM === 'vk'
      ? 'vk'
      : 'web'

/** Saved in the player's cloud (everything else stays local). */
const CLOUD_KEYS = [
  'game.run.v14',
  'tutorial.v1',
  'record.v1',
  'run.startedAt',
  'sound.muted',
  'sound.volume',
]

let host: PlatformAdapter | null = null

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

/**
 * Connects to the host and pulls cloud saves into local storage — call before
 * the first render. Never throws: without the SDK the game runs as is.
 */
export async function initPlatform(): Promise<void> {
  if (platform === 'web') return
  try {
    // Each SDK is loaded only in its own build.
    const adapter =
      platform === 'yandex'
        ? await (await import('./platforms/yandex.ts')).createYandex(setPaused)
        : await (await import('./platforms/vk.ts')).createVk(setPaused)
    if (!adapter) return
    const cloud = await adapter.load(CLOUD_KEYS)
    for (const [key, value] of Object.entries(cloud)) restore(key, value)
    host = adapter
    setStorageSink(queueCloudSave)
  } catch (e) {
    console.warn(`${platform} SDK unavailable`, e)
  }
}

// ── cloud saves: batched, a few writes a minute at most ─────────────────────

let saveTimer = 0

function queueCloudSave(key: string) {
  if (!host || !CLOUD_KEYS.includes(key)) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const data: Record<string, string> = {}
    for (const k of CLOUD_KEYS) {
      const v = load(k)
      if (v !== null) data[k] = v
    }
    host?.save(data).catch(() => {})
  }, 3_000)
}

// ── signals ──────────────────────────────────────────────────────────────────

/** The title screen is interactive: the platform hides its loader. */
export function gameReady(): void {
  host?.ready()
}

let gameplayOn = false

/** Active play on/off (menus, results and ads are "off"). */
export function setGameplay(active: boolean): void {
  if (!host || active === gameplayOn) return
  gameplayOn = active
  host.gameplay(active)
}

// ── ads ──────────────────────────────────────────────────────────────────────

export const adsAvailable = () => host !== null

/** Interstitial between runs/missions; resolves when it's over (or skipped). */
export function showFullscreenAd(): Promise<void> {
  return host ? host.fullscreenAd() : Promise.resolve()
}

/** Rewarded video; true when the player earned the reward. */
export function showRewardedAd(): Promise<boolean> {
  return host ? host.rewardedAd() : Promise.resolve(false)
}
