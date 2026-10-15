/** Rejects if the promise doesn't settle in time (SDKs outside their host can hang). */
export function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}

export function loadScript(src: string, timeoutMs: number): Promise<boolean> {
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
