/**
 * Seeded PRNG (mulberry32). Same seed → same sequence on every platform,
 * which keeps battles reproducible.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number
  /** true with probability p (0..1). */
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** Returns a shuffled copy; the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[]
  /** Current internal state, enough to resume the sequence via createRng(state). */
  readonly state: number
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`invalid int range [${min}, ${max}]`)
    }
    return min + Math.floor(next() * (max - min + 1))
  }

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick from empty array')
      return items[int(0, items.length - 1)]!
    },
    shuffle: (items) => {
      const result = [...items]
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(0, i)
        ;[result[i], result[j]] = [result[j]!, result[i]!]
      }
      return result
    },
    get state() {
      return state
    },
  }
}
