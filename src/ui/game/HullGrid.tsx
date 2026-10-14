import type { PointerEvent as ReactPointerEvent } from 'react'
import { modules, type ModuleId } from '../../content/modules.ts'
import { silhouette } from '../../content/ships.ts'
import { placedCells, type Shape } from '../../engine/index.ts'
import {
  previewFits,
  toPlacement,
  type GridModule,
  type GridPreview,
} from './gridHelpers.ts'
import { ModuleArt } from './ModuleArt.tsx'

interface Props {
  hull: Shape
  items: readonly GridModule[]
  preview?: GridPreview | null
  /** Module hidden while it is being dragged. */
  hiddenUid?: string | null
  selectedUid?: string | null
  /** Module that just failed an action (shakes red). */
  errorUid?: string | null
  /** Cracked cells ('x,y'). */
  cracks?: ReadonlySet<string>
  /** Modules that won't fight (sit on cracks). */
  disabled?: ReadonlySet<string>
  onCrackClick?: ((cell: string) => void) | undefined
  /** Repair mode: every crack (also under modules) is tappable; dragging is off. */
  repairMode?: boolean
  /** Cells that the pending auto-repair will fix. */
  repairPreview?: ReadonlySet<string> | undefined
  onModulePointerDown?: (
    uid: string,
    cell: { x: number; y: number },
    e: ReactPointerEvent,
  ) => void
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
  selectedUid,
  errorUid,
  onModulePointerDown,
  cracks,
  disabled,
  onCrackClick,
  repairMode = false,
  repairPreview,
}: Props) {
  const visible = items.filter((m) => m.uid !== hiddenUid)
  const owner = new Map<string, GridModule>()
  for (const m of visible)
    for (const c of placedCells(toPlacement(m))) owner.set(key(c.x, c.y), m)

  const previewKeys = new Set(
    preview ? placedCells(toPlacement(preview)).map((c) => key(c.x, c.y)) : [],
  )
  const fitHull = cracks?.size
    ? hull.filter((c) => !cracks.has(key(c.x, c.y)))
    : hull
  const previewOk = preview ? previewFits(fitHull, items, preview) : false

  const width = Math.max(...hull.map((c) => c.x)) + 1
  const height = Math.max(...hull.map((c) => c.y)) + 1
  const hullKeys = new Set(hull.map((c) => key(c.x, c.y)))

  const sil = silhouette(width, height)
  const vbW = width + sil.pad.left + sil.pad.right
  const vbH = height + sil.pad.top + sil.pad.bottom
  const pts = (p: readonly (readonly [number, number])[]) =>
    p.map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <div
      className="ship-frame"
      style={{
        padding: `calc(var(--cell) * ${sil.pad.top}) calc(var(--cell) * ${sil.pad.right}) calc(var(--cell) * ${sil.pad.bottom}) calc(var(--cell) * ${sil.pad.left})`,
      }}
    >
      <svg
        className="ship-frame__svg"
        viewBox={`${-sil.pad.left} ${-sil.pad.top} ${vbW} ${vbH}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {sil.fins.map((f, i) => (
          <polygon key={`f${i}`} className="ship-frame__fin" points={pts(f)} />
        ))}
        {sil.engines.map((e, i) => (
          <rect
            key={`e${i}`}
            className="ship-frame__engine"
            x={e.x}
            y={e.y}
            width={e.w}
            height={e.h}
          />
        ))}
        <polygon className="ship-frame__hull" points={pts(sil.hull)} />
        {sil.lines.map((l, i) => (
          <polyline
            key={`l${i}`}
            className="ship-frame__line"
            points={pts(l)}
          />
        ))}
      </svg>
      <div
        className="hull-grid"
        style={{ gridTemplateColumns: `repeat(${width}, var(--cell))` }}
      >
        {Array.from({ length: width * height }, (_, i) => {
          const x = i % width
          const y = Math.floor(i / width)
          const k = key(x, y)
          if (!hullKeys.has(k))
            return <div key={k} className="cell cell--void" />
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
            if (m.uid === selectedUid) classes.push('cell--selected')
            if (m.uid === errorUid) classes.push('cell--error')
            if (onModulePointerDown && !repairMode) classes.push('is-draggable')
          }
          const cracked = cracks?.has(k) ?? false
          if (cracked) classes.push('cell--cracked')
          if (cracked && repairMode) classes.push('cell--repairable')
          if (repairPreview?.has(k)) classes.push('cell--will-repair')
          if (previewKeys.has(k))
            classes.push(previewOk ? 'cell--preview-ok' : 'cell--preview-bad')
          return (
            <div
              key={k}
              className={classes.join(' ')}
              data-cell={k}
              onPointerDown={
                m && onModulePointerDown && !repairMode
                  ? (e) => onModulePointerDown(m.uid, { x, y }, e)
                  : undefined
              }
              onClick={
                cracked && onCrackClick && (repairMode || !m)
                  ? () => onCrackClick(k)
                  : undefined
              }
            />
          )
        })}

        {visible.map((m) => (
          <div
            key={m.uid}
            className={`hull-art ${m.uid === errorUid ? 'is-error' : ''} ${
              disabled?.has(m.uid) ? 'is-disabled' : ''
            }`}
            style={{
              left: `calc(var(--cell) * ${m.x})`,
              top: `calc(var(--cell) * ${m.y})`,
            }}
          >
            <ModuleArt
              defId={m.defId}
              rotation={m.rotation}
              cell="var(--cell)"
              tier={m.tier}
            />
            <span className="hull-art__label">{m.label}</span>
          </div>
        ))}

        {preview && (
          <div
            className={`hull-art hull-art--preview ${previewOk ? '' : 'is-bad'}`}
            style={{
              left: `calc(var(--cell) * ${preview.x})`,
              top: `calc(var(--cell) * ${preview.y})`,
            }}
          >
            <ModuleArt
              defId={preview.defId}
              rotation={preview.rotation}
              cell="var(--cell)"
            />
          </div>
        )}
      </div>
    </div>
  )
}
