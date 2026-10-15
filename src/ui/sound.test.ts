import { afterEach, describe, expect, test, vi } from 'vitest'

// sound.ts touches browser globals at import time: stub them per test.
async function load(storage: Partial<Storage>) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  vi.stubGlobal('document', { addEventListener: vi.fn(), hidden: false })
  return import('./sound.ts')
}

afterEach(() => vi.unstubAllGlobals())

describe('sound', () => {
  test('mute is persisted and broadcast', async () => {
    const data = new Map<string, string>()
    const sound = await load({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    })
    expect(sound.isMuted()).toBe(false)
    const listener = vi.fn()
    const off = sound.onSoundChange(listener)
    sound.setMuted(true)
    expect(sound.isMuted()).toBe(true)
    expect(data.get('sound.muted')).toBe('1')
    expect(listener).toHaveBeenCalledOnce()
    off()
    sound.setMuted(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  test('volume is clamped and persisted', async () => {
    const data = new Map<string, string>()
    const sound = await load({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    })
    expect(sound.getVolume()).toBe(1)
    sound.setVolume(0.4)
    expect(data.get('sound.volume')).toBe('0.4')
    sound.setVolume(7)
    expect(sound.getVolume()).toBe(1)
    const reloaded = await load({
      getItem: (k) => (k === 'sound.volume' ? 'junk' : null),
      setItem: () => {},
    })
    expect(reloaded.getVolume()).toBe(1)
  })

  test('starts muted when the player muted it before', async () => {
    const sound = await load({ getItem: () => '1', setItem: () => {} })
    expect(sound.isMuted()).toBe(true)
  })

  test('blocked storage does not break the game', async () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    const sound = await load({ getItem: boom, setItem: boom })
    expect(sound.isMuted()).toBe(false)
    expect(() => sound.setMuted(true)).not.toThrow()
    expect(sound.isMuted()).toBe(true)
  })

  test('without Web Audio sfx is a silent no-op', async () => {
    const sound = await load({ getItem: () => null, setItem: () => {} })
    expect(() => sound.sfx('laser', true)).not.toThrow()
  })
})
