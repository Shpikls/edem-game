import { describe, expect, test } from 'vitest'
import { parseShape } from './grid.ts'
import {
  buildShip,
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
    tierMultiplier: [1, 1.5, 2],
    crateOdds: () => [0.6, 0.3, 0.1],
    damagePerCrack: 10,
    maxCracksPerBattle: 100,
    cracksFromRound: 1,
    firstShopWeapons: 0,
    repairCost: 2,
    stationEvery: 1,
    lossBonus: 0,
    stationAfterLoss: false,
    jumpCharges: 2,
    stationEveryRoundFrom: 100,
    shopTierOdds: () => [1, 0, 0],
    tierPriceMultiplier: [1, 1.5, 2],
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

test('buying with a placement puts the module straight onto the hull', () => {
  let s = createRun(ctx, 1)
  while (s.shop.indexOf('gun') < 0) s = reduceRun(ctx, s, { type: 'reroll' })
  s = reduceRun(ctx, s, {
    type: 'buy',
    slot: s.shop.indexOf('gun'),
    place: { x: 0, y: 1, rotation: 0 },
  })
  expect(s.bench).toEqual([])
  expect(s.placed).toMatchObject([{ defId: 'gun', x: 0, y: 1 }])
})

test('enemy always gets a weapon first and only what fits the hull', () => {
  const rich = { ...ctx, config: { ...ctx.config, enemyBudget: () => 100 } }
  for (let seed = 1; seed <= 20; seed++) {
    const { enemy } = createRun(rich, seed)
    expect(enemy.modules[0]?.stats.kind).toBe('weapon')
    const cells = enemy.modules.reduce(
      (n, m) => n + (m.id.startsWith('gun') ? 2 : 1),
      0,
    )
    expect(cells).toBeLessThanOrEqual(6) // 3×2 hull
  }
})

describe('cracks, repair, crates', () => {
  const gunsOnly = { ...ctx, catalog: ctx.catalog.slice(0, 1) }

  test('hull damage cracks cells; modules on cracks sit out of the next fight', () => {
    let s = createRun(gunsOnly, 3)
    s = reduceRun(gunsOnly, s, {
      type: 'buy',
      slot: 0,
      place: { x: 0, y: 0, rotation: 0 },
    })
    s = reduceRun(gunsOnly, s, { type: 'fight' })
    const taken =
      50 -
      (
        (s.lastBattle!.result.events.findLast(
          (e) => e.type === 'hit' && e.target === 'player',
        ) as { hullHp: number } | undefined) ?? { hullHp: 50 }
      ).hullHp
    expect(s.cracks).toHaveLength(Math.min(6, Math.floor(taken / 10)))
    s = reduceRun(gunsOnly, s, { type: 'next' })
    const gunCracked = s.cracks.includes('0,0') || s.cracks.includes('1,0')
    const fought = reduceRun(gunsOnly, s, { type: 'fight' })
    expect(fought.lastBattle!.fielded).toHaveLength(gunCracked ? 0 : 1)
  })

  test('cannot place on a crack; repair costs gold and frees the cell', () => {
    let s = { ...createRun(gunsOnly, 1), cracks: ['0,0'], gold: 10 }
    s = reduceRun(gunsOnly, s, { type: 'buy', slot: 0 })
    const uid = s.bench[0]!.uid
    expect(
      reduceRun(gunsOnly, s, { type: 'place', uid, x: 0, y: 0, rotation: 0 }),
    ).toBe(s)
    s = reduceRun(gunsOnly, s, { type: 'repair', cell: '0,0' })
    expect(s.cracks).toEqual([])
    expect(s.gold).toBe(10 - 3 - 2)
    s = reduceRun(gunsOnly, s, { type: 'place', uid, x: 0, y: 0, rotation: 0 })
    expect(s.placed).toHaveLength(1)
  })

  test('crates turn into modules; higher tiers scale stats', () => {
    let s = {
      ...createRun(ctx, 5),
      salvage: Array.from({ length: 30 }, () => ({
        round: 5,
        pool: [] as string[],
      })),
    }
    for (let i = 0; i < 30; i++) s = reduceRun(ctx, s, { type: 'searchWreck' })
    expect(s.salvage).toEqual([])
    expect(s.bench).toHaveLength(30)
    const tiers = new Set(s.bench.map((b) => b.tier ?? 1))
    expect(tiers.size).toBeGreaterThan(1)
    const ship = buildShip(ctx, 10, [{ defId: 'gun', tier: 3 }])
    expect(ship.modules[0]!.stats).toMatchObject({ damage: 20 })
  })
})

test('station rounds: shop, repair and selling only every N rounds', () => {
  const every2 = {
    ...ctx,
    config: { ...ctx.config, stationEvery: 2, lives: 10 },
  }
  let s = createRun(every2, 1)
  expect(s.station).toBe(true)
  expect(s.shop.length).toBeGreaterThan(0)
  s = reduceRun(every2, s, { type: 'fight' })
  s = reduceRun(every2, s, { type: 'next' })
  expect(s.round).toBe(2)
  expect(s.station).toBe(false)
  expect(s.shop).toEqual([])
  const off = { ...s, cracks: ['0,0'], gold: 10 }
  expect(reduceRun(every2, off, { type: 'repair', cell: '0,0' })).toBe(off)
  expect(reduceRun(every2, off, { type: 'reroll' })).toBe(off)
  s = reduceRun(every2, s, { type: 'fight' })
  s = reduceRun(every2, s, { type: 'next' })
  expect(s.round).toBe(3)
  expect(s.station).toBe(true)
})

test('first shop always offers weapons; early crates have no stars', () => {
  const strict = {
    ...ctx,
    config: {
      ...ctx.config,
      firstShopWeapons: 2,
      crateOdds: (r: number): readonly [number, number, number] =>
        r <= 3 ? [1, 0, 0] : [0, 0, 1],
    },
  }
  for (let seed = 1; seed <= 30; seed++) {
    const s = createRun(strict, seed)
    expect(s.shop.filter((id) => id === 'gun').length).toBeGreaterThanOrEqual(2)
  }
  let s = {
    ...createRun(strict, 1),
    salvage: [1, 2, 3, 8].map((round) => ({ round, pool: [] as string[] })),
  }
  for (let i = 0; i < 4; i++) s = reduceRun(strict, s, { type: 'searchWreck' })
  expect(s.bench.map((b) => b.tier ?? 1)).toEqual([1, 1, 1, 3])
})

test('cracks per battle are capped', () => {
  const capped = {
    ...ctx,
    catalog: ctx.catalog.slice(0, 1),
    config: { ...ctx.config, maxCracksPerBattle: 2, damagePerCrack: 1 },
  }
  const s = reduceRun(capped, createRun(capped, 1), { type: 'fight' })
  expect(s.cracks.length).toBeLessThanOrEqual(2)
})

test('searching a wreck finds one of the modules that enemy carried', () => {
  let s = {
    ...createRun(ctx, 1),
    salvage: Array.from({ length: 20 }, () => ({ round: 1, pool: ['plate'] })),
  }
  for (let i = 0; i < 20; i++) s = reduceRun(ctx, s, { type: 'searchWreck' })
  expect(new Set(s.bench.map((b) => b.defId))).toEqual(new Set(['plate']))
})

test('a win records the enemy loadout as salvage', () => {
  const gunsOnly = { ...ctx, catalog: ctx.catalog.slice(0, 1) }
  let s = createRun(gunsOnly, 2)
  s = reduceRun(gunsOnly, s, {
    type: 'buy',
    slot: 0,
    place: { x: 0, y: 0, rotation: 0 },
  })
  s = reduceRun(gunsOnly, s, {
    type: 'buy',
    slot: 1,
    place: { x: 0, y: 1, rotation: 0 },
  })
  s = reduceRun(gunsOnly, s, { type: 'fight' })
  if (s.lastBattle!.result.winner === 'player') {
    expect(s.salvage).toEqual([{ round: 1, pool: ['gun'] }])
  }
})

test('late game: a station every round, star offers cost more', () => {
  const late = {
    ...ctx,
    config: {
      ...ctx.config,
      stationEvery: 2,
      stationEveryRoundFrom: 3,
      lives: 10,
      rounds: 10,
      shopTierOdds: (r: number): readonly [number, number, number] =>
        r >= 3 ? [0, 1, 0] : [1, 0, 0],
    },
  }
  let s = createRun(late, 1)
  const stations: boolean[] = []
  for (let i = 0; i < 5; i++) {
    stations.push(s.station)
    s = reduceRun(late, s, { type: 'fight' })
    s = reduceRun(late, s, { type: 'next' })
  }
  expect(stations).toEqual([true, false, true, true, true])
  expect(s.shopTiers.every((t) => t === 2)).toBe(true)
  const slot = s.shop.indexOf('gun')
  if (slot >= 0) {
    const bought = reduceRun(late, { ...s, gold: 100 }, { type: 'buy', slot })
    expect(bought.gold).toBe(100 - Math.ceil(3 * 1.5))
    expect(bought.bench.at(-1)?.tier).toBe(2)
  }
})

describe('comeback after a loss', () => {
  const gunsOnly = { ...ctx, catalog: ctx.catalog.slice(0, 1) }
  const comeback = {
    ...gunsOnly,
    config: {
      ...gunsOnly.config,
      stationEvery: 2,
      lossBonus: 2,
      stationAfterLoss: true,
      lives: 10,
      rounds: 10,
      enemyBudget: (level: number) => level * 3,
    },
  }

  test('a loss pays out, forces a station and keeps the enemy level', () => {
    let s = createRun(comeback, 1)
    const enemyBefore = s.enemy.modules.length
    s = reduceRun(comeback, s, { type: 'fight' }) // empty ship loses
    expect(s.lastBattle!.result.winner).toBe('enemy')
    const gold = s.gold
    s = reduceRun(comeback, s, { type: 'next' })
    expect(gold).toBe(comeback.config.startGold + 2)
    expect(s.round).toBe(2)
    expect(s.station).toBe(true) // round 2 is normally not a station
    expect(s.enemy.modules.length).toBe(enemyBefore) // still level 1
  })
})

describe('emergency jump', () => {
  const gunsOnly = { ...ctx, catalog: ctx.catalog.slice(0, 1) }
  const cfg = {
    ...gunsOnly,
    config: { ...gunsOnly.config, stationEvery: 2, lives: 5, rounds: 10 },
  }

  test('jumping out keeps the life, repairs all and returns to the same mission', () => {
    let s = { ...createRun(cfg, 1), cracks: ['0,0', '1,1'] }
    const enemy = s.enemy
    s = reduceRun(cfg, s, { type: 'fight' }) // empty ship loses
    expect(s.lives).toBe(4)
    s = reduceRun(cfg, s, { type: 'jump' })
    expect(s.phase).toBe('shop')
    expect(s.round).toBe(1)
    expect(s.enemy).toEqual(enemy)
    expect(s.lives).toBe(5)
    expect(s.cracks).toEqual([])
    expect(s.jumps).toBe(1)
    expect(s.gold).toBe(cfg.config.startGold)
    expect(s.jumped).toBe(true)
  })

  test('no jumps left → jump is ignored', () => {
    let s = { ...createRun(cfg, 1), jumps: 0 }
    s = reduceRun(cfg, s, { type: 'fight' })
    expect(reduceRun(cfg, s, { type: 'jump' })).toBe(s)
  })
})
