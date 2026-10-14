import { createRng } from './rng.ts'
import type {
  BattleEvent,
  BattleResult,
  BattleRules,
  DamageType,
  Ship,
  ShipModule,
  Side,
} from './types.ts'

interface WeaponState {
  id: string
  damage: number
  damageType: DamageType
  cooldownMs: number
  nextFireAt: number
}

interface ShieldRegenState {
  id: string
  amount: number
  intervalMs: number
  nextRegenAt: number
}

interface ShipState {
  /** Hull without the clamp at 0: how far below zero a ship was knocked (tie-breaks). */
  rawHull: number
  maxHull: number
  damageDealt: number
  side: Side
  hullHp: number
  shieldHp: number
  shieldMax: number
  armor: number
  weapons: WeaponState[]
  shieldRegens: ShieldRegenState[]
}

const opponent = (side: Side): Side => (side === 'player' ? 'enemy' : 'player')

function requirePositive(value: number, what: string): void {
  if (!(value > 0)) throw new RangeError(`${what} must be positive`)
}

function requireNonNegative(value: number, what: string): void {
  if (!(value >= 0)) throw new RangeError(`${what} must be non-negative`)
}

function initShip(side: Side, ship: Ship): ShipState {
  requirePositive(ship.hullHp, `${side}: hullHp`)
  const state: ShipState = {
    side,
    hullHp: ship.hullHp,
    rawHull: ship.hullHp,
    maxHull: ship.hullHp,
    damageDealt: 0,
    shieldHp: 0,
    shieldMax: 0,
    armor: 0,
    weapons: [],
    shieldRegens: [],
  }
  const ids = new Set<string>()
  for (const module of ship.modules) {
    if (ids.has(module.id))
      throw new Error(`${side}: duplicate module id '${module.id}'`)
    ids.add(module.id)
    addModule(state, module)
  }
  state.shieldHp = state.shieldMax
  return state
}

function addModule(state: ShipState, { id, stats }: ShipModule): void {
  switch (stats.kind) {
    case 'weapon':
      requireNonNegative(stats.damage, `${id}: damage`)
      requirePositive(stats.cooldownMs, `${id}: cooldownMs`)
      state.weapons.push({
        id,
        damage: stats.damage,
        damageType: stats.damageType,
        cooldownMs: stats.cooldownMs,
        nextFireAt: stats.cooldownMs,
      })
      return
    case 'shield':
      requireNonNegative(stats.capacity, `${id}: capacity`)
      requireNonNegative(stats.regenAmount, `${id}: regenAmount`)
      requirePositive(stats.regenIntervalMs, `${id}: regenIntervalMs`)
      state.shieldMax += stats.capacity
      state.shieldRegens.push({
        id,
        amount: stats.regenAmount,
        intervalMs: stats.regenIntervalMs,
        nextRegenAt: stats.regenIntervalMs,
      })
      return
    case 'armor':
      requireNonNegative(stats.armor, `${id}: armor`)
      state.armor += stats.armor
      return
  }
}

function validateRules(rules: BattleRules): void {
  for (const key of [
    'tickMs',
    'overheatIntervalMs',
    'maxDurationMs',
  ] as const) {
    if (!Number.isInteger(rules[key]) || rules[key] <= 0) {
      throw new RangeError(`rules.${key} must be a positive integer`)
    }
  }
  if (!(rules.kineticShieldBypass >= 0 && rules.kineticShieldBypass <= 1)) {
    throw new RangeError('rules.kineticShieldBypass must be in [0, 1]')
  }
  requireNonNegative(rules.armorMinDamage, 'rules.armorMinDamage')
}

/** Splits one hit into shield / armor / hull parts and applies it to the target. */
function applyHit(
  target: ShipState,
  damage: number,
  damageType: DamageType,
  rules: BattleRules,
): { absorbed: number; blocked: number; hullDamage: number } {
  // energy → shield first; kinetic → part bypasses the shield; explosive → ignores it.
  const bypass =
    damageType === 'explosive'
      ? damage
      : damageType === 'kinetic'
        ? Math.floor(damage * rules.kineticShieldBypass)
        : 0
  const toShield = damage - bypass
  const absorbed = Math.min(target.shieldHp, toShield)
  target.shieldHp -= absorbed

  // Armor stops kinetic hits; against explosions it counts double. Energy ignores it.
  const toHull = damage - absorbed
  const armor =
    damageType === 'kinetic'
      ? target.armor
      : damageType === 'explosive'
        ? target.armor * 2
        : 0
  let hullDamage = toHull
  if (armor > 0 && toHull > 0) {
    hullDamage = Math.max(
      Math.min(toHull, rules.armorMinDamage),
      toHull - armor,
    )
  }
  target.rawHull -= hullDamage
  target.hullHp = Math.max(0, target.rawHull)
  return { absorbed, blocked: toHull - hullDamage, hullDamage }
}

