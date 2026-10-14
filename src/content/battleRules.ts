import type { BattleRules } from '../engine/index.ts'

// Target: a normal battle ends in 15–25 s; overheat guarantees an end by ~40 s
// (cumulative overheat after n pulses = n(n+1)/2, i.e. ~100 HP after ~14 s).
export const battleRules: BattleRules = {
  tickMs: 100,
  overheatStartMs: 25_000,
  overheatIntervalMs: 1_000,
  overheatBaseDamage: 1,
  overheatDamageStep: 1,
  maxDurationMs: 120_000,
}
