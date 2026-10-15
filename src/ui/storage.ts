/**
 * Key-value persistence: localStorage (may be blocked — then nothing is kept)
 * plus an optional sink that mirrors writes elsewhere (Yandex cloud saves).
 */

type Sink = (key: string, value: string | null) => void

let sink: Sink | null = null

export function setStorageSink(next: Sink | null): void {
  sink = next
}

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // blocked or full: the game keeps working without saves
  }
  sink?.(key, value)
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to remove */
  }
  sink?.(key, null)
}
