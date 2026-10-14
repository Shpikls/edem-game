/**
 * Balance probe: which full frigate loadouts win the most in a round-robin?
 * Run: node --experimental-strip-types scripts/fits.ts
 */
import { battleRules } from '../src/content/battleRules.ts'
import { modules, moduleList, type ModuleId } from '../src/content/modules.ts'
import { runConfig } from '../src/content/run.ts'
import { frigate } from '../src/content/ships.ts'
import {
  buildShip,
  rotateShape,
  simulate,
  type RunContext,
} from '../src/engine/index.ts'

const ctx: RunContext = {
  catalog: moduleList,
  hull: frigate.hull,
  rules: battleRules,
  config: runConfig,
}
const ids = moduleList.map((m) => m.id as ModuleId)
const cellsOf = (id: ModuleId) => modules[id].shape.length

// ── exact packing ─────────────────────────────────────────
// Take the first empty hull cell; either cover it with a remaining piece
// (any orientation, any of its cells on that spot) or leave it empty while
// there is slack. Failed states are memoized by (occupied mask, counts).

const hullCells = [...frigate.hull].sort((a, b) => a.y - b.y || a.x - b.x)
const hullIndex = new Map(hullCells.map((c, i) => [`${c.x},${c.y}`, i]))
const orientations = new Map(
  ids.map((id) => {
    const seen = new Set<string>()
    const list: { x: number; y: number }[][] = []
    for (const r of [0, 1, 2, 3] as const) {
      const cells = rotateShape(modules[id].shape, r)
      const k = JSON.stringify(cells)
      if (!seen.has(k)) {
        seen.add(k)
        list.push([...cells])
      }
    }
    return [id, list] as const
  }),
)

function packs(pieces: readonly ModuleId[]): boolean {
  const need = pieces.reduce((n, id) => n + cellsOf(id), 0)
  if (need > hullCells.length) return false
  const counts = ids.map((id) => pieces.filter((p) => p === id).length)
  const failed = new Set<string>()

  const go = (mask: number, left: number, slack: number): boolean => {
    if (left === 0) return true
    const memo = `${mask}|${counts.join(',')}`
    if (failed.has(memo)) return false
    let first = 0
    while (mask & (1 << first)) first++
    const f = hullCells[first]!
    for (let t = 0; t < ids.length; t++) {
      if (counts[t] === 0) continue
      for (const shape of orientations.get(ids[t]!)!) {
        for (const pivot of shape) {
          let add = 0
          let ok = true
          for (const c of shape) {
            const i = hullIndex.get(
              `${f.x + c.x - pivot.x},${f.y + c.y - pivot.y}`,
            )
            if (i === undefined || i < first || mask & (1 << i)) {
              ok = false
              break
            }
            add |= 1 << i
          }
          if (!ok) continue
          counts[t]!--
          const done = go(mask | add, left - 1, slack)
          counts[t]!++
          if (done) return true
        }
      }
    }
    if (slack > 0 && go(mask | (1 << first), left, slack - 1)) return true
    failed.add(memo)
    return false
  }
  return go(0, pieces.length, hullCells.length - need)
}

// ── enumerate loadouts ────────────────────────────────────

type Build = { list: ModuleId[]; cost: number; cells: number }
const builds: Build[] = []
const rec = (i: number, acc: ModuleId[], cells: number) => {
  if (i === ids.length) {
    if (acc.length > 0)
      builds.push({
        list: acc,
        cost: acc.reduce((n, id) => n + modules[id].price, 0),
        cells,
      })
    return
  }
  const id = ids[i]!
  for (let k = 0; cells + k * cellsOf(id) <= hullCells.length; k++) {
    rec(
      i + 1,
      [...acc, ...Array<ModuleId>(k).fill(id)],
      cells + k * cellsOf(id),
    )
  }
}
rec(0, [], 0)

console.time('packing')
const fitting = builds.filter((b) => packs(b.list))
const maximal = fitting.filter((b) =>
  ids.every((id) => !packs([...b.list, id])),
)
console.timeEnd('packing')
console.log(
  `combinations ${builds.length}, fit ${fitting.length}, full ${maximal.length}`,
)

const name = (b: Build) =>
  ids
    .map((id) => [id, b.list.filter((x) => x === id).length] as const)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${modules[id].code}×${n}`)
    .join(' ')

// ── round-robin ───────────────────────────────────────────

const HP = 100
const fight = (a: Build, b: Build) =>
  simulate(
    buildShip(ctx, HP, a.list),
    buildShip(ctx, HP, b.list),
    1,
    battleRules,
  )

function tournament(pool: Build[]) {
  const score = new Map(pool.map((b) => [b, 0]))
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!
      const b = pool[j]!
      const r = fight(a, b)
      const sa = r.winner === 'player' ? 1 : r.winner === 'draw' ? 0.5 : 0
      score.set(a, score.get(a)! + sa)
      score.set(b, score.get(b)! + 1 - sa)
    }
  }
  const games = Math.max(1, pool.length - 1)
  return [...pool]
    .map((b) => ({ b, pct: (score.get(b)! / games) * 100 }))
    .sort((x, y) => y.pct - x.pct)
}

const print = (rows: { b: Build; pct: number }[]) =>
  rows.forEach(({ b, pct }, i) =>
    console.log(
      `${String(i + 1).padStart(3)}  ${pct.toFixed(1).padStart(5)}%  ${String(b.cost).padStart(4)} зол.  ${String(b.cells).padStart(2)}/${hullCells.length}  ${name(b)}`,
    ),
  )

console.time('tournament')
const ranked = tournament(maximal)
console.timeEnd('tournament')
console.log('\n== full hull, unlimited gold ==')
print(ranked.slice(0, 10))
console.log('...bottom:')
print(ranked.slice(-3))

console.log(
  '\nhead-to-head top 5 (row vs column): +win / −loss / =draw, seconds',
)
const top = ranked.slice(0, 5).map((r) => r.b)
for (const a of top) {
  const row = top.map((b) => {
    if (a === b) return '     —'
    const r = fight(a, b)
    const s = (r.durationMs / 1000).toFixed(1)
    return (
      r.winner === 'player' ? `+${s}` : r.winner === 'enemy' ? `−${s}` : `=${s}`
    ).padStart(6)
  })
  console.log(`${name(a).padEnd(22)} ${row.join(' ')}`)
}

// Gold reality: everything a perfect run could earn.
const maxGold =
  runConfig.startGold +
  (runConfig.rounds - 1) * (runConfig.income + runConfig.winBonus)
const budgetPool = fitting.filter((b) => b.cost <= maxGold)
const budgetFull = budgetPool.filter(
  (b) =>
    !ids.some(
      (id) => b.cost + modules[id].price <= maxGold && packs([...b.list, id]),
    ),
)
console.log(
  `\n== by the final round (≤ ${maxGold} gold, all wins, no rerolls) ==`,
)
print(tournament(budgetFull).slice(0, 8))

// Mid-run snapshot: what you can have by round 5.
const goldR5 = runConfig.startGold + 4 * (runConfig.income + runConfig.winBonus)
const r5 = fitting.filter(
  (b) =>
    b.cost <= goldR5 &&
    !ids.some(
      (id) => b.cost + modules[id].price <= goldR5 && packs([...b.list, id]),
    ),
)
console.log(`\n== by round 5 (≤ ${goldR5} gold) ==`)
print(tournament(r5).slice(0, 8))
