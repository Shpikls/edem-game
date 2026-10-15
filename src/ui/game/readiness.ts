import { runContext } from '../../content/run.ts'
import { isCracked, type RunState } from '../../engine/index.ts'
import { def } from './describe.ts'

const isWeapon = (defId: string) => def(defId).stats.kind === 'weapon'

/** Weapons on the hull that will actually fight (not sitting on cracks). */
export function armedWeapons(run: RunState): number {
  return run.placed.filter(
    (p) => isWeapon(p.defId) && !isCracked(runContext, run, p),
  ).length
}

/** The cheapest weapon in the catalog (stars only make them dearer). */
const cheapestWeapon = Math.min(
  ...runContext.catalog
    .filter((c) => c.stats.kind === 'weapon')
    .map((c) => c.price),
)

/**
 * A paid reroll that would leave an unarmed ship unable to buy any weapon:
 * worth a second tap (players burned all their gold on rerolls and flew in empty).
 */
export function rerollNeedsConfirm(run: RunState): boolean {
  if (run.freeRerolls > 0 || armedWeapons(run) > 0) return false
  const benchWeapon = run.bench.some((b) => isWeapon(b.defId))
  return (
    !benchWeapon && run.gold - runContext.config.rerollCost < cheapestWeapon
  )
}
