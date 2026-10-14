import type { Cell, Placement, Rotation, Shape } from './grid.ts'
import { autoPlace, checkPlacement, placedCells } from './grid.ts'
import { createRng } from './rng.ts'
import { simulate } from './simulate.ts'
import type { BattleResult, BattleRules, ModuleStats, Ship } from './types.ts'

/** Everything a run needs to know about a module type. Provided by content. */
export interface CatalogEntry {
  id: string
  price: number
  shape: Shape
  stats: ModuleStats
}

export interface RunConfig {
  rounds: number
  lives: number
  startGold: number
  /** Gold added at the start of every round after the first. */
  income: number
  winBonus: number
  rerollCost: number
  shopSize: number
  hullHp: number
  /** Enemy gold budget for a 1-based round. */
  enemyBudget: (round: number) => number
  enemyHullHp: (round: number) => number
  /** Stat multiplier per tier: [Mk I, Mk II, Mk III]. */
  tierMultiplier: readonly [number, number, number]
  /** Tier odds [★, ★★, ★★★] for a crate earned in this round; sums to 1. */
  crateOdds: (round: number) => readonly [number, number, number]
  /** One hull cell cracks per this much hull damage taken in a battle… */
  damagePerCrack: number
  /** …but never more than this many per battle. */
  maxCracksPerBattle: number
  /** No cracks before this round, so a fresh ship reaches its first repair stop intact. */
  cracksFromRound: number
  /** Minimum weapons offered in the very first shop. */
  firstShopWeapons: number
  repairCost: number
  /** A supply station (shop, repair, selling) opens every N rounds, starting with round 1. */
  stationEvery: number
}

export type Tier = 1 | 2 | 3

export interface RunContext {
  catalog: readonly CatalogEntry[]
  hull: Shape
  rules: BattleRules
  config: RunConfig
}

export interface Item {
  uid: string
  defId: string
  /** Mk I–III; absent means Mk I. */
  tier?: Tier
}

export interface PlacedItem extends Item {
  x: number
  y: number
  rotation: Rotation
}

export interface Battle {
  player: Ship
  enemy: Ship
  result: BattleResult
  /** Placed items that fought, with their engine ids (modules on cracked cells sit out). */
  fielded: { uid: string; id: string }[]
  /** Cells cracked by this battle (keys 'x,y'). */
  newCracks: string[]
  crateWon: boolean
}

export interface RunState {
  /** RNG state; the whole run is reproducible from the initial seed and the actions. */
  rngState: number
  round: number
  lives: number
  gold: number
  wins: number
  phase: 'shop' | 'battle' | 'over'
  /** null = already bought this visit. */
  shop: (string | null)[]
  bench: Item[]
  placed: PlacedItem[]
  enemy: Ship
  lastBattle: Battle | null
  nextUid: number
  /** Cracked hull cells ('x,y'): nothing can be placed there, modules on them don't fight. */
  cracks: string[]
  /** Unopened loot crates: the round each one was earned in (sets tier odds). */
  crates: number[]
  /** Supply station this round: shop, repair and selling are available. */
  station: boolean
}

export type RunAction =
  /** Buys into the bench, or straight onto the hull if `place` is given and fits. */
  | {
      type: 'buy'
      slot: number
      place?: { x: number; y: number; rotation: Rotation }
    }
  | { type: 'reroll' }
  | { type: 'place'; uid: string; x: number; y: number; rotation: Rotation }
  | { type: 'unplace'; uid: string }
  | { type: 'sell'; uid: string }
  | { type: 'fight' }
  | { type: 'next' }
  | { type: 'repair'; cell: string }
  | { type: 'repairAll' }
  | { type: 'openCrate' }

export const sellPrice = (price: number) => Math.max(1, Math.floor(price / 2))

const entry = (ctx: RunContext, defId: string): CatalogEntry => {
  const e = ctx.catalog.find((c) => c.id === defId)
  if (!e) throw new Error(`unknown module '${defId}'`)
  return e
}

