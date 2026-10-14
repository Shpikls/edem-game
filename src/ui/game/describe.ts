import { modules, type ModuleId } from '../../content/modules.ts'
import type { ModuleStats, Ship } from '../../engine/index.ts'

export const def = (defId: string) => modules[defId as ModuleId]

export function describeStats(stats: ModuleStats): string {
  switch (stats.kind) {
    case 'weapon':
      return `${stats.damage} ${{ energy: 'энерг.', kinetic: 'кинет.', explosive: 'взрыв' }[stats.damageType]} / ${(stats.cooldownMs / 1000).toFixed(1)} с`
    case 'shield':
      return `щит ${stats.capacity}, +${stats.regenAmount} / ${(stats.regenIntervalMs / 1000).toFixed(1)} с`
    case 'armor':
      return `броня ${stats.armor}`
  }
}

/** 'laser#2' → 'ЛЗ-2'. */
export function engineLabel(engineId: string): string {
  const [defId, n] = engineId.split('#')
  const d = defId ? modules[defId as ModuleId] : undefined
  return d && n ? `${d.code}-${n}` : engineId
}

export function shieldMax(ship: Ship): number {
  return ship.modules.reduce(
    (sum, m) => sum + (m.stats.kind === 'shield' ? m.stats.capacity : 0),
    0,
  )
}

/** Groups engine modules by type: 'ЛЗ ×2, БР ×1'. */
export function summarizeShip(ship: Ship): { defId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of ship.modules) {
    const defId = m.id.split('#')[0]!
    counts.set(defId, (counts.get(defId) ?? 0) + 1)
  }
  return [...counts].map(([defId, count]) => ({ defId, count }))
}
