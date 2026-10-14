import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { runContext } from '../../content/run.ts'
import {
  autoPlace,
  placedCells,
  renderCells,
  rotateShape,
  sellPrice,
  type Rotation,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { def, describeStats, summarizeShip } from './describe.ts'
import {
  previewFits,
  toPlacement,
  type GridModule,
  type GridPreview,
} from './gridHelpers.ts'
import { HullGrid } from './HullGrid.tsx'

interface Props {
  run: RunState
  dispatch: (action: RunAction) => void
}

type Source =
  | { kind: 'shop'; slot: number }
  | { kind: 'bench'; uid: string }
  | { kind: 'hull'; uid: string }

type Over =
  | { type: 'cell'; x: number; y: number }
  | { type: 'bench' }
  | { type: 'sell' }
  | null

interface Drag {
  source: Source
  defId: string
  rotation: Rotation
  /** Grabbed cell, relative to the rotated shape's top-left. */
  grab: { x: number; y: number }
  start: { x: number; y: number }
  pos: { x: number; y: number }
  moved: boolean
  over: Over
  cellPx: number
}

const DRAG_THRESHOLD = 6
const nextRotation = (r: Rotation) => ((r + 1) % 4) as Rotation

/** 'ЛЗ-1', 'ЛЗ-2' … numbered per type across bench + hull, in purchase order. */
function labels(run: RunState): Map<string, string> {
  const all = [...run.placed, ...run.bench].sort(
    (a, b) => Number(a.uid.slice(1)) - Number(b.uid.slice(1)),
  )
  const counts = new Map<string, number>()
  const result = new Map<string, string>()
  for (const item of all) {
    const n = (counts.get(item.defId) ?? 0) + 1
    counts.set(item.defId, n)
    result.set(item.uid, `${def(item.defId).code}-${n}`)
  }
  return result
}

function hitTest(x: number, y: number): Over {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest<HTMLElement>('[data-cell]')
  if (cell?.dataset.cell) {
    const [cx, cy] = cell.dataset.cell.split(',').map(Number)
    return { type: 'cell', x: cx!, y: cy! }
  }
  const zone = el?.closest<HTMLElement>('[data-drop]')?.dataset.drop
  if (zone === 'bench' || zone === 'sell') return { type: zone }
  return null
}

export function Shipyard({ run, dispatch }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const label = labels(run)
  const { config, hull } = runContext

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const gridItems: GridModule[] = run.placed.map((p) => ({
    ...p,
    label: label.get(p.uid) ?? '',
  }))

  const ownedUid = drag && drag.source.kind !== 'shop' ? drag.source.uid : null
  const anchorOf = (d: Drag, over: { x: number; y: number }) => ({
    x: over.x - d.grab.x,
    y: over.y - d.grab.y,
  })
  const preview: GridPreview | null =
    drag?.moved && drag.over?.type === 'cell'
      ? {
          uid: ownedUid,
          defId: drag.defId,
          rotation: drag.rotation,
          ...anchorOf(drag, drag.over),
        }
      : null

  const tap = (d: Drag) => {
    const s = d.source
    if (s.kind === 'shop') {
      dispatch({ type: 'buy', slot: s.slot })
    } else if (s.kind === 'hull') {
      // Tap on a placed module: rotate in place, if any rotation fits.
      const item = run.placed.find((p) => p.uid === s.uid)
      if (!item) return
      let r = item.rotation
      for (let i = 0; i < 3; i++) {
        r = nextRotation(r)
        const candidate = {
          uid: item.uid,
          defId: item.defId,
          x: item.x,
          y: item.y,
          rotation: r,
        }
        if (previewFits(hull, gridItems, candidate)) {
          dispatch({ type: 'place', ...candidate })
          return
        }
      }
    } else {
      // Tap on a bench item: put it in the first free spot.
      const item = run.bench.find((b) => b.uid === s.uid)
      if (!item) return
      const existing = run.placed.map((p) => toPlacement(p))
      const spot = autoPlace(hull, [
        ...existing,
        { id: item.uid, shape: def(item.defId).shape },
      ])
      const placed = spot.at(-1)
      if (spot.slice(0, -1).every((p) => p !== null) && placed) {
        dispatch({
          type: 'place',
          uid: item.uid,
          x: placed.x,
          y: placed.y,
          rotation: placed.rotation,
        })
      }
    }
  }

  const drop = (d: Drag) => {
    const s = d.source
    const over = d.over
    if (!over) return
    if (over.type === 'cell') {
      const at = { ...anchorOf(d, over), rotation: d.rotation }
      if (s.kind === 'shop') dispatch({ type: 'buy', slot: s.slot, place: at })
      else dispatch({ type: 'place', uid: s.uid, ...at })
    } else if (over.type === 'bench') {
      if (s.kind === 'shop') dispatch({ type: 'buy', slot: s.slot })
      else if (s.kind === 'hull') dispatch({ type: 'unplace', uid: s.uid })
    } else if (over.type === 'sell' && s.kind !== 'shop') {
      dispatch({ type: 'sell', uid: s.uid })
    }
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const moved =
        d.moved ||
        Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) >
          DRAG_THRESHOLD
      // Auto-scroll near the viewport edges so long drags work on phones.
      if (moved) {
        const edge = 70
        if (e.clientY < edge) window.scrollBy(0, -14)
        else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 14)
      }
      update({
        ...d,
        moved,
        pos: { x: e.clientX, y: e.clientY },
        over: moved ? hitTest(e.clientX, e.clientY) : null,
      })
    }
    const onUp = () => {
      const d = dragRef.current
      update(null)
      if (!d) return
      if (d.moved) drop(d)
      else tap(d)
    }
    const onKey = (e: KeyboardEvent) => {
      if (['r', 'R', 'к', 'К'].includes(e.key)) rotateDrag()
      if (e.key === 'Escape') update(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // Handlers read the latest drag through the ref; re-subscribe only on start/stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null])

  const rotateDrag = () => {
    const d = dragRef.current
    if (d)
      update({ ...d, rotation: nextRotation(d.rotation), grab: { x: 0, y: 0 } })
  }

  const cellPx = () =>
    document
      .querySelector('.shipyard .hull-grid .cell')
      ?.getBoundingClientRect().width ?? 40

  const startDrag = (
    e: ReactPointerEvent,
    source: Source,
    defId: string,
    rotation: Rotation,
    grab = { x: 0, y: 0 },
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    const at = { x: e.clientX, y: e.clientY }
    update({
      source,
      defId,
      rotation,
      grab,
      start: at,
      pos: at,
      moved: false,
      over: null,
      cellPx: cellPx(),
    })
  }

  const onHullPointerDown = (
    uid: string,
    cell: { x: number; y: number },
    e: ReactPointerEvent,
  ) => {
    const item = run.placed.find((p) => p.uid === uid)
    if (!item) return
    startDrag(e, { kind: 'hull', uid }, item.defId, item.rotation, {
      x: cell.x - item.x,
      y: cell.y - item.y,
    })
  }

  const enemy = summarizeShip(run.enemy)
  const dragging = drag?.moved ? drag : null
  const sellValue =
    dragging && ownedUid ? sellPrice(def(dragging.defId).price) : 0

  return (
    <div className={`shipyard ${dragging ? 'is-dragging' : ''}`}>
      <Sheet num="01" title="Верфь" className="shipyard__yard">
        <div className="yard">
          <div className="hull-wrap">
            <HullGrid
              hull={hull}
              items={gridItems}
              preview={preview}
              hiddenUid={
                dragging && drag?.source.kind === 'hull'
                  ? drag.source.uid
                  : null
              }
              onModulePointerDown={onHullPointerDown}
            />
          </div>
          <div
            className={`bench ${dragging?.over?.type === 'bench' ? 'is-over' : ''}`}
            data-drop="bench"
          >
            <div className="bench__title">склад · {run.bench.length}</div>
            {run.bench.map((item) => (
              <div
                key={item.uid}
                className={`bench__item ${
                  dragging &&
                  drag?.source.kind === 'bench' &&
                  drag.source.uid === item.uid
                    ? 'is-ghosted'
                    : ''
                }`}
                onPointerDown={(e) =>
                  startDrag(e, { kind: 'bench', uid: item.uid }, item.defId, 0)
                }
              >
                <MiniShape defId={item.defId} />
                <span>{label.get(item.uid)}</span>
              </div>
            ))}
            {run.bench.length === 0 && (
              <p className="note">{dragging ? 'сюда — на склад' : 'пусто'}</p>
            )}
          </div>
        </div>
        <p className="note">
          тяни модули: снабжение → корпус или склад, корпус ↔ склад, на
          снабжение — продать. Тап по модулю на корпусе — поворот.
        </p>
      </Sheet>

      <div className="shipyard__side">
        <Sheet
          num="02"
          title={`Противник · раунд ${run.round}`}
          className="side--enemy"
        >
          <p className="enemy-line">
            корпус {run.enemy.hullHp} ·{' '}
            {enemy.length === 0
              ? 'без модулей'
              : enemy.map((e) => `${def(e.defId).name} ×${e.count}`).join(', ')}
          </p>
          <button className="stamp" onClick={() => dispatch({ type: 'fight' })}>
            В бой
          </button>
        </Sheet>

        <Sheet
          num="03"
          title="Снабжение"
          aside={<span className="gold">{run.gold} зол.</span>}
          className={`shop-sheet ${ownedUid && dragging ? 'is-sell-target' : ''} ${
            dragging?.over?.type === 'sell' ? 'is-over' : ''
          }`}
        >
          <div data-drop="sell">
            <div className="shop">
              {run.shop.map((defId, slot) =>
                defId ? (
                  <div
                    key={slot}
                    className={`offer ${def(defId).price > run.gold ? 'is-disabled' : ''} ${
                      dragging &&
                      drag?.source.kind === 'shop' &&
                      drag.source.slot === slot
                        ? 'is-ghosted'
                        : ''
                    }`}
                    onPointerDown={(e) =>
                      def(defId).price <= run.gold &&
                      startDrag(e, { kind: 'shop', slot }, defId, 0)
                    }
                  >
                    <MiniShape defId={defId} />
                    <span className="offer__name">{def(defId).name}</span>
                    <span className="offer__stats">
                      {describeStats(def(defId).stats)}
                    </span>
                    <span className="offer__price">
                      {def(defId).price} зол.
                    </span>
                  </div>
                ) : (
                  <div key={slot} className="offer offer--sold">
                    продано
                  </div>
                ),
              )}
            </div>
            <div className="add-row shop__actions">
              <button
                disabled={run.gold < config.rerollCost}
                onClick={() => dispatch({ type: 'reroll' })}
              >
                обновить · {config.rerollCost} зол.
              </button>
            </div>
            {ownedUid && dragging && (
              <div className="sell-overlay">
                отпусти — продать за {sellValue} зол.
              </div>
            )}
          </div>
        </Sheet>
      </div>

      {dragging && dragging.over?.type !== 'cell' && (
        <DragGhost drag={dragging} />
      )}
      {dragging && (
        <button
          className="rotate-fab"
          onPointerDown={(e) => {
            e.stopPropagation()
            rotateDrag()
          }}
        >
          ↻ повернуть
        </button>
      )}
    </div>
  )
}

function DragGhost({ drag }: { drag: Drag }) {
  const cells = rotateShape(def(drag.defId).shape, drag.rotation)
  const size = drag.cellPx
  return (
    <div
      className={`drag-ghost cell--${def(drag.defId).stats.kind}`}
      style={{
        left: drag.pos.x - (drag.grab.x + 0.5) * size,
        top: drag.pos.y - (drag.grab.y + 0.5) * size,
      }}
    >
      {placedCells({ id: 'g', shape: cells, x: 0, y: 0, rotation: 0 }).map(
        (c) => (
          <i
            key={`${c.x},${c.y}`}
            style={{
              left: c.x * size,
              top: c.y * size,
              width: size,
              height: size,
            }}
          />
        ),
      )}
    </div>
  )
}

function MiniShape({ defId }: { defId: string }) {
  const rows = renderCells(def(defId).shape)
  return (
    <span
      className={`mini-shape mini-shape--${def(defId).stats.kind}`}
      style={{ gridTemplateColumns: `repeat(${rows[0]?.length ?? 1}, 7px)` }}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (
          <i key={`${x},${y}`} className={ch === '#' ? 'on' : ''} />
        )),
      )}
    </span>
  )
}