export const cellKey = (c: Cell) => `${c.x},${c.y}`

export const isStationRound = (ctx: RunContext, round: number) =>
  (round - 1) % ctx.config.stationEvery === 0

/** Rounds until the next station (0 = this round). */
export function roundsToStation(ctx: RunContext, round: number): number {
  const k = ctx.config.stationEvery
  return (k - ((round - 1) % k)) % k
}

export function scaleStats(stats: ModuleStats, m: number): ModuleStats {
  const r = (v: number) => Math.round(v * m)
  switch (stats.kind) {
    case 'weapon':
      return { ...stats, damage: r(stats.damage) }
    case 'shield':
      return {
        ...stats,
        capacity: r(stats.capacity),
        regenAmount: r(stats.regenAmount),
      }
    case 'armor':
      return { ...stats, armor: r(stats.armor) }
  }
}

export function itemStats(
  ctx: RunContext,
  item: { defId: string; tier?: Tier },
): ModuleStats {
  const base = entry(ctx, item.defId).stats
  const tier = item.tier ?? 1
  return tier === 1
    ? base
    : scaleStats(base, ctx.config.tierMultiplier[tier - 1]!)
}

/** Ship from modules; engine ids are 'defId#n' numbered in list order. */
export function buildShip(
  ctx: RunContext,
  hullHp: number,
  items: readonly (string | { defId: string; tier?: Tier })[],
): Ship {
  const counts = new Map<string, number>()
  return {
    hullHp,
    modules: items.map((item) => {
      const it = typeof item === 'string' ? { defId: item } : item
      const n = (counts.get(it.defId) ?? 0) + 1
      counts.set(it.defId, n)
      return { id: `${it.defId}#${n}`, stats: itemStats(ctx, it) }
    }),
  }
}

/** Is any cell of this placed item cracked? */
export function isCracked(
  ctx: RunContext,
  state: RunState,
  p: PlacedItem,
): boolean {
  const cracks = new Set(state.cracks)
  return placedCells(toPlacement(ctx, p)).some((c) => cracks.has(cellKey(c)))
}

function rollShop(ctx: RunContext, rngState: number, minWeapons = 0) {
  const rng = createRng(rngState)
  const shop = Array.from(
    { length: ctx.config.shopSize },
    () => rng.pick(ctx.catalog).id,
  )
  // Guarantee affordable weapons (first shop), replacing non-weapons from the end.
  const weapons = ctx.catalog.filter(
    (c) => c.stats.kind === 'weapon' && c.price <= ctx.config.startGold,
  )
  const isWeapon = (id: string) => entry(ctx, id).stats.kind === 'weapon'
  for (let i = shop.length - 1; i >= 0 && weapons.length > 0; i--) {
    if (shop.filter(isWeapon).length >= minWeapons) break
    if (!isWeapon(shop[i]!)) shop[i] = rng.pick(weapons).id
  }
  return { shop, rngState: rng.state }
}

/**
 * Buys random affordable modules that still fit on the hull until the budget runs out.
 * The first pick is always a weapon (if any is affordable) so the enemy can fight.
 */
function rollEnemy(ctx: RunContext, rngState: number, round: number) {
  const rng = createRng(rngState)
  let budget = ctx.config.enemyBudget(round)
  const picks: CatalogEntry[] = []
  const fits = (extra: CatalogEntry) =>
    autoPlace(
      ctx.hull,
      [...picks, extra].map((c, i) => ({ id: String(i), shape: c.shape })),
    ).every((p) => p !== null)
  for (;;) {
    let options = ctx.catalog.filter((c) => c.price <= budget && fits(c))
    if (picks.length === 0 && options.some((c) => c.stats.kind === 'weapon')) {
      options = options.filter((c) => c.stats.kind === 'weapon')
    }
    if (options.length === 0) break
    const pick = rng.pick(options)
    picks.push(pick)
    budget -= pick.price
  }
  return {
    enemy: buildShip(
      ctx,
      ctx.config.enemyHullHp(round),
      picks.map((c) => c.id),
    ),
    rngState: rng.state,
  }
}

