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

interface PlacedModule extends Placement {
  defId: ModuleId
}

const PALETTE = [
  '#4cc9f0',
  '#f72585',
  '#b5e48c',
  '#ffb703',
  '#9d4edd',
  '#06d6a0',
  '#ef476f',
  '#8ecae6',
]

const cellKey = (x: number, y: number) => `${x},${y}`

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
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
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
  const colorOf = (id: string) =>
    PALETTE[layout.findIndex((p) => p.id === id) % PALETTE.length]

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
    <div className="sandbox grid-sandbox">
      <section className="panel">
        <h2>
          {frigate.name}: {layout.length} модулей,{' '}
          {layout.reduce((n, p) => n + p.shape.length, 0)}/{hull.length} клеток
        </h2>
        <div className="palette">
          {moduleList.map((def) => (
            <button
              key={def.id}
              className={selected === def.id ? 'primary' : ''}
              onClick={() => setSelected(def.id as ModuleId)}
            >
              {def.name} ({def.shape.length})
            </button>
          ))}
          <button
            className={selected === null ? 'primary' : ''}
            onClick={() => setSelected(null)}
          >
            Убирать
          </button>
          <button onClick={() => setRotation((r) => ((r + 1) % 4) as Rotation)}>
            Повернуть ({rotation * 90}°)
          </button>
          <button onClick={() => setPlaced([])}>Очистить</button>
        </div>
        <p className="hint">
          Выбери модуль и кликни по клетке — она станет левым верхним углом. R —
          повернуть. В режиме «Убирать» клик по модулю удаляет его. Наведи на
          модуль, чтобы подсветить соседей.
        </p>
        {check && !check.ok && (
          <p className="hint error-text">
            {check.reason === 'out-of-hull'
              ? 'Не влезает в корпус'
              : `Пересекается с ${check.with.join(', ')}`}
          </p>
        )}
      </section>

      <div className="grid-wrap">
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
            const classes = [
              'cell',
              p && 'cell--filled',
              preview && (check?.ok ? 'cell--preview-ok' : 'cell--preview-bad'),
              p && p.id === focusId && 'cell--focus',
              p && focusNeighbors.has(p.id) && 'cell--neighbor',
            ]
            return (
              <div
                key={key}
                className={classes.filter(Boolean).join(' ')}
                style={p ? { background: colorOf(p.id) } : undefined}
                title={p ? `${modules[p.defId].name} (${p.id})` : undefined}
                onMouseEnter={() => {
                  setHover({ x, y })
                  setFocusId(p?.id ?? null)
                }}
                onClick={() => onCellClick(x, y)}
              >
                {p && isAnchor(p, x, y)
                  ? modules[p.defId].name.slice(0, 2)
                  : ''}
              </div>
            )
          })}
        </div>

        <section className="panel neighbors">
          <h2>Соседи</h2>
          {layout.length === 0 && <p className="hint">Пока пусто</p>}
          <ul>
            {layout.map((p) => (
              <li key={p.id} className={p.id === focusId ? 'is-focus' : ''}>
                <span
                  className="swatch"
                  style={{ background: colorOf(p.id) }}
                />
                <code>{p.id}</code> →{' '}
                {(neighbors.get(p.id) ?? []).join(', ') || '—'}
              </li>
            ))}
          </ul>
        </section>
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