/**
 * Deterministic auto-battle. Pure: same inputs → same result.
 *
 * Tick order: weapon hits → shield regen → overheat → death check. Deaths are only
 * checked at the end of the tick, so mutual destruction is a draw, and the player/enemy
 * processing order affects only event order in the log, never the outcome.
 */
export function simulate(
  player: Ship,
  enemy: Ship,
  seed: number,
  rules: BattleRules,
): BattleResult {
  validateRules(rules)
  // Not consumed yet; accuracy and other random effects will draw from it.
  createRng(seed)

  const ships = [initShip('player', player), initShip('enemy', enemy)] as const
  const shipBySide = { player: ships[0], enemy: ships[1] }
  const events: BattleEvent[] = []

  for (let t = rules.tickMs; t <= rules.maxDurationMs; t += rules.tickMs) {
    const tickStart = events.length
    for (const ship of ships) {
      const target = shipBySide[opponent(ship.side)]
      for (const weapon of ship.weapons) {
        while (weapon.nextFireAt <= t) {
          weapon.nextFireAt += weapon.cooldownMs
          const split = applyHit(
            target,
            weapon.damage,
            weapon.damageType,
            rules,
          )
          ship.damageDealt += weapon.damage
          events.push({
            t,
            type: 'hit',
            side: ship.side,
            source: weapon.id,
            target: target.side,
            amount: weapon.damage,
            damageType: weapon.damageType,
            ...split,
            shieldHp: target.shieldHp,
            hullHp: target.hullHp,
          })
        }
      }
    }

    for (const ship of ships) {
      for (const regen of ship.shieldRegens) {
        while (regen.nextRegenAt <= t) {
          regen.nextRegenAt += regen.intervalMs
          const amount = Math.min(regen.amount, ship.shieldMax - ship.shieldHp)
          if (amount <= 0) continue
          ship.shieldHp += amount
          events.push({
            t,
            type: 'shieldRegen',
            side: ship.side,
            source: regen.id,
            amount,
            shieldHp: ship.shieldHp,
          })
        }
      }
    }

    const sinceOverheat = t - rules.overheatStartMs
    if (sinceOverheat >= 0 && sinceOverheat % rules.overheatIntervalMs === 0) {
      const pulse = sinceOverheat / rules.overheatIntervalMs
      const amount = rules.overheatBaseDamage + pulse * rules.overheatDamageStep
      for (const ship of ships) {
        ship.rawHull -= amount
        ship.hullHp = Math.max(0, ship.rawHull)
        events.push({
          t,
          type: 'overheat',
          target: ship.side,
          amount,
          hullHp: ship.hullHp,
        })
      }
    }

    const dead = ships.filter((ship) => ship.hullHp <= 0)
    if (dead.length > 0) {
      let winner: Side
      if (dead.length === 1) {
        winner = opponent(dead[0]!.side)
      } else {
        // Both went down in the same tick — no draws: the one knocked less far
        // below zero wins, then the one who dealt more damage, then the player.
        // The winner limps away with 1 hull.
        const [p, e] = ships
        winner =
          p.rawHull !== e.rawHull
            ? p.rawHull > e.rawHull
              ? 'player'
              : 'enemy'
            : p.damageDealt !== e.damageDealt
              ? p.damageDealt > e.damageDealt
                ? 'player'
                : 'enemy'
              : 'player'
        const survivor = shipBySide[winner]
        survivor.hullHp = 1
        for (let i = tickStart; i < events.length; i++) {
          const ev = events[i]!
          if (
            (ev.type === 'hit' || ev.type === 'overheat') &&
            ev.target === winner
          )
            events[i] = { ...ev, hullHp: Math.max(1, ev.hullHp) }
        }
      }
      events.push({ t, type: 'destroyed', side: opponent(winner) })
      return { winner, durationMs: t, events }
    }
  }

  // Time limit (only reachable with overheat disabled): larger hull share wins.
  const [p, e] = ships
  const winner =
    p.hullHp / p.maxHull >= e.hullHp / e.maxHull ? 'player' : 'enemy'
  return { winner, durationMs: rules.maxDurationMs, events }
}
