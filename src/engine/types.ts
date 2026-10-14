export type Side = 'player' | 'enemy'

export type DamageType = 'energy' | 'kinetic' | 'explosive'

export interface WeaponStats {
  kind: 'weapon'
  damage: number
  damageType: DamageType
  cooldownMs: number
}

/** Shield modules add to one shared shield pool; each regenerates it on its own timer. */
export interface ShieldStats {
  kind: 'shield'
  capacity: number
  regenAmount: number
  regenIntervalMs: number
}

/** Armor modules stack: total armor is subtracted from every kinetic hit (twice from explosive) that reaches the hull. */
export interface ArmorStats {
  kind: 'armor'
  armor: number
}

// Union grows as new module kinds land (reactor, radiator, ...).
export type ModuleStats = WeaponStats | ShieldStats | ArmorStats

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
  /** Share of kinetic damage that ignores shields and goes straight to armor/hull (0..1). */
  kineticShieldBypass: number
  /** Armor can never reduce a kinetic hit on the hull below this. */
  armorMinDamage: number
}

export type BattleEvent =
  | {
      t: number
      type: 'hit'
      side: Side
      source: string
      target: Side
      /** Raw weapon damage. absorbed + blocked + hullDamage === amount. */
      amount: number
      damageType: DamageType
      /** Taken by the shield. */
      absorbed: number
      /** Stopped by armor. */
      blocked: number
      hullDamage: number
      shieldHp: number
      hullHp: number
    }
  | {
      t: number
      type: 'shieldRegen'
      side: Side
      source: string
      amount: number
      shieldHp: number
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
