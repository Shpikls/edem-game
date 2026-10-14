import type { RunConfig, RunContext } from '../engine/index.ts'
import { battleRules } from './battleRules.ts'
import { moduleList } from './modules.ts'
import { frigate } from './ships.ts'

// First-pass numbers, tune by playing.
export const runConfig: RunConfig = {
  rounds: 10,
  lives: 5,
  // ~1–2 modules per round: prices are 2–4.
  startGold: 6,
  income: 3,
  winBonus: 1,
  rerollCost: 1,
  shopSize: 5,
  hullHp: frigate.hullHp,
  // Roughly what the player could have spent by this round, minus a bit.
  // Rounds 1–2 are a gentle ramp: one weapon, thin hull — a single bought weapon
  // carries you to the second station.
  enemyBudget: (round) => (round <= 2 ? 3 : 4 + 3 * (round - 1)),
  enemyHullHp: (round) => (round <= 2 ? 50 + 10 * round : 80 + 8 * round),
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
  stationEvery: 2,
}

export const runContext: RunContext = {
  catalog: moduleList,
  hull: frigate.hull,
  rules: battleRules,
  config: runConfig,
}
