import type { PointerEvent as ReactPointerEvent } from 'react'
import { modules, type ModuleId } from '../../content/modules.ts'
import { placedCells, type Shape } from '../../engine/index.ts'
import {
  previewFits,
  toPlacement,
  type GridModule,
  type GridPreview,
} from './gridHelpers.ts'

interface Props {
  hull: Shape
  items: readonly GridModule[]
  preview?: GridPreview | null
  /** Module hidden while it is being dragged. */
  hiddenUid?: string | null
  /** uids to flash. */
  active?: ReadonlySet<string>
  onModulePointerDown?: (
    uid: string,
    cell: { x: number; y: number },
    e: ReactPointerEvent,
  ) => void
  compact?: boolean
}

const key = (x: number, y: number) => `${x},${y}`
const SIDES = [
  ['t', 0, -1],
  ['r', 1, 0],
  ['b', 0, 1],
  ['l', -1, 0],
] as const

export function HullGrid({
  hull,
  items,
  preview,
  hiddenUid,
  active,
  onModulePointerDown,
  compact,
}: Props) {
  const visible = items.filter((m) => m.uid !== hiddenUid)
  const owner = new Map<string, GridModule>()
  for (const m of visible)
    for (const c of placedCells(toPlacement(m))) owner.set(key(c.x, c.y), m)

  const previewKeys = new Set(
    preview ? placedCells(toPlacement(preview)).map((c) => key(c.x, c.y)) : [],
  )
  const previewOk = preview ? previewFits(hull, items, preview) : false

  const width = Math.max(...hull.map((c) => c.x)) + 1
  const height = Math.max(...hull.map((c) => c.y)) + 1
  const hullKeys = new Set(hull.map((c) => key(c.x, c.y)))

  return (
    <div
      className={`hull-grid ${compact ? 'hull-grid--compact' : ''}`}
      style={{ gridTemplateColumns: `repeat(${width}, var(--cell))` }}
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
          if (active?.has(m.uid)) classes.push('cell--active')
          if (onModulePointerDown) classes.push('is-draggable')
        }
        if (previewKeys.has(k))
          classes.push(previewOk ? 'cell--preview-ok' : 'cell--preview-bad')
        const anchor = m && placedCells(toPlacement(m))[0]
        return (
          <div
            key={k}
            className={classes.join(' ')}
            data-cell={k}
            onPointerDown={
              m && onModulePointerDown
                ? (e) => onModulePointerDown(m.uid, { x, y }, e)
                : undefined
            }
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
