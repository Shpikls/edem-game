import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { runContext } from '../../content/run.ts'
import {
  isCracked,
  repairOrder,
  isStationRound,
  offerPrice,
  roundsToStation,
  itemStats,
  itemSellValue,
  type Rotation,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { def, describeStats } from './describe.ts'
import {
  toPlacement,
  type GridModule,
  type GridPreview,
} from './gridHelpers.ts'
import { HullGrid } from './HullGrid.tsx'
import { ModuleArt } from './ModuleArt.tsx'
import {
  firstFit,
  nextRotation,
  resolveDrop,
  rotateInPlace,
} from './rotation.ts'

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
  | { type: 'rotate' }
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

type Selection = { kind: 'hull' | 'bench'; uid: string } | null

const DRAG_THRESHOLD = 6

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
  if (zone === 'bench' || zone === 'sell' || zone === 'rotate')
    return { type: zone }
  return null
}

export function Shipyard({ run, dispatch }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [selected, setSelected] = useState<Selection>(null)
  const [benchRot, setBenchRot] = useState<Record<string, Rotation>>({})
  const [errorUid, setErrorUid] = useState<string | null>(null)
  // Repair: tap-to-fix mode and a two-step auto repair.
  const [repairMode, setRepairMode] = useState<'gold' | null>(null)
  const [autoArmed, setAutoArmed] = useState(false)
  const [autoHover, setAutoHover] = useState(false)
  // Phones: the repair panel floats over the yard and opens from the 🔧 button.
  const [repairOpen, setRepairOpen] = useState(false)
  const label = labels(run)
  const { config, hull: fullHull } = runContext
  const cracks = new Set(run.cracks)
  // Logic works on intact cells only; the grid still draws the full hull.
  const hull = fullHull.filter((c) => !cracks.has(`${c.x},${c.y}`))
  const disabled = new Set(
    run.placed.filter((p) => isCracked(runContext, run, p)).map((p) => p.uid),
  )

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const flashError = (uid: string) => {
    setErrorUid(uid)
    window.setTimeout(() => setErrorUid((u) => (u === uid ? null : u)), 450)
  }

  const gridItems: GridModule[] = run.placed.map((p) => ({
    ...p,
    label: label.get(p.uid) ?? '',
  }))
  const tierName = (t?: number) => (t === 3 ? ' ★★★' : t === 2 ? ' ★★' : '')
  const placementsExcept = (uid: string | null) =>
    run.placed.filter((p) => p.uid !== uid).map((p) => toPlacement(p))

  // Drop out a stale selection (sold / moved by another action).
  const selectedItem =
    selected?.kind === 'hull'
      ? run.placed.find((p) => p.uid === selected.uid)
      : selected?.kind === 'bench'
        ? run.bench.find((b) => b.uid === selected.uid)
        : undefined

  const ownedUid = drag && drag.source.kind !== 'shop' ? drag.source.uid : null

  const resolve = (d: Drag, over: { x: number; y: number }) =>
    resolveDrop(
      hull,
      placementsExcept(ownedUid),
      ownedUid ?? '__new__',
      def(d.defId).shape,
      d.rotation,
      d.grab,
      over,
    )

  const preview: GridPreview | null =
    drag?.moved && drag.over?.type === 'cell'
      ? (() => {
          const { placement } = resolve(drag, drag.over)
          return {
            uid: ownedUid,
            defId: drag.defId,
            x: placement.x,
            y: placement.y,
            rotation: placement.rotation,
          }
        })()
      : null

  const rotateSelected = () => {
    if (!selected || !selectedItem) return
    if (selected.kind === 'bench') {
      setBenchRot((m) => ({
        ...m,
        [selected.uid]: nextRotation(m[selected.uid] ?? 0),
      }))
      return
    }
    const item = run.placed.find((p) => p.uid === selected.uid)
    if (!item) return
    const next = rotateInPlace(
      hull,
      placementsExcept(item.uid),
      toPlacement(item),
    )
    if (next) {
      dispatch({
        type: 'place',
        uid: item.uid,
        x: next.x,
        y: next.y,
        rotation: next.rotation,
      })
    } else {
      flashError(item.uid)
    }
  }

  const autoPlaceBench = (uid: string) => {
    const item = run.bench.find((b) => b.uid === uid)
    if (!item) return
    const spot = firstFit(
      hull,
      run.placed.map((p) => toPlacement(p)),
      item.uid,
      def(item.defId).shape,
      benchRot[item.uid] ?? 0,
    )
    if (spot) {
      dispatch({
        type: 'place',
        uid: item.uid,
        x: spot.x,
        y: spot.y,
        rotation: spot.rotation,
      })
      setSelected(null)
    } else {
      flashError(uid)
    }
  }

  const tap = (d: Drag) => {
    const s = d.source
    if (s.kind === 'shop') {
      dispatch({ type: 'buy', slot: s.slot })
      return
    }
    setSelected((cur) =>
      cur?.uid === s.uid && cur.kind === s.kind
        ? null
        : { kind: s.kind, uid: s.uid },
    )
  }

  const drop = (d: Drag) => {
    const s = d.source
    const over = d.over
    if (!over) return
    if (over.type === 'cell') {
      const { placement, ok } = resolve(d, over)
      if (!ok) return
      const at = {
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation,
      }
      if (s.kind === 'shop') dispatch({ type: 'buy', slot: s.slot, place: at })
      else dispatch({ type: 'place', uid: s.uid, ...at })
      setSelected(null)
    } else if (over.type === 'bench') {
      if (s.kind === 'shop') dispatch({ type: 'buy', slot: s.slot })
      else if (s.kind === 'hull') {
        dispatch({ type: 'unplace', uid: s.uid })
        setBenchRot((m) => ({ ...m, [s.uid]: d.rotation }))
        setSelected(null)
      }
    } else if (over.type === 'sell' && s.kind !== 'shop') {
      dispatch({ type: 'sell', uid: s.uid })
      setSelected(null)
    }
  }

  // Keyboard: R rotates the dragged or selected module, Esc cancels.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  const dropRef = useRef(drop)
  const tapRef = useRef(tap)
  // Latest-callback refs for window listeners.
  useLayoutEffect(() => {
    dropRef.current = drop
    tapRef.current = tap
    keyHandler.current = (e: KeyboardEvent) => {
      if (['r', 'R', 'к', 'К'].includes(e.key)) {
        const d = dragRef.current
        if (d)
          update({
            ...d,
            rotation: nextRotation(d.rotation),
            grab: { x: 0, y: 0 },
          })
        else rotateSelected()
      }
      if (e.key === 'Escape') {
        update(null)
        setSelected(null)
      }
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      const over = moved ? hitTest(e.clientX, e.clientY) : null
      // Entering the rotate zone turns the module by 90°; leave and re-enter to turn again.
      const entersRotate = over?.type === 'rotate' && d.over?.type !== 'rotate'
      update({
        ...d,
        moved,
        pos: { x: e.clientX, y: e.clientY },
        over,
        ...(entersRotate
          ? { rotation: nextRotation(d.rotation), grab: { x: 0, y: 0 } }
          : {}),
      })
    }
    const onUp = () => {
      const d = dragRef.current
      update(null)
      if (!d) return
      if (d.moved) dropRef.current(d)
      else tapRef.current(d)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag === null, update]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const stationIn = roundsToStation(runContext, run.round)
  const repairable = Math.min(
    run.cracks.length,
    Math.floor(run.gold / config.repairCost),
  )
  const autoPreview = new Set(repairOrder(runContext, run).slice(0, repairable))
  const showPreview = autoArmed || autoHover
  const inRepair = repairMode !== null && run.cracks.length > 0
  const onCrack = (cell: string) => {
    if (run.station) dispatch({ type: 'repair', cell })
  }
  const dragging = drag?.moved ? drag : null
  const ownedItem = ownedUid
    ? (run.bench.find((b) => b.uid === ownedUid) ??
      run.placed.find((p) => p.uid === ownedUid))
    : undefined
  const sellValue =
    dragging && ownedItem ? itemSellValue(runContext, run, ownedItem) : 0
  const freeReroll = run.freeRerolls > 0

  return (
    <div className={`shipyard ${dragging ? 'is-dragging' : ''}`}>
      {run.jumped && (
        <p className="jump-note">
          ⚡ аварийный прыжок: корабль как до боя, прыжков осталось {run.jumps}.
          Аварийная стоянка: модули продаются по полной цене, одно обновление
          магазина бесплатно — перестрой корабль против другого врага того же
          уровня
        </p>
      )}

      <Sheet num="01" title="Верфь" className="shipyard__yard">
        <div className="yard">
          <div className="hull-wrap">
            <HullGrid
              hull={fullHull}
              items={gridItems}
              cracks={cracks}
              disabled={disabled}
              onCrackClick={inRepair || run.station ? onCrack : undefined}
              repairMode={inRepair}
              repairPreview={showPreview ? autoPreview : undefined}
              preview={preview}
              hiddenUid={
                dragging && drag?.source.kind === 'hull'
                  ? drag.source.uid
                  : null
              }
              selectedUid={selected?.kind === 'hull' ? selected.uid : null}
              errorUid={errorUid}
              onModulePointerDown={onHullPointerDown}
            />
          </div>
          {run.cracks.length > 0 && (
            <button
              className={`repair-toggle ${repairOpen ? 'is-active' : ''}`}
              onClick={() => setRepairOpen((o) => !o)}
            >
              🔧 {run.cracks.length}
            </button>
          )}
          <div
            className={`rotate-zone ${dragging ? 'is-live' : ''} ${
              dragging?.over?.type === 'rotate' ? 'is-over' : ''
            }`}
            data-drop="rotate"
          >
            <span className="rotate-zone__icon">↻</span>
            <span className="rotate-zone__text">
              {dragging ? 'заведи сюда — поворот' : 'поворот: заведи модуль'}
            </span>
          </div>
          <div
            className={`bench ${dragging?.over?.type === 'bench' ? 'is-over' : ''}`}
            data-drop="bench"
          >
            <div className="bench__title">склад · {run.bench.length}</div>
            {run.bench.map((item) => {
              const isSel =
                selected?.kind === 'bench' && selected.uid === item.uid
              return (
                <div
                  key={item.uid}
                  className={[
                    'bench__item',
                    isSel && 'is-selected',
                    errorUid === item.uid && 'is-error',
                    dragging &&
                      drag?.source.kind === 'bench' &&
                      drag.source.uid === item.uid &&
                      'is-ghosted',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onPointerDown={(e) =>
                    startDrag(
                      e,
                      { kind: 'bench', uid: item.uid },
                      item.defId,
                      benchRot[item.uid] ?? 0,
                    )
                  }
                >
                  <ModuleArt
                    defId={item.defId}
                    rotation={benchRot[item.uid] ?? 0}
                    cell="16px"
                    grid
                  />
                  <span>{label.get(item.uid)}</span>
                  {item.tier && item.tier > 1 && (
                    <span className={`stars stars--${item.tier}`}>
                      {'★'.repeat(item.tier)}
                    </span>
                  )}
                </div>
              )
            })}
            {run.bench.length === 0 && (
              <p className="note">{dragging ? 'сюда — на склад' : 'пусто'}</p>
            )}
          </div>
        </div>

        <div className={`actions ${selectedItem ? '' : 'is-empty'}`}>
          {selectedItem && selected ? (
            <>
              <span className="actions__what">
                <b>{label.get(selectedItem.uid)}</b>{' '}
                {def(selectedItem.defId).name}
                {tierName(selectedItem.tier)}
                <span className="note">
                  {describeStats(itemStats(runContext, selectedItem))}
                </span>
                {disabled.has(selectedItem.uid) && (
                  <span className="redline">
                    стоит на трещине — в бою не работает
                  </span>
                )}
              </span>
              <button className="actions__rotate" onClick={rotateSelected}>
                ↻ повернуть
              </button>
              {selected.kind === 'bench' ? (
                <button onClick={() => autoPlaceBench(selected.uid)}>
                  на корпус
                </button>
              ) : (
                <button
                  onClick={() => {
                    dispatch({ type: 'unplace', uid: selected.uid })
                    setSelected({ kind: 'bench', uid: selected.uid })
                  }}
                >
                  на склад
                </button>
              )}
              <button
                disabled={!run.station}
                title={run.station ? undefined : 'продажа — на станции'}
                onClick={() => {
                  dispatch({ type: 'sell', uid: selected.uid })
                  setSelected(null)
                }}
              >
                продать +{itemSellValue(runContext, run, selectedItem)}
              </button>
              <button className="link-button" onClick={() => setSelected(null)}>
                ✕
              </button>
            </>
          ) : (
            <span className="note">
              {run.station
                ? 'тяни модули из снабжения на корпус. '
                : 'расставь модули со склада. '}
              Чтобы повернуть — проведи модуль через «↻». Тап по модулю — меню.
            </span>
          )}
        </div>
        {run.cracks.length > 0 && (
          <div
            className={`repair-bar ${inRepair ? 'is-active' : ''} ${
              repairOpen || inRepair || autoArmed ? 'is-open' : ''
            }`}
          >
            <button
              className="link-button repair-bar__close"
              onClick={() => {
                setRepairOpen(false)
                setRepairMode(null)
                setAutoArmed(false)
              }}
            >
              ✕
            </button>
            <span className="redline">
              трещин: {run.cracks.length}
              {disabled.size > 0 && ` · не работает модулей: ${disabled.size}`}
            </span>
            {inRepair ? (
              <>
                <span className="repair-bar__hint">
                  тапни по трещине — {config.repairCost} зол. за клетку
                </span>
                <button onClick={() => setRepairMode(null)}>готово</button>
              </>
            ) : (
              <>
                {run.station && (
                  <>
                    <button
                      disabled={run.gold < config.repairCost}
                      onClick={() => {
                        setAutoArmed(false)
                        setRepairMode('gold')
                      }}
                    >
                      по клетке · {config.repairCost} зол.
                    </button>
                    <button
                      className={autoArmed ? 'is-armed' : ''}
                      disabled={repairable === 0}
                      onMouseEnter={() => setAutoHover(true)}
                      onMouseLeave={() => setAutoHover(false)}
                      onClick={() => {
                        if (!autoArmed) return setAutoArmed(true)
                        dispatch({ type: 'repairAll' })
                        setAutoArmed(false)
                        setAutoHover(false)
                      }}
                    >
                      {autoArmed
                        ? `подтвердить · ${repairable * config.repairCost} зол.`
                        : repairable === run.cracks.length
                          ? `авторемонт всего · ${repairable * config.repairCost} зол.`
                          : `авторемонт ${repairable} из ${run.cracks.length} · ${repairable * config.repairCost} зол.`}
                    </button>
                    {autoArmed && (
                      <button
                        className="link-button"
                        onClick={() => setAutoArmed(false)}
                      >
                        отмена
                      </button>
                    )}
                  </>
                )}
                {!run.station && (
                  <span className="note">
                    ремонт — на станции снабжения{' '}
                    {stationIn === 1 ? 'через 1 бой' : `через ${stationIn} боя`}
                    . Пока можно переставить модули в обход трещин.
                  </span>
                )}
                {run.station && repairable < run.cracks.length && (
                  <span className="note">
                    на весь ремонт нужно {run.cracks.length * config.repairCost}{' '}
                    зол.
                  </span>
                )}
                {autoArmed && (
                  <span className="note">
                    подсвечены клетки, которые будут отремонтированы
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </Sheet>

      <div className={`shipyard__side ${run.station ? '' : 'is-off-station'}`}>
        {run.station ? (
          <Sheet
            num="02"
            title={
              isStationRound(runContext, run.round)
                ? 'Станция снабжения'
                : 'Аварийная стоянка'
            }
            aside={
              <span className="shop-aside">
                <span className="gold">{run.gold} зол.</span>
                <button
                  className="shop__reroll-mini"
                  disabled={!freeReroll && run.gold < config.rerollCost}
                  onClick={() => dispatch({ type: 'reroll' })}
                  title={`обновить · ${config.rerollCost} зол.`}
                >
                  ⟳ {freeReroll ? 'бесплатно' : config.rerollCost}
                </button>
              </span>
            }
            className={`shop-sheet ${dragging?.over?.type === 'sell' ? 'is-over' : ''}`}
          >
            <div data-drop="sell">
              <div className="shop">
                {run.shop.map((defId, slot) => {
                  const tier = run.shopTiers[slot] ?? 1
                  const price = defId ? offerPrice(runContext, defId, tier) : 0
                  return defId ? (
                    <div
                      key={slot}
                      className={[
                        'offer',
                        `offer--${def(defId).stats.kind}`,
                        price > run.gold && 'is-disabled',
                        tier > 1 && `offer--t${tier}`,
                        dragging &&
                          drag?.source.kind === 'shop' &&
                          drag.source.slot === slot &&
                          'is-ghosted',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onPointerDown={(e) =>
                        price <= run.gold &&
                        startDrag(e, { kind: 'shop', slot }, defId, 0)
                      }
                    >
                      <span className="offer__art">
                        <ModuleArt defId={defId} cell="18px" grid />
                      </span>
                      <span className="offer__name">
                        {def(defId).name}
                        {tier > 1 && (
                          <span className={`stars stars--${tier}`}>
                            {' '}
                            {'★'.repeat(tier)}
                          </span>
                        )}
                      </span>
                      <span className="offer__stats">
                        {describeStats(itemStats(runContext, { defId, tier }))}
                      </span>
                      <span className="offer__price">{price} зол.</span>
                    </div>
                  ) : (
                    <div key={slot} className="offer offer--sold">
                      продано
                    </div>
                  )
                })}
              </div>
              <div className="add-row shop__actions">
                <button
                  disabled={!freeReroll && run.gold < config.rerollCost}
                  onClick={() => dispatch({ type: 'reroll' })}
                >
                  обновить ·{' '}
                  {freeReroll ? 'бесплатно' : `${config.rerollCost} зол.`}
                </button>
              </div>
              {ownedUid && dragging && (
                <div className="sell-overlay">
                  отпусти — продать за {sellValue} зол.
                </div>
              )}
            </div>
          </Sheet>
        ) : (
          <Sheet
            num="02"
            title="Станция снабжения"
            aside={<span className="gold">{run.gold} зол.</span>}
            className="station-off"
          >
            <p className="station-off__when">
              {stationIn === 1 ? 'через 1 бой' : `через ${stationIn} боя`}
            </p>
            <p className="note">
              там магазин, ремонт корпуса и продажа модулей. Золото копится.
            </p>
          </Sheet>
        )}
      </div>

      {dragging && dragging.over?.type !== 'cell' && (
        <div
          className="drag-ghost"
          style={{
            left: dragging.pos.x - (dragging.grab.x + 0.5) * dragging.cellPx,
            top: dragging.pos.y - (dragging.grab.y + 0.5) * dragging.cellPx,
          }}
        >
          <ModuleArt
            defId={dragging.defId}
            rotation={dragging.rotation}
            cell={`${dragging.cellPx}px`}
            grid
          />
        </div>
      )}
    </div>
  )
}
