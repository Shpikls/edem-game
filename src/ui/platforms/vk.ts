import type { PlatformAdapter, SetPaused } from './types.ts'
import { within } from './util.ts'
import { chunkKeys, fromChunks, toChunks, vkKey } from './vkStorage.ts'

/** VK Games (VK Mini Apps / OK) via VK Bridge; null outside VK. */
export async function createVk(
  setPaused: SetPaused,
): Promise<PlatformAdapter | null> {
  const { default: bridge } = await import('@vkontakte/vk-bridge')
  await within(bridge.send('VKWebAppInit'), 6_000)

  // The app is hidden (minimised, call, other tab of the client): pause.
  bridge.subscribe((e) => {
    if (e.detail.type === 'VKWebAppViewHide') setPaused(true)
    if (e.detail.type === 'VKWebAppViewRestore') setPaused(false)
  })

  const get = async (keys: string[]): Promise<Record<string, string>> => {
    const out: Record<string, string> = {}
    for (let i = 0; i < keys.length; i += 100) {
      const r = await within(
        bridge.send('VKWebAppStorageGet', { keys: keys.slice(i, i + 100) }),
        6_000,
      )
      for (const { key, value } of r.keys) if (value !== '') out[key] = value
    }
    return out
  }

  /** What VK already holds: only changed chunks are written. */
  const sent = new Map<string, string>()

  const ad = async (format: 'interstitial' | 'reward'): Promise<boolean> => {
    try {
      const check = await bridge.send('VKWebAppCheckNativeAds', {
        ad_format: format,
      })
      if (!check.result) return false
      setPaused(true)
      const r = await bridge.send('VKWebAppShowNativeAds', {
        ad_format: format,
      })
      return r.result
    } catch {
      return false
    } finally {
      setPaused(false)
    }
  }

  return {
    async load(keys) {
      const heads = await get(keys.map(vkKey))
      const counts = keys.map((k) => Number(heads[vkKey(k)] ?? 0))
      const parts = await get(keys.flatMap((k, i) => chunkKeys(k, counts[i]!)))
      const out: Record<string, string> = {}
      keys.forEach((k, i) => {
        const v = counts[i] ? fromChunks(k, counts[i]!, parts) : null
        if (v !== null) out[k] = v
        // remember what's stored so unchanged chunks aren't rewritten
        if (v !== null)
          for (const [ck, cv] of Object.entries(toChunks(k, v)))
            sent.set(ck, cv)
      })
      return out
    },
    async save(data) {
      for (const [key, value] of Object.entries(data)) {
        const chunks = toChunks(key, value)
        // parts first, the count last: a reader never sees a count ahead of its parts
        const entries = Object.entries(chunks).sort(([a], [b]) =>
          a === vkKey(key) ? 1 : b === vkKey(key) ? -1 : 0,
        )
        for (const [ck, cv] of entries) {
          if (sent.get(ck) === cv) continue
          await bridge.send('VKWebAppStorageSet', { key: ck, value: cv })
          sent.set(ck, cv)
        }
      }
    },
    ready: () => {},
    gameplay: () => {},
    fullscreenAd: async () => {
      await ad('interstitial')
    },
    rewardedAd: () => ad('reward'),
  }
}
