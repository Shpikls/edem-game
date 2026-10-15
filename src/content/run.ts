import type { RunConfig, RunContext } from '../engine/index.ts'
import { battleRules } from './battleRules.ts'
import { moduleList } from './modules.ts'
import { frigate } from './ships.ts'

// By enemy level 1…10 (level = wins + 1). Levels 1–2: one weapon, thin hull.
const ENEMY_BUDGET = [3, 4, 10, 14, 17, 20, 22, 24, 26, 27]
const ENEMY_HULL = [65, 80, 110, 118, 126, 134, 142, 150, 156, 162]

// First-pass numbers, tune by playing.
export const runConfig: RunConfig = {
  rounds: 10,
  lives: 1,
  // ~1–2 modules per round: prices are 2–4.
  startGold: 6,
  income: 3,
  winBonus: 1,
  rerollCost: 1,
  shopSize: 4,
  hullHp: frigate.hullHp,
  // Roughly what the player could have spent by this round, minus a bit.
  // By level (= wins + 1). Levels 1–2 are a gentle ramp: one weapon, thin hull —
  // a single bought weapon carries you to the second station.
  // Steeper through the middle (missions 3–7), flatter at the end.
  enemyBudget: (level) =>
    ENEMY_BUDGET[Math.min(level, ENEMY_BUDGET.length) - 1]!,
  enemyHullHp: (level) => ENEMY_HULL[Math.min(level, ENEMY_HULL.length) - 1]!,
  // The ship has one life and two emergency jumps.
  jumpCharges: 2,
  tierMultiplier: [1, 1.5, 2],
  // No stars early; ★★ from round 4, ★★★ from round 5, frequent near the end.
  crateOdds: (round) => {
    const p2 = Math.min(0.45, Math.max(0, (round - 3) * 0.08))
    const p3 = Math.min(0.25, Math.max(0, (round - 4) * 0.045))
    return [1 - p2 - p3, p2, p3]
  },
  damagePerCrack: 40,
  maxCracksPerBattle: 2,
  cracksFromRound: 3,
  firstShopWeapons: 2,
  repairCost: 2,
  stationEvery: 2,
  // Endgame: a station every round with star modules on sale.
  stationEveryRoundFrom: 7,
  shopTierOdds: (round) => (round >= 7 ? [0.45, 0.45, 0.1] : [1, 0, 0]),
  tierPriceMultiplier: [1, 1.5, 2],
}

export const runContext: RunContext = {
  catalog: moduleList,
  hull: frigate.hull,
  rules: battleRules,
  config: runConfig,
}
