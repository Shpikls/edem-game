import { describe, expect, test } from 'vitest'
import { cooldown } from './util.ts'

describe('cooldown', () => {
  test('ready at first, then only after the gap since the last mark', () => {
    let t = 1_000
    const gap = cooldown(60_000, () => t)
    expect(gap.ready()).toBe(true)
    gap.mark()
    t += 59_999
    expect(gap.ready()).toBe(false)
    t += 1
    expect(gap.ready()).toBe(true)
  })

  test('a later mark restarts the gap', () => {
    let t = 0
    const gap = cooldown(60_000, () => t)
    gap.mark()
    t = 50_000
    gap.mark() // e.g. the ad closed 50 s after it opened
    t = 100_000
    expect(gap.ready()).toBe(false)
    t = 110_000
    expect(gap.ready()).toBe(true)
  })
})
