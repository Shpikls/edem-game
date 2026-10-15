/**
 * VK Storage keeps short values (≤ 4096 bytes) under [A-Za-z0-9_-] keys, so a
 * long value is split into chunks: `<key>` holds the chunk count, `<key>_<i>`
 * the parts. Pure helpers — the bridge calls live in vk.ts.
 */

/** Safely below 4096 bytes even if every char took 1 byte more. */
export const CHUNK = 2000

export const vkKey = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_')

/** VK entries for one value. */
export function toChunks(key: string, value: string): Record<string, string> {
  const base = vkKey(key)
  const parts: string[] = []
  for (let i = 0; i < value.length; i += CHUNK)
    parts.push(value.slice(i, i + CHUNK))
  if (parts.length === 0) parts.push('')
  const out: Record<string, string> = { [base]: String(parts.length) }
  parts.forEach((p, i) => (out[`${base}_${i}`] = p))
  return out
}

/** Chunk keys to fetch once the counts are known. */
export function chunkKeys(key: string, count: number): string[] {
  const base = vkKey(key)
  return Array.from({ length: count }, (_, i) => `${base}_${i}`)
}

/** Reassembles a value; null when a part is missing (half-written save). */
export function fromChunks(
  key: string,
  count: number,
  stored: Record<string, string>,
): string | null {
  const parts = chunkKeys(key, count).map((k) => stored[k])
  return parts.every((p) => p !== undefined) ? parts.join('') : null
}
