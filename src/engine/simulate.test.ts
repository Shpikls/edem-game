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
  kineticShieldBypass: 0.5,
  armorMinDamage: 1,
}

const laser = (id: string, damage = 5, cooldownMs = 1_000): ShipModule => ({
  id,
  stats: { kind: 'weapon', damage, damageType: 'energy', cooldownMs },
})

const rail = (id: string, damage = 10, cooldownMs = 1_000): ShipModule => ({
  id,
  stats: { kind: 'weapon', damage, damageType: 'kinetic', cooldownMs },
})

const shield = (
  id: string,
  capacity: number,
  regenAmount = 0,
  regenIntervalMs = 1_000,
): ShipModule => ({
  id,
  stats: { kind: 'shield', capacity, regenAmount, regenIntervalMs },
})

const plating = (id: string, armor: number): ShipModule => ({
  id,
  stats: { kind: 'armor', armor },
})

const ship = (hullHp: number, ...modules: ShipModule[]): Ship => ({
  hullHp,
  modules,
})

/** First hit of a single weapon against a ship with the given modules. */
const firstHit = (weapon: ShipModule, ...targetModules: ShipModule[]) => {
  const { events } = simulate(
    ship(100, weapon),
    ship(100, ...targetModules),
    1,
    rules,
  )
  const hit = events.find((e) => e.type === 'hit')
  if (hit?.type !== 'hit') throw new Error('no hit')
  return {
    absorbed: hit.absorbed,
    blocked: hit.blocked,
    hullDamage: hit.hullDamage,
  }
}

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
    expect(
      result.events.map((e) => (e.type === 'hit' ? e.hullHp : e.type)),
    ).toEqual([15, 10, 5, 0, 'destroyed'])
    expect(result.events[0]).toEqual({
      t: 1_000,
      type: 'hit',
      side: 'player',
      source: 'laser#1',
      target: 'enemy',
      amount: 5,
      damageType: 'energy',
      absorbed: 0,
      blocked: 0,
      hullDamage: 5,
      shieldHp: 0,
      hullHp: 15,
    })
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

  describe('shields, armor and damage types', () => {
    test.each([
      // weapon,              target,                     absorbed, blocked, hull
      ['energy vs nothing', laser('w', 10), [], 0, 0, 10],
      ['kinetic vs nothing', rail('w', 10), [], 0, 0, 10],
      ['energy vs shield', laser('w', 10), [shield('s', 50)], 10, 0, 0],
      [
        'kinetic vs shield: half bypasses',
        rail('w', 10),
        [shield('s', 50)],
        5,
        0,
        5,
      ],
      ['energy vs armor: ignored', laser('w', 10), [plating('a', 4)], 0, 0, 10],
      ['kinetic vs armor', rail('w', 10), [plating('a', 4)], 0, 4, 6],
      [
        'armor stacks',
        rail('w', 10),
        [plating('a1', 4), plating('a2', 3)],
        0,
        7,
        3,
      ],
      ['armor leaves min damage', rail('w', 10), [plating('a', 50)], 0, 9, 1],
      [
        'kinetic vs shield + armor',
        rail('w', 10),
        [shield('s', 50), plating('a', 3)],
        5,
        3,
        2,
      ],
      [
        'energy overflows a weak shield',
        laser('w', 10),
        [shield('s', 4)],
        4,
        0,
        6,
      ],
      [
        'shields stack',
        laser('w', 10),
        [shield('s1', 4), shield('s2', 4)],
        8,
        0,
        2,
      ],
      [
        'odd kinetic: bypass rounds down',
        rail('w', 7),
        [shield('s', 50)],
        4,
        0,
        3,
      ],
    ] as const)(
      '%s',
      (_, weapon, targetModules, absorbed, blocked, hullDamage) => {
        expect(firstHit(weapon, ...targetModules)).toEqual({
          absorbed,
          blocked,
          hullDamage,
        })
      },
    )

    test('shield is depleted, then hull takes full energy damage', () => {
      const { events } = simulate(
        ship(100, laser('w', 10)),
        ship(100, shield('s', 15)),
        1,
        rules,
      )
      const hits = events.filter((e) => e.type === 'hit').slice(0, 3)
      expect(
        hits.map((e) => [e.absorbed, e.hullDamage, e.shieldHp, e.hullHp]),
      ).toEqual([
        [10, 0, 5, 100],
        [5, 5, 0, 95],
        [0, 10, 0, 85],
      ])
    })

    test('shield regenerates up to its capacity, not beyond', () => {
      const { events } = simulate(
        ship(100, laser('w', 6, 2_000)),
        ship(100, shield('s', 10, 4, 1_000)),
        1,
        rules,
      )
      const early = events.filter((e) => e.t <= 4_000)
      expect(
        early.map(
          (e) =>
            `${e.t} ${e.type} shield=${'shieldHp' in e ? e.shieldHp : '-'}`,
        ),
      ).toMatchInlineSnapshot(`
        [
          "2000 hit shield=4",
          "2000 shieldRegen shield=8",
          "3000 shieldRegen shield=10",
          "4000 hit shield=4",
          "4000 shieldRegen shield=8",
        ]
      `)
    })

    test('overheat ignores shields and armor', () => {
      const tank = ship(10, shield('s', 1_000, 1_000), plating('a', 1_000))
      const result = simulate(tank, ship(15), 1, rules)
      expect(result.winner).toBe('enemy')
      expect(result.durationMs).toBe(28_000)
    })

    test('absorbed + blocked + hullDamage always equals raw damage', () => {
      const attacker = ship(500, laser('l', 7, 900), rail('r', 13, 1_300))
      const defender = ship(500, shield('s', 20, 3, 700), plating('a', 5))
      for (const e of simulate(attacker, defender, 1, rules).events) {
        if (e.type === 'hit')
          expect(e.absorbed + e.blocked + e.hullDamage).toBe(e.amount)
      }
    })
  })
})
