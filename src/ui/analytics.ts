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
const TAG_KEY = 'analytics.tag'

/**
 * Marks non-player sessions so they can be filtered out: `?tag=dev` (kept on
 * this device; `?tag=` clears it), automated browsers → 'autotest'.
 */
function readTag(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get('tag')
    if (fromUrl !== null) {
      if (fromUrl) localStorage.setItem(TAG_KEY, fromUrl)
      else localStorage.removeItem(TAG_KEY)
    }
    const stored = localStorage.getItem(TAG_KEY)
    if (stored) return stored
  } catch {
    /* storage blocked */
  }
  return navigator.webdriver ? 'autotest' : ''
}
const tag = typeof window === 'undefined' ? '' : readTag()
/** Sent with the session and every event. */
/**
 * Where the game is played: web | yandex | vk | ok. The VK build also runs in
 * Odnoklassniki — VK passes vk_client=ok there; vk_platform tells the client
 * (mobile_android, mobile_iphone, mobile_web, desktop_web).
 */
function hostInfo(): Record<string, string> {
  const build = import.meta.env.VITE_PLATFORM || 'web'
  if (typeof location === 'undefined') return { platform: build }
  const q = new URLSearchParams(location.search)
  const platform = build === 'vk' && q.get('vk_client') === 'ok' ? 'ok' : build
  const client = q.get('vk_platform')
  return client ? { platform, client } : { platform }
}
const meta: Record<string, string> = {
  build,
  ...hostInfo(),
  ...(tag ? { tag } : {}),
}

/**
 * What the player actually sees — Umami's `screen` is the whole device, not
 * the host's frame: the visible area and the hull cell size it gives (px).
 */
function viewInfo(): { viewport: string; cell: number } {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--cell)'
  document.body.appendChild(probe)
  const cell = Math.round(probe.getBoundingClientRect().width)
  probe.remove()
  return { viewport: `${innerWidth}x${innerHeight}`, cell }
}

export function initAnalytics(): void {
  if (typeof window === 'undefined') return
  const session = { ...meta, ...viewInfo() }
  if (umamiId && umamiUrl) {
    const s = document.createElement('script')
    s.defer = true
    s.src = `${umamiUrl}/script.js`
    s.dataset.websiteId = umamiId
    s.onload = () => window.umami?.identify(session)
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
      params: session,
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
  const data = { ...params, ...meta }
  if (ymId) window.ym?.(ymId, 'reachGoal', event, data)
  if (umamiId) window.umami?.track(event, data)
}
