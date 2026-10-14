import { useState } from 'react'
import { modules, type ModuleId } from '../../content/modules.ts'
import {
  checkPlacement,
  placedCells,
  type Placement,
  type Rotation,
  type Shape,
} from '../../engine/index.ts'

export interface GridModule {
  uid: string
  defId: string
  label: string
  x: number
  y: number
  rotation: Rotation
}

interface Props {
  hull: Shape
  items: readonly GridModule[]
  /** What would be placed on click; null = no placement mode. */
  pending?: { uid: string; defId: string; rotation: Rotation } | null
  selectedUid?: string | null
  /** uids to flash (e.g. modules that just fired). */
  active?: ReadonlySet<string>
  onCell?: (x: number, y: number) => void
  onModule?: (uid: string) => void
  compact?: boolean
}

const key = (x: number, y: number) => `${x},${y}`
const SIDES = [
  ['t', 0, -1],
  ['r', 1, 0],
  ['b', 0, 1],
  ['l', -1, 0],
] as const

const toPlacement = (m: {
  uid: string
  defId: string
  x: number
  y: number
  rotation: Rotation
}): Placement => ({
  id: m.uid,
  shape: modules[m.defId as ModuleId].shape,
  x: m.x,
  y: m.y,
  rotation: m.rotation,
})

export function HullGrid({
  hull,
  items,
  pending,
  selectedUid,
  active,
  onCell,
  onModule,
  compact,
}: Props) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const owner = new Map<string, GridModule>()
  for (const m of items)
    for (const c of placedCells(toPlacement(m))) owner.set(key(c.x, c.y), m)

  let previewKeys = new Set<string>()
  let previewOk = false
  if (pending && hover) {
    const candidate = toPlacement({ ...pending, x: hover.x, y: hover.y })
    const others = items.filter((m) => m.uid !== pending.uid).map(toPlacement)
    previewOk = checkPlacement(hull, others, candidate).ok
    previewKeys = new Set(placedCells(candidate).map((c) => key(c.x, c.y)))
  }

  const width = Math.max(...hull.map((c) => c.x)) + 1
  const height = Math.max(...hull.map((c) => c.y)) + 1
  const hullKeys = new Set(hull.map((c) => key(c.x, c.y)))

  return (
    <div
      className={`hull-grid ${compact ? 'hull-grid--compact' : ''}`}
      style={{ gridTemplateColumns: `repeat(${width}, var(--cell))` }}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: width * height }, (_, i) => {
        const x = i % width
        const y = Math.floor(i / width)
        const k = key(x, y)
        if (!hullKeys.has(k)) return <div key={k} className="cell cell--void" />
        const m = owner.get(k)
        const classes = ['cell']
        for (const [side, dx, dy] of SIDES) {
          if (!hullKeys.has(key(x + dx, y + dy))) classes.push(`hull-${side}`)
        }
        if (m) {
          classes.push(
            'cell--filled',
            `cell--${modules[m.defId as ModuleId].stats.kind}`,
          )
          for (const [side, dx, dy] of SIDES) {
            if (owner.get(key(x + dx, y + dy))?.uid !== m.uid)
              classes.push(`edge-${side}`)
          }
          if (m.uid === selectedUid) classes.push('cell--focus')
          if (active?.has(m.uid)) classes.push('cell--active')
        }
        if (previewKeys.has(k))
          classes.push(previewOk ? 'cell--preview-ok' : 'cell--preview-bad')
        const anchor = m && placedCells(toPlacement(m))[0]
        return (
          <div
            key={k}
            className={classes.join(' ')}
            onMouseEnter={() => setHover({ x, y })}
            onClick={() => {
              if (m && m.uid !== pending?.uid && onModule) onModule(m.uid)
              else onCell?.(x, y)
            }}
          >
            {anchor && anchor.x === x && anchor.y === y && (
              <span className="cell__label">{m.label}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
