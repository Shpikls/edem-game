/**
 * Balance report: bots with different build strategies play full runs.
 * Run: node --experimental-strip-types scripts/balance.ts [runs per strategy]
 *
 * Targets (docs/GDD.md → Баланс): missions 1–3 > 90%, a newcomer dies around
 * 5–7, an experienced player clears 50–60% of runs; every build within ±10 pp;
 * fights 6–15 s; ~1 jump per run; repair ≤ 25% of spending.
 */
import { modules, type ModuleId } from '../src/content/modules.ts'
import { runContext as ctx } from '../src/content/run.ts'
import {
  createRun,
  isCracked,
  offerPrice,
  reduceRun,
  type RunAction,
  type RunState,
} from '../src/engine/index.ts'

const act = (s: RunState, a: RunAction) => reduceRun(ctx, s, a)
const count = (s: RunState, id: string) =>
  s.placed.filter((p) => p.defId === id).length
const kind = (id: string) => modules[id as ModuleId].stats.kind
const weapons = (s: RunState) =>
  s.placed.filter((p) => kind(p.defId) === 'weapon').length

interface Strategy {
  name: string
  /** How much the bot wants this module now (≤ 0 = skip). */
  want: (id: string, s: RunState) => number
  /** Rerolls looking for its core modules. */
  rerolls: number
}

const strategies: Strategy[] = [
  {
    name: 'энергия (ЛЗ+ЩТ)',
    rerolls: 2,
    want: (id, s) =>
      id === 'laser'
        ? 100
        : id === 'shield' && count(s, 'shield') < 2
          ? weapons(s) >= 2
            ? 90
            : 40
          : kind(id) === 'weapon'
            ? 30
            : id === 'armor' && count(s, 'armor') < 1
              ? 20
              : 0,
  },
  {
    name: 'кинетика (РС+ПМ)',
    rerolls: 2,
    want: (id, s) =>
      id === 'railgun'
        ? 100
        : id === 'machinegun'
          ? 90
          : id === 'armor' && count(s, 'armor') < 2
            ? 50
            : kind(id) === 'weapon'
              ? 30
              : 0,
  },
  {
    name: 'пулемёты (ПМ)',
    rerolls: 3,
    want: (id, s) =>
      id === 'machinegun'
        ? 100
        : id === 'armor' && count(s, 'armor') < 1
          ? 50
          : kind(id) === 'weapon'
            ? 30
            : id === 'shield'
              ? 10
              : 0,
  },
  {
    name: 'ракеты (РК)',
    rerolls: 2,
    want: (id, s) =>
      id === 'rocket'
        ? 100
        : id === 'armor' && count(s, 'armor') < 1
          ? 40
          : id === 'shield' && count(s, 'shield') < 1
            ? 35
            : kind(id) === 'weapon'
              ? 30
              : 0,
  },
  {
    name: 'танк (ЩТ+БР)',
    rerolls: 2,
    want: (id, s) =>
      kind(id) === 'weapon' && weapons(s) < 2
        ? 100
        : id === 'shield' && count(s, 'shield') < 2
          ? 90
          : id === 'armor' && count(s, 'armor') < 3
            ? 80
            : kind(id) === 'weapon'
              ? 40
              : 0,
  },
  {
    name: 'новичок (что попало)',
    rerolls: 0,
    // Buys whatever is affordable, weapons a bit more often; never rerolls.
    want: (id) => (kind(id) === 'weapon' ? 50 : 40),
  },
]

function placeAnywhere(s: RunState, uid: string): RunState {
  for (const c of ctx.hull)
    for (const rotation of [0, 1, 2, 3] as const) {
      const next = act(s, { type: 'place', uid, x: c.x, y: c.y, rotation })
      if (next !== s) return next
    }
  return s
}

/** Move modules off cracked cells when possible. */
function dodgeCracks(s: RunState): RunState {
  for (const p of [...s.placed]) {
    if (!isCracked(ctx, s, p)) continue
    const off = act(s, { type: 'unplace', uid: p.uid })
    const back = placeAnywhere(off, p.uid)
    s = back.placed.some((x) => x.uid === p.uid) ? back : s
  }
  return s
}

interface Tally {
  repairGold: number
  spentGold: number
}

