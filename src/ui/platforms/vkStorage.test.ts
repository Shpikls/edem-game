import { describe, expect, test } from 'vitest'
import { CHUNK, chunkKeys, fromChunks, toChunks, vkKey } from './vkStorage.ts'

describe('VK storage chunks', () => {
  test('keys use only VK-allowed characters', () => {
    expect(vkKey('game.run.v14')).toBe('game_run_v14')
  })

  test('a long value round-trips through chunks', () => {
    const value = JSON.stringify({ log: 'x'.repeat(CHUNK * 3 + 17) })
    const stored = toChunks('game.run.v14', value)
    const count = Number(stored.game_run_v14)
    expect(count).toBe(4)
    for (const k of chunkKeys('game.run.v14', count))
      expect(stored[k]!.length).toBeLessThanOrEqual(CHUNK)
    expect(fromChunks('game.run.v14', count, stored)).toBe(value)
  })

  test('short and empty values', () => {
    const s = toChunks('sound.muted', '1')
    expect(fromChunks('sound.muted', Number(s.sound_muted), s)).toBe('1')
    const e = toChunks('x', '')
    expect(fromChunks('x', Number(e.x), e)).toBe('')
  })

  test('a missing part means no value (half-written save)', () => {
    const stored = toChunks('k', 'a'.repeat(CHUNK + 5))
    delete stored.k_1
    expect(fromChunks('k', 2, stored)).toBeNull()
  })
})
