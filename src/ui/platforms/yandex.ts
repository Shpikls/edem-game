import type { PlatformAdapter, SetPaused } from './types.ts'
import { loadScript, within } from './util.ts'

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

/** Yandex Games SDK; null when it can't be reached (then the game runs bare). */
export async function createYandex(
  setPaused: SetPaused,
): Promise<PlatformAdapter | null> {
  // Archive uploaded to the console: the SDK is served next to the game.
  const ok =
    (await loadScript('/sdk.js', 5_000)) ||
    (await loadScript('https://yandex.ru/games/sdk/v2', 5_000))
  if (!ok || !window.YaGames) return null
  const sdk = await within(window.YaGames.init(), 6_000)
  sdk.on('game_api_pause', () => setPaused(true))
  sdk.on('game_api_resume', () => setPaused(false))
  const player = await within(sdk.getPlayer(), 6_000)

  return {
    async load(keys) {
      const cloud = await within(player.getData([...keys]), 6_000)
      const out: Record<string, string> = {}
      for (const k of keys) if (typeof cloud[k] === 'string') out[k] = cloud[k]
      return out
    },
    save: (data) => player.setData(data),
    ready: () => sdk.features.LoadingAPI?.ready(),
    gameplay: (on) =>
      on ? sdk.features.GameplayAPI?.start() : sdk.features.GameplayAPI?.stop(),
    fullscreenAd: () =>
      new Promise((resolve) => {
        const done = () => {
          setPaused(false)
          resolve()
        }
        sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => setPaused(true),
            onClose: done,
            onError: done,
          },
        })
      }),
    // Yandex has no availability check; the platform handles a missing fill.
    rewardedReady: async () => true,
    rewardedAd: () =>
      new Promise((resolve) => {
        let rewarded = false
        sdk.adv.showRewardedVideo({
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
      }),
  }
}
