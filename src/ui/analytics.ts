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
    umami?: { track: (event: string, data?: Record<string, unknown>) => void }
  }
}

const ymId = Number(import.meta.env.VITE_YM_ID ?? 0)
const umamiId = import.meta.env.VITE_UMAMI_ID ?? ''
const umamiUrl = import.meta.env.VITE_UMAMI_URL ?? ''

export function initAnalytics(): void {
  if (typeof window === 'undefined') return
  if (umamiId && umamiUrl) {
    const s = document.createElement('script')
    s.defer = true
    s.src = `${umamiUrl}/script.js`
    s.dataset.websiteId = umamiId
    document.head.appendChild(s)
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
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    })
  }
}

/** Records a game event (Umami event / Metrika goal) with parameters. */
export function track(event: string, data: Record<string, unknown> = {}): void {
  if (ymId) window.ym?.(ymId, 'reachGoal', event, data)
  if (umamiId) window.umami?.track(event, data)
}
