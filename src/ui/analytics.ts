/**
 * Analytics: Yandex Metrika (VITE_YM_ID) and/or GoatCounter (VITE_GC_CODE).
 * Each is enabled only when its build env is set; otherwise a no-op.
 */

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & {
  a?: unknown[]
  l?: number
}

declare global {
  interface Window {
    ym?: Ym
    goatcounter?: {
      count?: (v: { path: string; title?: string; event?: boolean }) => void
    }
  }
}

const id = Number(import.meta.env.VITE_YM_ID ?? 0)
const gcCode = import.meta.env.VITE_GC_CODE ?? ''

export function initAnalytics(): void {
  if (typeof window === 'undefined') return
  if (gcCode) {
    const gc = document.createElement('script')
    gc.async = true
    gc.dataset.goatcounter = `https://${gcCode}.goatcounter.com/count`
    gc.src = 'https://gc.zgo.at/count.js'
    document.head.appendChild(gc)
  }
  if (!id || window.ym) return
  const ym: Ym = (...args: unknown[]) => {
    ;(ym.a = ym.a ?? []).push(args)
  }
  ym.l = Date.now()
  window.ym = ym
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://mc.yandex.ru/metrika/tag.js'
  document.head.appendChild(script)
  ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  })
}

/** Records a game event as a Metrika goal with parameters. */
export function track(
  goal: string,
  params: Record<string, unknown> = {},
): void {
  if (!id) return
  window.ym?.(id, 'reachGoal', goal, params)
}
