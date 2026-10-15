import { flightMs } from '../../battle/timing.ts'
import type { BattleEvent } from '../../engine/index.ts'

export type BattleCue =
  | { name: 'laser' | 'machinegun' | 'missile' | 'railgun'; enemy: boolean }
  | { name: 'hitShield' | 'hitHull' | 'boom' | 'overheat' | 'explosion' }

/** A jump in replay time bigger than this is a skip: it stays silent. */
export const SKIP_MS = 400

const WEAPON_CUE = {
  laser: 'laser',
  machinegun: 'machinegun',
  rocket: 'missile',
} as const

/**
 * Sounds for replay time (from, to]: a shot at its launch time (synced with
 * the muzzle flash), an impact at the hit time.
 */
export function battleCues(
  events: readonly BattleEvent[],
  from: number,
  to: number,
): BattleCue[] {
  if (to <= from || to - from > SKIP_MS) return []
  const within = (at: number) => at > from && at <= to
  const cues: BattleCue[] = []
  for (const e of events) {
    if (e.type === 'hit') {
      if (within(e.t - flightMs(e.source, e.damageType))) {
        const weapon = e.source.split('#')[0] as keyof typeof WEAPON_CUE
        cues.push({
          name: WEAPON_CUE[weapon] ?? 'railgun',
          enemy: e.side === 'enemy',
        })
      }
      if (within(e.t))
        cues.push({
          name:
            e.absorbed > 0 && e.hullDamage === 0
              ? 'hitShield'
              : e.damageType === 'explosive'
                ? 'boom'
                : 'hitHull',
        })
    } else if (e.type === 'overheat' && within(e.t))
      cues.push({ name: 'overheat' })
    else if (e.type === 'destroyed' && within(e.t))
      cues.push({ name: 'explosion' })
  }
  return cues
}
