/**
 * Early-game sanity: with just one weapon from the first shop, how often do you
 * win rounds 1–2 and what shape is the hull in at the second station?
 * Run: node --experimental-strip-types scripts/early.ts
 */
import { modules, type ModuleId } from '../src/content/modules.ts'
import { runContext as ctx } from '../src/content/run.ts'
import { createRun, reduceRun, type RunState } from '../src/engine/index.ts'

const N = 500
let wins = [0, 0]
let weaponsInFirstShop = Infinity
let cracksAtStation = 0
let maxCracks = 0
let livesLost = 0
for (let seed = 1; seed <= N; seed++) {
  let s: RunState = createRun(ctx, seed)
  const weapons = s.shop
    .map((id, slot) => ({ id, slot }))
    .filter((o) => o.id && modules[o.id as ModuleId].stats.kind === 'weapon')
  weaponsInFirstShop = Math.min(weaponsInFirstShop, weapons.length)
  const cheapest = weapons.sort(
    (a, b) => modules[a.id as ModuleId].price - modules[b.id as ModuleId].price,
  )[0]!
  s = reduceRun(ctx, s, {
    type: 'buy',
    slot: cheapest.slot,
    place: { x: 2, y: 2, rotation: 0 },
  })
  if (s.placed.length !== 1) throw new Error(`seed ${seed}: placement failed`)
  for (let r = 0; r < 2; r++) {
    s = reduceRun(ctx, s, { type: 'fight' })
    if (s.lastBattle!.result.winner === 'player') wins[r]!++
    s = reduceRun(ctx, s, { type: 'next' })
  }
  cracksAtStation += s.cracks.length
  maxCracks = Math.max(maxCracks, s.cracks.length)
  livesLost += ctx.config.lives - s.lives
  if (!s.station) throw new Error('round 3 should be a station')
}
console.log(`min weapons in first shop: ${weaponsInFirstShop}`)
console.log(`round 1 win rate: ${((wins[0]! / N) * 100).toFixed(1)}%`)
console.log(`round 2 win rate: ${((wins[1]! / N) * 100).toFixed(1)}%`)
console.log(
  `cracks at 2nd station: avg ${(cracksAtStation / N).toFixed(2)}, max ${maxCracks}`,
)
console.log(`lives lost before 2nd station: avg ${(livesLost / N).toFixed(2)}`)
