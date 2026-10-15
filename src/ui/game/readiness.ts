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
