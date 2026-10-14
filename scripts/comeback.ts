/**
 * Comeback probe: a simple bot plays full runs; how often does it win the
 * fight right after a loss, and how do runs end?
 * Run: node --experimental-strip-types scripts/comeback.ts
 */
import { modules, type ModuleId } from '../src/content/modules.ts'
import { runContext as ctx } from '../src/content/run.ts'
import {
  createRun,
  offerPrice,
  reduceRun,
  type RunAction,
  type RunState,
} from '../src/engine/index.ts'

const act = (s: RunState, a: RunAction) => reduceRun(ctx, s, a)

/** Try every cell and rotation until the item lands on the hull. */
function placeAnywhere(s: RunState, uid: string): RunState {
  for (const c of ctx.hull)
    for (const rotation of [0, 1, 2, 3] as const) {
      const next = act(s, { type: 'place', uid, x: c.x, y: c.y, rotation })
      if (next !== s) return next
    }
  return s
}

/** Re-place modules that sit on cracks (between stations). */
function dodgeCracks(s: RunState): RunState {
  for (const p of [...s.placed]) {
    const off = act(s, { type: 'unplace', uid: p.uid })
    const back = placeAnywhere(off, p.uid)
    s = back.placed.some((x) => x.uid === p.uid) ? back : s
  }
  return s
}

const weight = (id: string) =>
  modules[id as ModuleId].stats.kind === 'weapon' ? 2 : 1

function shipyard(s: RunState): RunState {
  while (s.salvage.length) s = act(s, { type: 'searchWreck' })
  if (s.station) {
    s = act(s, { type: 'repairAll' })
    const order = s.shop
      .map((id, slot) => ({ id, slot }))
      .filter((o) => o.id)
      .sort((a, b) => weight(b.id!) - weight(a.id!))
    for (const o of order) {
      if (offerPrice(ctx, o.id!, s.shopTiers[o.slot]) > s.gold) continue
      const bought = act(s, { type: 'buy', slot: o.slot })
      if (bought === s) continue
      s = placeAnywhere(bought, bought.bench.at(-1)!.uid)
    }
  }
  for (const b of [...s.bench]) s = placeAnywhere(s, b.uid)
  return dodgeCracks(s)
}

const N = 300
let afterLoss = 0
let afterLossWins = 0
let finished = 0
const winsHist = new Map<number, number>()
for (let seed = 1; seed <= N; seed++) {
  let s = createRun(ctx, seed)
  let prevLost = false
  while (s.phase !== 'over') {
    s = shipyard(s)
    s = act(s, { type: 'fight' })
    const r = s.lastBattle!.result.winner
    if (prevLost) {
      afterLoss++
      if (r === 'player') afterLossWins++
    }
    prevLost = r === 'enemy'
    s = act(s, { type: 'next' })
  }
  if (s.lives > 0) finished++
  winsHist.set(s.wins, (winsHist.get(s.wins) ?? 0) + 1)
}
console.log(
  `fights right after a loss: ${afterLoss}, won ${((afterLossWins / Math.max(1, afterLoss)) * 100).toFixed(1)}%`,
)
console.log(
  `runs surviving all 10 rounds: ${((finished / N) * 100).toFixed(1)}%`,
)
console.log(
  'wins per run:',
  [...winsHist]
    .sort((a, b) => a[0] - b[0])
    .map(([w, n]) => `${w}:${n}`)
    .join(' '),
)
