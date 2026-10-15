/**
 * Analytics: Umami (self-hosted, VITE_UMAMI_ID + VITE_UMAMI_URL) and/or
 * Yandex Metrika (VITE_YM_ID). Each is on only when its build env is set.
 */

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & {
  a?: unknown[]
  l?: number
}

declare global {
  interface Window {
    ym?: Ym
    umami?: {
      track: (event: string, data?: Record<string, unknown>) => void
      identify: (data: Record<string, unknown>) => void
    }
  }
}

const ymId = Number(import.meta.env.VITE_YM_ID ?? 0)
const umamiId = import.meta.env.VITE_UMAMI_ID ?? ''
const umamiUrl = import.meta.env.VITE_UMAMI_URL ?? ''
/** Build (short commit id) on every session and event: stats split by version. */
const build = __BUILD__

export function initAnalytics(): void {
  if (typeof window === 'undefined') return
  if (umamiId && umamiUrl) {
    const s = document.createElement('script')
    s.defer = true
    s.src = `${umamiUrl}/script.js`
    s.dataset.websiteId = umamiId
    s.onload = () => window.umami?.identify({ build })
    document.head.appendChild(s)
    // Session replay + heatmaps (enabled per website in Umami).
    const rec = document.createElement('script')
    rec.defer = true
    rec.src = `${umamiUrl}/recorder.js`
    rec.dataset.websiteId = umamiId
    document.head.appendChild(rec)
  }
  if (ymId && !window.ym) {
    const ym: Ym = (...args: unknown[]) => {
      ;(ym.a = ym.a ?? []).push(args)
    }
    ym.l = Date.now()
    window.ym = ym
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://mc.yandex.ru/metrika/tag.js'
    document.head.appendChild(s)
    ym(ymId, 'init', {
      params: { build },
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    })
  }
}

/** Records a game event (Umami event / Metrika goal) with parameters. */
export function track(
  event: string,
  params: Record<string, unknown> = {},
): void {
  const data = { ...params, build }
  if (ymId) window.ym?.(ymId, 'reachGoal', event, data)
  if (umamiId) window.umami?.track(event, data)
}
