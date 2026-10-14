import type { RunConfig, RunContext } from '../engine/index.ts'
import { battleRules } from './battleRules.ts'
import { moduleList } from './modules.ts'
import { frigate } from './ships.ts'

// First-pass numbers, tune by playing.
export const runConfig: RunConfig = {
  rounds: 10,
  lives: 5,
  startGold: 10,
  income: 6,
  winBonus: 2,
  rerollCost: 1,
  shopSize: 4,
  hullHp: frigate.hullHp,
  // Roughly 80% of what the player could have spent by this round.
  enemyBudget: (round) => Math.round(0.8 * (10 + 6 * (round - 1))),
  enemyHullHp: (round) => 80 + 10 * round,
}

export const runContext: RunContext = {
  catalog: moduleList,
  hull: frigate.hull,
  rules: battleRules,
  config: runConfig,
}
