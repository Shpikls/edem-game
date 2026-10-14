export type Side = 'player' | 'enemy'

export type DamageType = 'energy' | 'kinetic'

export interface WeaponStats {
  kind: 'weapon'
  damage: number
  damageType: DamageType
  cooldownMs: number
}

// Union grows as new module kinds land (shield, armor, reactor, ...).
export type ModuleStats = WeaponStats

export interface ShipModule {
  /** Instance id, unique within a ship, e.g. 'laser#1'. Appears in the event log. */
  id: string
  stats: ModuleStats
}

export interface Ship {
  hullHp: number
  modules: readonly ShipModule[]
}

export interface BattleRules {
  /** Simulation step. All times are integer milliseconds. */
  tickMs: number
  /** From this moment both ships take growing overheat damage, so every battle ends. */
  overheatStartMs: number
  overheatIntervalMs: number
  /** Damage of the first overheat pulse; each next pulse adds overheatDamageStep. */
  overheatBaseDamage: number
  overheatDamageStep: number
  /** Safety net: battle is a draw if both ships somehow survive this long. */
  maxDurationMs: number
}

export type BattleEvent =
  | {
      t: number
      type: 'hit'
      side: Side
      source: string
      target: Side
      amount: number
      damageType: DamageType
      hullHp: number
    }
  | {
      t: number
      type: 'overheat'
      target: Side
      amount: number
      hullHp: number
    }
  | { t: number; type: 'destroyed'; side: Side }

export interface BattleResult {
  winner: Side | 'draw'
  durationMs: number
  events: BattleEvent[]
}
