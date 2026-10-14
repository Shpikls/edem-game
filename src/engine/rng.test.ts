import { describe, expect, test } from 'vitest'
import { createRng } from './rng.ts'

const take = (seed: number, n: number) => {
  const rng = createRng(seed)
  return Array.from({ length: n }, () => rng.next())
}

describe('createRng', () => {
  test('same seed produces the same sequence', () => {
    expect(take(42, 100)).toEqual(take(42, 100))
  })

  test('different seeds produce different sequences', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10))
  })

  test('sequence is stable across versions', () => {
    // Guards against accidental algorithm changes that would break saved builds/replays.
    expect(take(42, 3)).toMatchInlineSnapshot(`
      [
        0.6011037519201636,
        0.44829055899754167,
        0.8524657934904099,
      ]
    `)
  })

  test('next() stays in [0, 1)', () => {
    for (const x of take(7, 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  test('int() covers the inclusive range and nothing else', () => {
    const rng = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('int() rejects invalid ranges', () => {
    const rng = createRng(1)
    expect(() => rng.int(5, 1)).toThrow(RangeError)
    expect(() => rng.int(0.5, 2)).toThrow(RangeError)
  })

  test('chance() respects edge probabilities', () => {
    const rng = createRng(9)
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  test('pick() returns an element and rejects empty arrays', () => {
    const rng = createRng(5)
    const items = ['a', 'b', 'c'] as const
    expect(items).toContain(rng.pick(items))
    expect(() => rng.pick([])).toThrow(RangeError)
  })

  test('shuffle() is a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const result = createRng(11).shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...result].sort()).toEqual(input)
  })

  test('state allows resuming the sequence', () => {
    const a = createRng(123)
    a.next()
    a.next()
    const b = createRng(a.state)
    expect(b.next()).toBe(a.next())
  })
})
