import { useEffect, useMemo, useState } from 'react'
import { moduleList, modules, type ModuleId } from '../../content/modules.ts'
import { frigate } from '../../content/ships.ts'
import {
  adjacency,
  checkPlacement,
  placedCells,
  type Placement,
  type Rotation,
} from '../../engine/index.ts'
import { usePersistentState } from '../usePersistentState.ts'
import { drawingLabel } from './sandboxShip.ts'
import { Sheet } from './Sheet.tsx'

interface PlacedModule extends Placement {
  defId: ModuleId
}

const cellKey = (x: number, y: number) => `${x},${y}`

const SIDES = [
  ['t', 0, -1],
  ['r', 1, 0],
  ['b', 0, 1],
  ['l', -1, 0],
] as const

export function GridSandbox() {
  const hull = frigate.hull
  const [placed, setPlaced] = usePersistentState<PlacedModule[]>(
    'sandbox.grid.v1',
    [],
  )
  const [selected, setSelected] = useState<ModuleId | null>('laser')
  const [rotation, setRotation] = useState<Rotation>(0)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['r', 'R', 'к', 'К'].includes(e.key)) {
        setRotation((r) => ((r + 1) % 4) as Rotation)
      }
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Shapes in localStorage are plain data; re-attach the current catalog shape.
  const layout = useMemo(
    () => placed.map((p) => ({ ...p, shape: modules[p.defId].shape })),
    [placed],
  )
  const owner = useMemo(() => {
    const map = new Map<string, PlacedModule>()
    for (const p of layout)
      for (const c of placedCells(p)) map.set(cellKey(c.x, c.y), p)
    return map
  }, [layout])
  const neighbors = useMemo(() => adjacency(layout), [layout])

  const makeCandidate = (x: number, y: number): PlacedModule | null =>
    selected
      ? {
          id: nextId(layout, selected),
          defId: selected,
          shape: modules[selected].shape,
          rotation,
          x,
          y,
        }
      : null
  const candidate = hover ? makeCandidate(hover.x, hover.y) : null
  const check = candidate ? checkPlacement(hull, layout, candidate) : null
  const previewKeys = new Set(
    candidate ? placedCells(candidate).map((c) => cellKey(c.x, c.y)) : [],
  )

  const width = Math.max(...hull.map((c) => c.x)) + 1
  const height = Math.max(...hull.map((c) => c.y)) + 1
  const hullKeys = new Set(hull.map((c) => cellKey(c.x, c.y)))
  const focusNeighbors = new Set(focusId ? (neighbors.get(focusId) ?? []) : [])
  const usedCells = layout.reduce((n, p) => n + p.shape.length, 0)

  const onCellClick = (x: number, y: number) => {
    const hit = owner.get(cellKey(x, y))
    if (hit && !selected) {
      setPlaced(placed.filter((p) => p.id !== hit.id))
      setFocusId(null)
      return
    }
    const next = makeCandidate(x, y)
    if (next && checkPlacement(hull, layout, next).ok)
      setPlaced([...placed, next])
  }

  return (
    <div className="sandbox">
      <Sheet
        num="01"
        title="Инструмент"
        aside={
          <span className="note">
            занято {usedCells}/{hull.length} кл.
          </span>
        }
      >
        <div className="add-row">
          {moduleList.map((def) => (
            <button
              key={def.id}
              className={selected === def.id ? 'is-active' : ''}
              onClick={() => setSelected(def.id as ModuleId)}
            >
              {def.code} · {def.name} · {def.shape.length} кл.
            </button>
          ))}
          <button
            className={selected === null ? 'is-active' : ''}
            onClick={() => setSelected(null)}
          >
            снять модуль
          </button>
          <button onClick={() => setRotation((r) => ((r + 1) % 4) as Rotation)}>
            поворот {rotation * 90}°
          </button>
          <button onClick={() => setPlaced([])}>очистить</button>
        </div>
        <p className="note">
          прим.: клик по клетке ставит модуль левым верхним углом; R — поворот;
          наведение на модуль показывает соседей.
        </p>
        {check && !check.ok && (
          <p className="redline">
            {check.reason === 'out-of-hull'
              ? 'не входит в контур корпуса'
              : `пересечение с ${check.with.map(drawingLabel).join(', ')}`}
          </p>
        )}
      </Sheet>

      <div className="grid-layout">
        <Sheet
          num="02"
          title={`${frigate.name} · план палубы`}
          className="hull-sheet"
        >
          <div className="dims">
            <div
              className="hull-grid"
              style={{ gridTemplateColumns: `repeat(${width}, var(--cell))` }}
              onMouseLeave={() => {
                setHover(null)
                setFocusId(null)
              }}
            >
              {Array.from({ length: width * height }, (_, i) => {
                const x = i % width
                const y = Math.floor(i / width)
                const key = cellKey(x, y)
                if (!hullKeys.has(key))
                  return <div key={key} className="cell cell--void" />
                const p = owner.get(key)
                const preview = previewKeys.has(key)
                const classes = ['cell']
                for (const [side, dx, dy] of SIDES) {
                  if (!hullKeys.has(cellKey(x + dx, y + dy)))
                    classes.push(`hull-${side}`)
                }
                if (p) {
                  classes.push(
                    'cell--filled',
                    `cell--${modules[p.defId].stats.kind}`,
                  )
                  for (const [side, dx, dy] of SIDES) {
                    if (owner.get(cellKey(x + dx, y + dy))?.id !== p.id)
                      classes.push(`edge-${side}`)
                  }
                  if (p.id === focusId) classes.push('cell--focus')
                  if (focusNeighbors.has(p.id)) classes.push('cell--neighbor')
                }
                if (preview)
                  classes.push(
                    check?.ok ? 'cell--preview-ok' : 'cell--preview-bad',
                  )
                return (
                  <div
                    key={key}
                    className={classes.join(' ')}
                    title={
                      p
                        ? `${modules[p.defId].name} ${drawingLabel(p.id)}`
                        : undefined
                    }
                    onMouseEnter={() => {
                      setHover({ x, y })
                      setFocusId(p?.id ?? null)
                    }}
                    onClick={() => onCellClick(x, y)}
                  >
                    {p && isAnchor(p, x, y) && (
                      <span className="cell__label">{drawingLabel(p.id)}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="dim dim--h">{width} кл.</div>
            <div className="dim dim--v">{height} кл.</div>
          </div>
        </Sheet>

        <Sheet num="03" title="Спецификация · соседство" className="neighbors">
          {layout.length === 0 ? (
            <p className="note">модули не установлены</p>
          ) : (
            <table className="spec-table">
              <thead>
                <tr>
                  <th>поз.</th>
                  <th>наименование</th>
                  <th>соседи</th>
                </tr>
              </thead>
              <tbody>
                {layout.map((p) => (
                  <tr
                    key={p.id}
                    className={p.id === focusId ? 'is-focus' : ''}
                    onMouseEnter={() => setFocusId(p.id)}
                    onMouseLeave={() => setFocusId(null)}
                  >
                    <td className="code">{drawingLabel(p.id)}</td>
                    <td>{modules[p.defId].name}</td>
                    <td className="code">
                      {(neighbors.get(p.id) ?? [])
                        .map(drawingLabel)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sheet>
      </div>
    </div>
  )
}

function nextId(layout: readonly PlacedModule[], defId: ModuleId): string {
  let n = 1
  while (layout.some((p) => p.id === `${defId}#${n}`)) n++
  return `${defId}#${n}`
}

function isAnchor(p: Placement, x: number, y: number): boolean {
  const first = placedCells(p)[0]
  return first !== undefined && first.x === x && first.y === y
}
