import { createRng } from './rng.ts'
import type {
  BattleEvent,
  BattleResult,
  BattleRules,
  Ship,
  Side,
} from './types.ts'

interface WeaponState {
  id: string
  damage: number
  damageType: 'energy' | 'kinetic'
  cooldownMs: number
  nextFireAt: number
}

interface ShipState {
  side: Side
  hullHp: number
  weapons: WeaponState[]
}

const opponent = (side: Side): Side => (side === 'player' ? 'enemy' : 'player')

function initShip(side: Side, ship: Ship): ShipState {
  if (!(ship.hullHp > 0))
    throw new RangeError(`${side}: hullHp must be positive`)
  const ids = new Set<string>()
  const weapons: WeaponState[] = []
  for (const module of ship.modules) {
    if (ids.has(module.id))
      throw new Error(`${side}: duplicate module id '${module.id}'`)
    ids.add(module.id)
    const { stats } = module
    if (!(stats.cooldownMs > 0))
      throw new RangeError(`${module.id}: cooldownMs must be positive`)
    weapons.push({ id: module.id, ...stats, nextFireAt: stats.cooldownMs })
  }
  return { side, hullHp: ship.hullHp, weapons }
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
}

/**
 * Deterministic auto-battle. Pure: same inputs → same result.
 *
 * Within a tick everything that triggers is resolved simultaneously: all hits land,
 * then overheat, then deaths are checked — so mutual destruction is a draw, and the
 * player/enemy processing order only affects event order in the log, never the outcome.
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
    for (const ship of ships) {
      for (const weapon of ship.weapons) {
        while (weapon.nextFireAt <= t) {
          weapon.nextFireAt += weapon.cooldownMs
          const target = shipBySide[opponent(ship.side)]
          target.hullHp = Math.max(0, target.hullHp - weapon.damage)
          events.push({
            t,
            type: 'hit',
            side: ship.side,
            source: weapon.id,
            target: target.side,
            amount: weapon.damage,
            damageType: weapon.damageType,
            hullHp: target.hullHp,
          })
        }
      }
    }

    const sinceOverheat = t - rules.overheatStartMs
    if (sinceOverheat >= 0 && sinceOverheat % rules.overheatIntervalMs === 0) {
      const pulse = sinceOverheat / rules.overheatIntervalMs
      const amount = rules.overheatBaseDamage + pulse * rules.overheatDamageStep
      for (const ship of ships) {
        ship.hullHp = Math.max(0, ship.hullHp - amount)
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
      for (const ship of dead)
        events.push({ t, type: 'destroyed', side: ship.side })
      const winner = dead.length === 2 ? 'draw' : opponent(dead[0]!.side)
      return { winner, durationMs: t, events }
    }
  }

  return { winner: 'draw', durationMs: rules.maxDurationMs, events }
}
