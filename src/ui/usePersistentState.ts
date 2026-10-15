import { useEffect, useState } from 'react'

/**
 * useState mirrored to localStorage. Falls back to `initial` on missing or
 * broken data; `initial` may be a factory that runs only in that case.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? resolve(initial) : (JSON.parse(raw) as T)
    } catch {
      return resolve(initial)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage blocked or full: the game keeps working, just without saves
    }
  }, [key, value])
  return [value, setValue] as const
}

const resolve = <T>(v: T | (() => T)): T =>
  typeof v === 'function' ? (v as () => T)() : v
