import type { BattleEvent, Side } from '../../engine/index.ts'

export const sideName: Record<Side, string> = { player: 'Игрок', enemy: 'Враг' }

const damageTypeName = {
  energy: 'энерг.',
  kinetic: 'кинет.',
  explosive: 'взрыв.',
} as const

export const formatTime = (ms: number) => `${(ms / 1000).toFixed(1)} с`

export function formatEvent(
  e: BattleEvent,
  label: (source: string) => string = (s) => s,
): string {
  switch (e.type) {
    case 'hit': {
      const parts = [
        e.absorbed > 0 && `щит −${e.absorbed}`,
        e.blocked > 0 && `броня −${e.blocked}`,
        e.hullDamage > 0 && `корпус −${e.hullDamage}`,
      ].filter(Boolean)
      return (
        `${sideName[e.side]} · ${label(e.source)} → ${e.amount} ${damageTypeName[e.damageType]}: ` +
        `${parts.join(', ') || 'без урона'} | у цели щит ${e.shieldHp}, корпус ${e.hullHp}`
      )
    }
    case 'shieldRegen':
      return `${sideName[e.side]} · ${label(e.source)}: щит +${e.amount} → ${e.shieldHp}`
    case 'overheat':
      return `Перегрев: ${sideName[e.target]} −${e.amount} → корпус ${e.hullHp}`
    case 'destroyed':
      return `${sideName[e.side]} уничтожен`
  }
}

export interface SourceSummary {
  side: Side
  source: string
  shots: number
  damage: number
  hullDamage: number
}

/** Per-weapon totals for quick balance checks. */
export function summarizeBySource(
  events: readonly BattleEvent[],
): SourceSummary[] {
  const map = new Map<string, SourceSummary>()
  for (const e of events) {
    if (e.type !== 'hit') continue
    const key = `${e.side}:${e.source}`
    const s = map.get(key) ?? {
      side: e.side,
      source: e.source,
      shots: 0,
      damage: 0,
      hullDamage: 0,
    }
    s.shots += 1
    s.damage += e.amount
    s.hullDamage += e.hullDamage
    map.set(key, s)
  }
  return [...map.values()]
}
