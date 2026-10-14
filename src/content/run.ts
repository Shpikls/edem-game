import type { RunConfig, RunContext } from '../engine/index.ts'
import { battleRules } from './battleRules.ts'
import { moduleList } from './modules.ts'
import { frigate } from './ships.ts'

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
  enemyBudget: (level) => (level <= 2 ? 3 : 4 + 3 * (level - 1)),
  enemyHullHp: (level) => (level <= 2 ? 50 + 10 * level : 80 + 8 * level),
  // Comeback: a loss pays gold and doesn't raise the enemy level.
  lossBonus: 2,
  // The ship has one life and two emergency jumps.
  jumpCharges: 2,
  tierMultiplier: [1, 1.5, 2],
  // No stars early; ★★ from round 4, ★★★ from round 5, frequent near the end.
  crateOdds: (round) => {
    const p2 = Math.min(0.45, Math.max(0, (round - 3) * 0.08))
    const p3 = Math.min(0.25, Math.max(0, (round - 4) * 0.045))
    return [1 - p2 - p3, p2, p3]
  },
  damagePerCrack: 20,
  maxCracksPerBattle: 3,
  cracksFromRound: 3,
  firstShopWeapons: 2,
  repairCost: 2,
  repairKits: { min: 1, max: 3, from: 3, to: 9 },
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
