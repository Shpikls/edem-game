import { describe, expect, test } from 'vitest'
import { parseShape } from './grid.ts'
import {
  createRun,
  reduceRun,
  type RunAction,
  type RunContext,
  type RunState,
} from './run.ts'

const ctx: RunContext = {
  catalog: [
    {
      id: 'gun',
      price: 3,
      shape: parseShape(['##']),
      stats: {
        kind: 'weapon',
        damage: 10,
        damageType: 'energy',
        cooldownMs: 1_000,
      },
    },
    {
      id: 'plate',
      price: 2,
      shape: parseShape(['#']),
      stats: { kind: 'armor', armor: 1 },
    },
  ],
  hull: parseShape(['###', '###']),
  rules: {
    tickMs: 100,
    overheatStartMs: 25_000,
    overheatIntervalMs: 1_000,
    overheatBaseDamage: 1,
    overheatDamageStep: 1,
    maxDurationMs: 120_000,
    kineticShieldBypass: 0.5,
    armorMinDamage: 1,
  },
  config: {
    rounds: 3,
    lives: 2,
    startGold: 10,
    income: 5,
    winBonus: 2,
    rerollCost: 1,
    shopSize: 4,
    hullHp: 50,
    enemyBudget: (round) => round * 3,
    enemyHullHp: () => 30,
  },
}

const play = (state: RunState, ...actions: RunAction[]) =>
  actions.reduce((s, a) => reduceRun(ctx, s, a), state)

const firstGunSlot = (s: RunState) => s.shop.indexOf('gun')

describe('run', () => {
  test('same seed and actions give the same run', () => {
    const actions: RunAction[] = [
      { type: 'reroll' },
      { type: 'buy', slot: 0 },
      { type: 'fight' },
    ]
    expect(play(createRun(ctx, 7), ...actions)).toEqual(
      play(createRun(ctx, 7), ...actions),
    )
  })

  test('buy → place → fight → next round', () => {
    let s = createRun(ctx, 1)
    while (firstGunSlot(s) < 0) s = play(s, { type: 'reroll' })
    const gold = s.gold
    s = play(s, { type: 'buy', slot: firstGunSlot(s) })
    expect(s.gold).toBe(gold - 3)
    const uid = s.bench[0]!.uid
    s = play(s, { type: 'place', uid, x: 0, y: 0, rotation: 0 })
    expect(s.bench).toEqual([])
    expect(s.placed).toHaveLength(1)

    s = play(s, { type: 'fight' })
    expect(s.phase).toBe('battle')
    expect(s.lastBattle?.player.modules.map((m) => m.id)).toEqual(['gun#1'])

    const before = s
    s = play(s, { type: 'next' })
    expect(s.round).toBe(2)
    expect(s.phase).toBe('shop')
    expect(s.gold).toBe(before.gold + ctx.config.income)
    expect(s.placed).toHaveLength(1) // layout carries over
  })

  test('rejects invalid placement and unaffordable buys', () => {
    let s = createRun(ctx, 1)
    while (firstGunSlot(s) < 0) s = play(s, { type: 'reroll' })
    s = play(s, { type: 'buy', slot: firstGunSlot(s) })
    const uid = s.bench[0]!.uid
    expect(play(s, { type: 'place', uid, x: 2, y: 0, rotation: 0 })).toBe(s) // sticks out
    const broke = { ...s, gold: 0 }
    expect(play(broke, { type: 'buy', slot: 0 })).toBe(broke)
  })

  test('an empty ship loses, costs a life, and the run ends when lives run out', () => {
    // Guns only, so the enemy is always armed.
    const gunsOnly = { ...ctx, catalog: ctx.catalog.slice(0, 1) }
    const step = (st: RunState, ...actions: RunAction[]) =>
      actions.reduce((x, a) => reduceRun(gunsOnly, x, a), st)
    let s = createRun(gunsOnly, 1)
    s = step(s, { type: 'fight' })
    expect(s.lastBattle?.result.winner).toBe('enemy')
    expect(s.lives).toBe(1)
    s = step(s, { type: 'next' }, { type: 'fight' }, { type: 'next' })
    expect(s.lives).toBeLessThanOrEqual(0)
    expect(s.phase).toBe('over')
  })
})
