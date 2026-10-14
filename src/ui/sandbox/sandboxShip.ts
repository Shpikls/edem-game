import { modules, type ModuleId } from '../../content/modules.ts'
import type { SandboxShipPreset } from '../../content/ships.ts'
import type { ModuleStats, Ship } from '../../engine/index.ts'

export interface SandboxModule {
  /** Stable React key. */
  uid: string
  defId: ModuleId
  stats: ModuleStats
}

export interface SandboxShip {
  hullHp: number
  modules: SandboxModule[]
}

let uidCounter = 0
export const newUid = () =>
  `m${Date.now().toString(36)}${(uidCounter++).toString(36)}`

export function createModule(defId: ModuleId): SandboxModule {
  return { uid: newUid(), defId, stats: structuredClone(modules[defId].stats) }
}

export function fromPreset(preset: SandboxShipPreset): SandboxShip {
  return { hullHp: preset.hullHp, modules: preset.modules.map(createModule) }
}

/** Engine-facing ids: 'laser#1', 'laser#2', 'shield#1' … in list order. */
export function withEngineIds(
  ship: SandboxShip,
): (SandboxModule & { id: string })[] {
  const counts = new Map<string, number>()
  return ship.modules.map((m) => {
    const n = (counts.get(m.defId) ?? 0) + 1
    counts.set(m.defId, n)
    return { ...m, id: `${m.defId}#${n}` }
  })
}

export function toEngineShip(ship: SandboxShip): Ship {
  return {
    hullHp: ship.hullHp,
    modules: withEngineIds(ship).map(({ id, stats }) => ({ id, stats })),
  }
}