function startRound(ctx: RunContext, state: RunState, round: number): RunState {
  const station = isStationRound(ctx, round)
  const shop = station
    ? rollShop(
        ctx,
        state.rngState,
        round === 1 ? ctx.config.firstShopWeapons : 0,
      )
    : { shop: [], rngState: state.rngState }
  const enemy = rollEnemy(ctx, shop.rngState, round)
  return {
    ...state,
    round,
    phase: 'shop',
    station,
    shop: shop.shop,
    enemy: enemy.enemy,
    rngState: enemy.rngState,
  }
}

export function createRun(ctx: RunContext, seed: number): RunState {
  const base: RunState = {
    rngState: seed >>> 0,
    round: 1,
    lives: ctx.config.lives,
    gold: ctx.config.startGold,
    wins: 0,
    phase: 'shop',
    shop: [],
    bench: [],
    placed: [],
    enemy: { hullHp: 1, modules: [] },
    lastBattle: null,
    nextUid: 1,
    cracks: [],
    crates: [],
    station: true,
  }
  return startRound(ctx, base, 1)
}

const toItem = ({ uid, defId, tier }: Item): Item =>
  tier && tier > 1 ? { uid, defId, tier } : { uid, defId }

const toPlacement = (ctx: RunContext, p: PlacedItem): Placement => ({
  id: p.uid,
  shape: entry(ctx, p.defId).shape,
  x: p.x,
  y: p.y,
  rotation: p.rotation,
})

