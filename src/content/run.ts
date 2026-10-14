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
  shopSize: 4,
  hullHp: frigate.hullHp,
  // Roughly what the player could have spent by this round, minus a bit.
  enemyBudget: (round) => 4 + 3 * (round - 1),
  enemyHullHp: (round) => 80 + 8 * round,
}

export const runContext: RunContext = {
  catalog: moduleList,
  hull: frigate.hull,
  rules: battleRules,
  config: runConfig,
}
