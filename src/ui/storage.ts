/**
 * Key-value persistence: localStorage plus an in-memory copy, and an optional
 * sink that mirrors writes elsewhere (cloud saves). Inside a cross-origin
 * iframe (VK, Yandex) a browser may refuse localStorage — the memory copy then
 * keeps the session and the cloud saves working.
 */

type Sink = (key: string, value: string | null) => void

let sink: Sink | null = null
const memory = new Map<string, string>()

export function setStorageSink(next: Sink | null): void {
  sink = next
}

export function load(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return v
  } catch {
    // blocked: fall back to memory
  }
  return memory.get(key) ?? null
}

export function save(key: string, value: string): void {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // blocked or full: memory + cloud still have it
  }
  sink?.(key, value)
}

/** A value restored from the cloud: stored locally, not echoed back. */
export function restore(key: string, value: string): void {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    /* memory has it */
  }
}

export function remove(key: string): void {
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to remove */
  }
  sink?.(key, null)
}
