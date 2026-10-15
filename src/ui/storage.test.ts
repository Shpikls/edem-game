import { afterEach, describe, expect, test, vi } from 'vitest'

async function fresh(ls: Partial<Storage>) {
  vi.resetModules()
  vi.stubGlobal('localStorage', ls)
  return import('./storage.ts')
}

afterEach(() => vi.unstubAllGlobals())

describe('storage', () => {
  test('blocked localStorage: values live in memory and reach the sink', async () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    const s = await fresh({ getItem: boom, setItem: boom, removeItem: boom })
    const sink = vi.fn()
    s.setStorageSink(sink)
    s.save('game.run.v14', '{"round":3}')
    expect(s.load('game.run.v14')).toBe('{"round":3}')
    expect(sink).toHaveBeenCalledWith('game.run.v14', '{"round":3}')
  })

  test('restored cloud values are readable but not echoed to the sink', async () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    const s = await fresh({ getItem: boom, setItem: boom })
    const sink = vi.fn()
    s.setStorageSink(sink)
    s.restore('record.v1', '7')
    expect(s.load('record.v1')).toBe('7')
    expect(sink).not.toHaveBeenCalled()
  })

  test('working localStorage is used as is', async () => {
    const data = new Map<string, string>()
    const s = await fresh({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    })
    s.save('a', '1')
    expect(data.get('a')).toBe('1')
    expect(s.load('a')).toBe('1')
  })
})
