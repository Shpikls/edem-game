import type { Placement, Rotation, Shape } from './grid.ts'
import { autoPlace, checkPlacement } from './grid.ts'
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
}

export interface RunContext {
  catalog: readonly CatalogEntry[]
  hull: Shape
  rules: BattleRules
  config: RunConfig
}

export interface Item {
  uid: string
  defId: string
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

export const sellPrice = (price: number) => Math.max(1, Math.floor(price / 2))

const entry = (ctx: RunContext, defId: string): CatalogEntry => {
  const e = ctx.catalog.find((c) => c.id === defId)
  if (!e) throw new Error(`unknown module '${defId}'`)
  return e
}

/** Ship from modules; engine ids are 'defId#n' numbered in list order. */
export function buildShip(
  ctx: RunContext,
  hullHp: number,
  defIds: readonly string[],
): Ship {
  const counts = new Map<string, number>()
  return {
    hullHp,
    modules: defIds.map((defId) => {
      const n = (counts.get(defId) ?? 0) + 1
      counts.set(defId, n)
      return { id: `${defId}#${n}`, stats: entry(ctx, defId).stats }
    }),
  }
}

function rollShop(ctx: RunContext, rngState: number) {
  const rng = createRng(rngState)
  const shop = Array.from(
    { length: ctx.config.shopSize },
    () => rng.pick(ctx.catalog).id,
  )
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
  const shop = rollShop(ctx, state.rngState)
  const enemy = rollEnemy(ctx, shop.rngState, round)
  return {
    ...state,
    round,
    phase: 'shop',
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
  }
  return startRound(ctx, base, 1)
}

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
        uid: item.uid,
        defId: item.defId,
        x: action.x,
        y: action.y,
        rotation: action.rotation,
      }
      const others = state.placed.filter((p) => p.uid !== item.uid)
      const check = checkPlacement(
        ctx.hull,
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
        bench: [...state.bench, { uid: item.uid, defId: item.defId }],
      }
    }
    case 'sell': {
      const item =
        state.bench.find((i) => i.uid === action.uid) ??
        state.placed.find((i) => i.uid === action.uid)
      if (!item) return state
      return {
        ...state,
        gold: state.gold + sellPrice(entry(ctx, item.defId).price),
        bench: state.bench.filter((i) => i.uid !== action.uid),
        placed: state.placed.filter((p) => p.uid !== action.uid),
      }
    }
    case 'fight': {
      const rng = createRng(state.rngState)
      const battleSeed = rng.int(0, 2 ** 31 - 1)
      const player = buildShip(
        ctx,
        ctx.config.hullHp,
        state.placed.map((p) => p.defId),
      )
      const result = simulate(player, state.enemy, battleSeed, ctx.rules)
      const won = result.winner === 'player'
      const lost = result.winner === 'enemy'
      return {
        ...state,
        rngState: rng.state,
        phase: 'battle',
        lastBattle: { player, enemy: state.enemy, result },
        wins: state.wins + (won ? 1 : 0),
        gold: state.gold + (won ? ctx.config.winBonus : 0),
        lives: state.lives - (lost ? 1 : 0),
      }
    }
    case 'next':
      return state
  }
}
