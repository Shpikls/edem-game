import { useEffect, useState } from 'react'
import { load, save } from './storage.ts'

/**
 * useState mirrored to storage (localStorage + cloud saves). Falls back to `initial` on missing or
 * broken data; `initial` may be a factory that runs only in that case.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = load(key)
      return raw === null ? resolve(initial) : (JSON.parse(raw) as T)
    } catch {
      return resolve(initial)
    }
  })
  useEffect(() => {
    save(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}

const resolve = <T>(v: T | (() => T)): T =>
  typeof v === 'function' ? (v as () => T)() : v