function shop(s: RunState, st: Strategy, t: Tally): RunState {
  // repair cracks only when they disable a module
  if (s.placed.some((p) => isCracked(ctx, s, p))) {
    const before = s.gold
    s = act(s, { type: 'repairAll' })
    t.repairGold += before - s.gold
    t.spentGold += before - s.gold
  }
  for (let r = 0; r <= st.rerolls; r++) {
    for (;;) {
      const offers = s.shop
        .map((id, slot) => ({ id, slot }))
        .filter(
          (o): o is { id: string; slot: number } =>
            !!o.id && offerPrice(ctx, o.id, s.shopTiers[o.slot]) <= s.gold,
        )
        .map((o) => ({ ...o, w: st.want(o.id, s) }))
        .filter((o) => o.w > 0)
        .sort((a, b) => b.w - a.w)
      let bought = false
      for (const o of offers) {
        const b = act(s, { type: 'buy', slot: o.slot })
        if (b === s) continue
        const placed = placeAnywhere(b, b.bench.at(-1)!.uid)
        // no room on the hull: don't waste gold on it
        if (placed.bench.length >= b.bench.length) continue
        t.spentGold += s.gold - placed.gold
        s = placed
        bought = true
        break
      }
      if (!bought) break
    }
    if (r < st.rerolls && s.gold >= ctx.config.rerollCost + 2) {
      t.spentGold += ctx.config.rerollCost
      s = act(s, { type: 'reroll' })
    } else break
  }
  return s
}

interface RunResult {
  won: boolean
  wins: number
  /** Mission the ship died in (null if won). */
  diedAt: number | null
  jumpsUsed: number
  fights: { round: number; won: boolean; ms: number }[]
  tally: Tally
}

function playRun(st: Strategy, seed: number): RunResult {
  let s = createRun(ctx, seed)
  const tally: Tally = { repairGold: 0, spentGold: 0 }
  const fights: RunResult['fights'] = []
  while (s.phase !== 'over') {
    while (s.salvage.length) s = act(s, { type: 'searchWreck' })
    if (s.station) s = shop(s, st, tally)
    for (const b of [...s.bench]) s = placeAnywhere(s, b.uid)
    s = dodgeCracks(s)
    const round = s.round
    s = act(s, { type: 'fight' })
    const b = s.lastBattle!
    fights.push({
      round,
      won: b.result.winner === 'player',
      ms: b.result.durationMs,
    })
    s = act(s, { type: 'next' })
  }
  const won = s.lives > 0
  return {
    won,
    wins: s.wins,
    diedAt: won ? null : s.round,
    jumpsUsed: ctx.config.jumpCharges - s.jumps,
    fights,
    tally,
  }
}

const N = Number(process.argv[2] ?? 500)
const pct = (a: number, b: number) =>
  b ? `${Math.round((a / b) * 100)}%`.padStart(4) : '   –'
const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / (xs.length || 1)
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)]! : 0
}

console.log(`${N} забегов на стратегию, seed 1…${N}\n`)
console.log(
  'стратегия              прошли  побед  гибель(мед)  прыжков  бой мед/>25с  ремонт',
)
const perMission: [string, string[]][] = []
for (const st of strategies) {
  const res = Array.from({ length: N }, (_, i) => playRun(st, i + 1))
  const fights = res.flatMap((r) => r.fights)
  const deaths = res.flatMap((r) => (r.diedAt ? [r.diedAt] : []))
  const repair = res.reduce((a, r) => a + r.tally.repairGold, 0)
  const spent = res.reduce((a, r) => a + r.tally.spentGold, 0)
  const won = res.filter((r) => r.won).length
  console.log(
    [
      st.name.padEnd(22),
      pct(won, N).padStart(6),
      avg(res.map((r) => r.wins))
        .toFixed(1)
        .padStart(6),
      (deaths.length ? String(median(deaths)) : '–').padStart(12),
      avg(res.map((r) => r.jumpsUsed))
        .toFixed(1)
        .padStart(8),
      `${(median(fights.map((f) => f.ms)) / 1000).toFixed(1)}с/${pct(
        fights.filter((f) => f.ms > 25_000).length,
        fights.length,
      ).trim()}`.padStart(13),
      pct(repair, spent).padStart(7),
    ].join(' '),
  )
  perMission.push([
    st.name,
    Array.from({ length: ctx.config.rounds }, (_, i) => {
      const f = fights.filter((x) => x.round === i + 1)
      return pct(f.filter((x) => x.won).length, f.length)
    }),
  ])
}

console.log(
  '\nдоля выигранных боёв по миссиям (с учётом повторов после прыжка)',
)
console.log(
  'стратегия             ' +
    Array.from({ length: ctx.config.rounds }, (_, i) =>
      String(i + 1).padStart(5),
    ).join(''),
)
for (const [name, row] of perMission)
  console.log(name.padEnd(22) + row.map((c) => c.padStart(5)).join(''))
