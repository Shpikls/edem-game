/**
 * Bot plays full runs with a "machine guns first" strategy.
 * Run: node --experimental-strip-types scripts/mg-runs.ts [runs]
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

const kind = (id: string) => modules[id as ModuleId].stats.kind
// MG first, one armor plate, then any weapon, then shields.
const score = (id: string, s: RunState) =>
  id === 'machinegun'
    ? 100
    : id === 'armor' && !s.placed.some((p) => p.defId === 'armor')
      ? 50
      : kind(id) === 'weapon'
        ? 30
        : kind(id) === 'shield'
          ? 10
          : 0

function shop(s: RunState): RunState {
  // repair only cracks under modules
  for (const p of s.placed)
    if (isCracked(ctx, s, p)) {
      for (const k of s.cracks) s = act(s, { type: 'repair', cell: k })
      break
    }
  for (let rerolls = 0; rerolls < 3; rerolls++) {
    let bought = true
    while (bought) {
      bought = false
      const offers = s.shop
        .map((id, slot) => ({ id, slot }))
        .filter(
          (o) => o.id && offerPrice(ctx, o.id, s.shopTiers[o.slot]) <= s.gold,
        )
        .sort((a, b) => score(b.id!, s) - score(a.id!, s))
      const best = offers[0]
      if (best && score(best.id!, s) > 0) {
        const b = act(s, { type: 'buy', slot: best.slot })
        if (b !== s) {
          s = placeAnywhere(b, b.bench.at(-1)!.uid)
          bought = true
        }
      }
    }
    // reroll looking for machine guns if it leaves money for one
    if (s.gold >= ctx.config.rerollCost + 2) s = act(s, { type: 'reroll' })
    else break
  }
  return s
}

function playRun(seed: number) {
  let s = createRun(ctx, seed)
  const log: string[] = []
  let fights = 0
  while (s.phase !== 'over') {
    while (s.salvage.length) s = act(s, { type: 'searchWreck' })
    if (s.station) s = shop(s)
    for (const b of [...s.bench]) s = placeAnywhere(s, b.uid)
    s = dodgeCracks(s)
    const round = s.round
    s = act(s, { type: 'fight' })
    fights++
    const b = s.lastBattle!
    log.push(b.result.winner === 'player' ? 'W' : b.autoJump ? 'J' : 'X')
    if (b.autoJump) log[log.length - 1] += String(round)
    s = act(s, { type: 'next' })
  }
  const mg = s.placed.filter((p) => p.defId === 'machinegun').length
  const loadout = Object.entries(
    s.placed.reduce<Record<string, number>>((m, p) => {
      const k = modules[p.defId as ModuleId].code
      m[k] = (m[k] ?? 0) + 1
      return m
    }, {}),
  )
    .map(([k, n]) => `${k}×${n}`)
    .join(' ')
  return {
    seed,
    won: s.lives > 0,
    wins: s.wins,
    round: s.round,
    jumpsLeft: s.jumps,
    fights,
    mg,
    loadout,
    log: log.join(' '),
  }
}

const N = Number(process.argv[2] ?? 10)
const res = Array.from({ length: N }, (_, i) => playRun(i + 1))
if (N <= 20) {
  console.log(
    'seed  итог       побед раунд прыжков ПМ  корабль в конце / ход боёв',
  )
  for (const r of res)
    console.log(
      `${String(r.seed).padStart(4)}  ${(r.won ? 'ПОБЕДА' : 'уничтожен').padEnd(9)}  ${String(r.wins).padStart(4)}  ${String(r.round).padStart(4)}  ${String(r.jumpsLeft).padStart(6)}  ${String(r.mg).padStart(2)}  ${r.loadout}\n${' '.repeat(44)}${r.log}`,
    )
}
const won = res.filter((r) => r.won).length
console.log(
  `\nпрошли забег: ${won}/${N} (${((won / N) * 100).toFixed(0)}%), средне побед ${(res.reduce((a, r) => a + r.wins, 0) / N).toFixed(1)}, средне потрачено прыжков ${(res.reduce((a, r) => a + (ctx.config.jumpCharges - r.jumpsLeft), 0) / N).toFixed(1)}`,
)