/** Pure reducer. Invalid actions return the same state object. */
export function reduceRun(
  ctx: RunContext,
  state: RunState,
  action: RunAction,
): RunState {
  if (state.phase === 'over') return state

  if (state.phase === 'battle') {
    if (action.type !== 'next') return state
    const over = state.lives <= 0 || state.round >= ctx.config.rounds
    if (over) return { ...state, phase: 'over' }
    return startRound(
      ctx,
      { ...state, gold: state.gold + ctx.config.income },
      state.round + 1,
    )
  }

  const stationOnly = ['buy', 'reroll', 'sell', 'repair', 'repairAll']
  if (!state.station && stationOnly.includes(action.type)) return state

  switch (action.type) {
    case 'buy': {
      const defId = state.shop[action.slot]
      if (!defId) return state
      const { price } = entry(ctx, defId)
      if (price > state.gold) return state
      const uid = `i${state.nextUid}`
      const bought: RunState = {
        ...state,
        gold: state.gold - price,
        shop: state.shop.map((s, i) => (i === action.slot ? null : s)),
        bench: [...state.bench, { uid, defId }],
        nextUid: state.nextUid + 1,
      }
      return action.place
        ? reduceRun(ctx, bought, { type: 'place', uid, ...action.place })
        : bought
    }
    case 'reroll': {
      if (state.gold < ctx.config.rerollCost) return state
      const shop = rollShop(ctx, state.rngState)
      return {
        ...state,
        gold: state.gold - ctx.config.rerollCost,
        shop: shop.shop,
        rngState: shop.rngState,
      }
    }
    case 'place': {
      const item =
        state.bench.find((i) => i.uid === action.uid) ??
        state.placed.find((i) => i.uid === action.uid)
      if (!item) return state
      const candidate: PlacedItem = {
        ...item,
        x: action.x,
        y: action.y,
        rotation: action.rotation,
      }
      const others = state.placed.filter((p) => p.uid !== item.uid)
      const cracks = new Set(state.cracks)
      const check = checkPlacement(
        ctx.hull.filter((c) => !cracks.has(cellKey(c))),
        others.map((p) => toPlacement(ctx, p)),
        toPlacement(ctx, candidate),
      )
      if (!check.ok) return state
      return {
        ...state,
        bench: state.bench.filter((i) => i.uid !== item.uid),
        placed: [...others, candidate],
      }
    }
    case 'unplace': {
      const item = state.placed.find((p) => p.uid === action.uid)
      if (!item) return state
      return {
        ...state,
        placed: state.placed.filter((p) => p.uid !== action.uid),
        bench: [...state.bench, toItem(item)],
      }
    }
    case 'sell': {
      const item =
        state.bench.find((i) => i.uid === action.uid) ??
        state.placed.find((i) => i.uid === action.uid)
      if (!item) return state
      return {
        ...state,
        gold:
          state.gold +
          sellPrice(entry(ctx, item.defId).price) * (item.tier ?? 1),
        bench: state.bench.filter((i) => i.uid !== action.uid),
        placed: state.placed.filter((p) => p.uid !== action.uid),
      }
    }
    case 'fight': {
      const rng = createRng(state.rngState)
      const battleSeed = rng.int(0, 2 ** 31 - 1)
      const active = state.placed.filter((p) => !isCracked(ctx, state, p))
      const player = buildShip(ctx, ctx.config.hullHp, active)
      const fielded = active.map((p, i) => ({
        uid: p.uid,
        id: player.modules[i]!.id,
      }))
      const result = simulate(player, state.enemy, battleSeed, ctx.rules)
      const won = result.winner === 'player'
      const lost = result.winner === 'enemy'

      // Hull damage taken → that many random intact cells crack.
      let hullLeft = player.hullHp
      for (const e of result.events) {
        if (
          (e.type === 'hit' || e.type === 'overheat') &&
          e.target === 'player'
        )
          hullLeft = e.hullHp
      }
      const taken = player.hullHp - hullLeft
      const intact = ctx.hull
        .map(cellKey)
        .filter((k) => !state.cracks.includes(k))
      const newCracks = rng
        .shuffle(intact)
        .slice(
          0,
          state.round < ctx.config.cracksFromRound
            ? 0
            : Math.min(
                ctx.config.maxCracksPerBattle,
                Math.floor(taken / ctx.config.damagePerCrack),
              ),
        )

      return {
        ...state,
        rngState: rng.state,
        phase: 'battle',
        lastBattle: {
          player,
          enemy: state.enemy,
          result,
          fielded,
          newCracks,
          crateWon: won,
        },
        wins: state.wins + (won ? 1 : 0),
        gold: state.gold + (won ? ctx.config.winBonus : 0),
        lives: state.lives - (lost ? 1 : 0),
        cracks: [...state.cracks, ...newCracks],
        crates: won ? [...state.crates, state.round] : state.crates,
      }
    }
    case 'repair': {
      if (!state.cracks.includes(action.cell)) return state
      if (state.gold < ctx.config.repairCost) return state
      return {
        ...state,
        gold: state.gold - ctx.config.repairCost,
        cracks: state.cracks.filter((k) => k !== action.cell),
      }
    }
    case 'repairAll': {
      const n = Math.min(
        state.cracks.length,
        Math.floor(state.gold / ctx.config.repairCost),
      )
      if (n === 0) return state
      return {
        ...state,
        gold: state.gold - n * ctx.config.repairCost,
        cracks: state.cracks.slice(n),
      }
    }
    case 'openCrate': {
      const earnedIn = state.crates[0]
      if (earnedIn === undefined) return state
      const rng = createRng(state.rngState)
      const defId = rng.pick(ctx.catalog).id
      const roll = rng.next()
      const [p1, p2] = ctx.config.crateOdds(earnedIn)
      const tier: Tier = roll < p1 ? 1 : roll < p1 + p2 ? 2 : 3
      return {
        ...state,
        rngState: rng.state,
        crates: state.crates.slice(1),
        bench: [...state.bench, { uid: `i${state.nextUid}`, defId, tier }],
        nextUid: state.nextUid + 1,
      }
    }
    case 'next':
      return state
  }
}
