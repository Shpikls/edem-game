/**
 * Yandex Metrika: page views plus game goals (reachGoal). The counter id comes
 * from the build env VITE_YM_ID; without it everything is a no-op (local dev).
 */

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & {
  a?: unknown[]
  l?: number
}

declare global {
  interface Window {
    ym?: Ym
  }
}

const id = Number(import.meta.env.VITE_YM_ID ?? 0)

export function initAnalytics(): void {
  if (!id || typeof window === 'undefined' || window.ym) return
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
