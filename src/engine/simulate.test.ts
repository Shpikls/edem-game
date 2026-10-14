import { describe, expect, test } from 'vitest'
import { battleRules } from '../content/battleRules.ts'
import { simulate } from './simulate.ts'
import type { BattleRules, Ship, ShipModule } from './types.ts'

// Fixed rules so engine tests don't break when content is rebalanced.
const rules: BattleRules = {
  tickMs: 100,
  overheatStartMs: 25_000,
  overheatIntervalMs: 1_000,
  overheatBaseDamage: 1,
  overheatDamageStep: 1,
  maxDurationMs: 120_000,
}

const laser = (id: string, damage = 5, cooldownMs = 1_000): ShipModule => ({
  id,
  stats: { kind: 'weapon', damage, damageType: 'energy', cooldownMs },
})

const ship = (hullHp: number, ...modules: ShipModule[]): Ship => ({
  hullHp,
  modules,
})

describe('simulate', () => {
  test('same inputs and seed produce an identical log', () => {
    const player = ship(
      60,
      laser('laser#1', 5, 1_000),
      laser('laser#2', 3, 700),
    )
    const enemy = ship(70, laser('rail#1', 8, 1_500))
    expect(simulate(player, enemy, 42, rules)).toEqual(
      simulate(player, enemy, 42, rules),
    )
  })

  test('does not mutate input ships', () => {
    const player = ship(20, laser('laser#1'))
    const enemy = ship(20)
    const snapshot = structuredClone({ player, enemy })
    simulate(player, enemy, 1, rules)
    expect({ player, enemy }).toEqual(snapshot)
  })

  test('5 dmg every 1 s kills a 20 HP ship at 4 s', () => {
    const result = simulate(ship(100, laser('laser#1')), ship(20), 1, rules)
    expect(result.winner).toBe('player')
    expect(result.durationMs).toBe(4_000)
    expect(result.events).toEqual([
      {
        t: 1_000,
        type: 'hit',
        side: 'player',
        source: 'laser#1',
        target: 'enemy',
        amount: 5,
        damageType: 'energy',
        hullHp: 15,
      },
      {
        t: 2_000,
        type: 'hit',
        side: 'player',
        source: 'laser#1',
        target: 'enemy',
        amount: 5,
        damageType: 'energy',
        hullHp: 10,
      },
      {
        t: 3_000,
        type: 'hit',
        side: 'player',
        source: 'laser#1',
        target: 'enemy',
        amount: 5,
        damageType: 'energy',
        hullHp: 5,
      },
      {
        t: 4_000,
        type: 'hit',
        side: 'player',
        source: 'laser#1',
        target: 'enemy',
        amount: 5,
        damageType: 'energy',
        hullHp: 0,
      },
      { t: 4_000, type: 'destroyed', side: 'enemy' },
    ])
  })

  test('cooldown that is not a multiple of the tick does not drift', () => {
    // Fires at 250, 500, 750, 1000 → seen on ticks 300, 500, 800, 1000.
    const result = simulate(
      ship(100, laser('laser#1', 1, 250)),
      ship(4),
      1,
      rules,
    )
    const hits = result.events.filter((e) => e.type === 'hit').map((e) => e.t)
    expect(hits).toEqual([300, 500, 800, 1_000])
  })

  test('simultaneous lethal hits are a draw, not a first-mover win', () => {
    const result = simulate(
      ship(10, laser('a#1', 10)),
      ship(10, laser('b#1', 10)),
      1,
      rules,
    )
    expect(result.winner).toBe('draw')
    expect(result.durationMs).toBe(1_000)
    expect(result.events.filter((e) => e.type === 'destroyed')).toHaveLength(2)
  })

  test('outcome does not depend on which side is the player', () => {
    const strong = [laser('w#1', 7, 900)]
    const weak = [laser('w#1', 4, 1_100)]
    const a = simulate(ship(50, ...strong), ship(50, ...weak), 1, rules)
    const b = simulate(ship(50, ...weak), ship(50, ...strong), 1, rules)
    expect(a.winner).toBe('player')
    expect(b.winner).toBe('enemy')
    expect(a.durationMs).toBe(b.durationMs)
  })

  test('overheat ends a battle between unarmed ships', () => {
    const result = simulate(ship(10), ship(15), 1, rules)
    // Pulses 1, 2, 3, 4 → cumulative 10 at 28 s: player dies first.
    expect(result.winner).toBe('enemy')
    expect(result.durationMs).toBe(28_000)
    expect(
      result.events.filter((e) => e.type === 'overheat').map((e) => e.amount),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })

  test('equal ships under overheat die together → draw', () => {
    expect(simulate(ship(10), ship(10), 1, rules).winner).toBe('draw')
  })

  test('maxDuration is a safety net that yields a draw', () => {
    const noOverheat = {
      ...rules,
      overheatStartMs: Infinity,
      maxDurationMs: 5_000,
    }
    const result = simulate(ship(10), ship(10), 1, noOverheat)
    expect(result).toEqual({ winner: 'draw', durationMs: 5_000, events: [] })
  })

  test('default content rules end a 100 HP vs 100 HP standoff by ~40 s', () => {
    const result = simulate(ship(100), ship(100), 1, battleRules)
    expect(result.durationMs).toBeLessThanOrEqual(40_000)
  })

  test('rejects invalid input', () => {
    expect(() => simulate(ship(0), ship(10), 1, rules)).toThrow(RangeError)
    expect(() =>
      simulate(ship(10, laser('x', 1, 0)), ship(10), 1, rules),
    ).toThrow(RangeError)
    expect(() =>
      simulate(ship(10, laser('x'), laser('x')), ship(10), 1, rules),
    ).toThrow(/duplicate/)
    expect(() =>
      simulate(ship(10), ship(10), 1, { ...rules, tickMs: 0 }),
    ).toThrow(RangeError)
  })
})
