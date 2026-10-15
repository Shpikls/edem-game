import { describe, expect, test } from 'vitest'
import type { BattleEvent } from '../../engine/index.ts'
import { flightMs } from '../../battle/timing.ts'
import { battleCues, SKIP_MS } from './battleSounds.ts'

const hit = (
  t: number,
  source: string,
  damageType: 'energy' | 'kinetic' | 'explosive',
  over: Partial<Extract<BattleEvent, { type: 'hit' }>> = {},
): BattleEvent => ({
  t,
  type: 'hit',
  side: 'player',
  source,
  target: 'enemy',
  amount: 5,
  damageType,
  absorbed: 0,
  blocked: 0,
  hullDamage: 5,
  shieldHp: 0,
  hullHp: 50,
  ...over,
})

describe('battleCues', () => {
  test('a laser fires and hits on the same tick', () => {
    expect(battleCues([hit(1000, 'laser#1', 'energy')], 950, 1000)).toEqual([
      { name: 'laser', enemy: false },
      { name: 'hitHull' },
    ])
  })

  test('a rocket launches before it lands and explodes on impact', () => {
    const e = hit(2000, 'rocket#1', 'explosive', { side: 'enemy' })
    const launch = 2000 - flightMs('rocket#1', 'explosive')
    expect(battleCues([e], launch - 10, launch)).toEqual([
      { name: 'missile', enemy: true },
    ])
    expect(battleCues([e], 1990, 2000)).toEqual([{ name: 'boom' }])
  })

  test('a hit fully absorbed by the shield sounds like a shield', () => {
    const e = hit(500, 'machinegun#2', 'kinetic', {
      absorbed: 5,
      hullDamage: 0,
    })
    expect(battleCues([e], 499, 500)).toContainEqual({ name: 'hitShield' })
  })

  test('unknown weapons fall back to the railgun', () => {
    const e = hit(800, 'railgun#1', 'kinetic')
    const fire = 800 - flightMs('railgun#1', 'kinetic')
    expect(battleCues([e], fire - 1, fire)).toEqual([
      { name: 'railgun', enemy: false },
    ])
  })

  test('overheat and destruction', () => {
    const events: BattleEvent[] = [
      { t: 25000, type: 'overheat', target: 'enemy', amount: 1, hullHp: 9 },
      { t: 25100, type: 'destroyed', side: 'enemy' },
    ]
    expect(battleCues(events, 24990, 25100)).toEqual([
      { name: 'overheat' },
      { name: 'explosion' },
    ])
  })

  test('each event sounds once across consecutive frames', () => {
    const events = [hit(1000, 'laser#1', 'energy')]
    const frames = [0, 300, 600, 900, 1000, 1100, 1300]
    const all = frames
      .slice(1)
      .flatMap((to, i) => battleCues(events, frames[i]!, to))
    expect(all).toHaveLength(2)
  })

  test('skips and rewinds are silent', () => {
    const events = [hit(1000, 'laser#1', 'energy')]
    expect(battleCues(events, 0, SKIP_MS + 700)).toEqual([])
    expect(battleCues(events, 1200, 900)).toEqual([])
  })
})
