import { useEffect, useState } from 'react'
import { runContext } from '../../content/run.ts'
import {
  checkPlacement,
  renderCells,
  sellPrice,
  type Rotation,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { def, describeStats, summarizeShip } from './describe.ts'
import { HullGrid, type GridModule } from './HullGrid.tsx'

interface Props {
  run: RunState
  dispatch: (action: RunAction) => void
}

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

export function Shipyard({ run, dispatch }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [rotation, setRotation] = useState<Rotation>(0)
  const label = labels(run)
  const { config } = runContext

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['r', 'R', 'к', 'К'].includes(e.key))
        setRotation((r) => ((r + 1) % 4) as Rotation)
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedItem =
    run.bench.find((i) => i.uid === selected) ??
    run.placed.find((i) => i.uid === selected) ??
    null
  const selectedPlaced = run.placed.some((p) => p.uid === selected)

  const gridItems: GridModule[] = run.placed.map((p) => ({
    ...p,
    label: label.get(p.uid) ?? '',
  }))

  const place = (x: number, y: number) => {
    if (!selectedItem) return
    const others = run.placed
      .filter((p) => p.uid !== selectedItem.uid)
      .map((p) => ({ ...p, id: p.uid, shape: def(p.defId).shape }))
    const candidate = {
      id: selectedItem.uid,
      shape: def(selectedItem.defId).shape,
      x,
      y,
      rotation,
    }
    // Keep the selection on a bad tap so the player can just tap again.
    if (!checkPlacement(runContext.hull, others, candidate).ok) return
    dispatch({ type: 'place', uid: selectedItem.uid, x, y, rotation })
    setSelected(null)
  }

  const pickModule = (uid: string) => {
    setSelected(uid === selected ? null : uid)
    const placed = run.placed.find((p) => p.uid === uid)
    if (placed) setRotation(placed.rotation)
  }

  const enemy = summarizeShip(run.enemy)

  return (
    <div className="shipyard">
      <Sheet num="01" title="Верфь · план палубы" className="shipyard__hull">
        <div className="hull-wrap">
          <HullGrid
            hull={runContext.hull}
            items={gridItems}
            pending={
              selectedItem
                ? { uid: selectedItem.uid, defId: selectedItem.defId, rotation }
                : null
            }
            selectedUid={selected}
            onCell={place}
            onModule={pickModule}
          />
        </div>

        <div className="selection">
          {selectedItem ? (
            <>
              <div className="selection__info">
                <span className="part__code">
                  {label.get(selectedItem.uid)}
                </span>
                <span className="part__name">
                  {def(selectedItem.defId).name}
                </span>
                <span className="note">
                  {describeStats(def(selectedItem.defId).stats)}
                </span>
              </div>
              <div className="add-row">
                <button
                  onClick={() => setRotation((r) => ((r + 1) % 4) as Rotation)}
                >
                  ↻ {rotation * 90}°
                </button>
                {selectedPlaced && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'unplace', uid: selectedItem.uid })
                      setSelected(null)
                    }}
                  >
                    на склад
                  </button>
                )}
                <button
                  onClick={() => {
                    dispatch({ type: 'sell', uid: selectedItem.uid })
                    setSelected(null)
                  }}
                >
                  продать +{sellPrice(def(selectedItem.defId).price)}
                </button>
                <button onClick={() => setSelected(null)}>отмена</button>
              </div>
              <p className="note">
                {selectedPlaced
                  ? 'тап по пустой клетке — переставить'
                  : 'тап по клетке корпуса — установить (левый верхний угол)'}
              </p>
            </>
          ) : (
            <p className="note">
              выбери модуль на складе или на корпусе. В бою работает только то,
              что стоит на корпусе.
            </p>
          )}
        </div>
      </Sheet>

      <div className="shipyard__side">
        <Sheet
          num="02"
          title="Снабжение"
          aside={<span className="gold">{run.gold} зол.</span>}
        >
          <div className="shop">
            {run.shop.map((defId, slot) =>
              defId ? (
                <button
                  key={slot}
                  className="offer"
                  disabled={def(defId).price > run.gold}
                  onClick={() => dispatch({ type: 'buy', slot })}
                >
                  <MiniShape defId={defId} />
                  <span className="offer__name">{def(defId).name}</span>
                  <span className="offer__stats">
                    {describeStats(def(defId).stats)}
                  </span>
                  <span className="offer__price">{def(defId).price} зол.</span>
                </button>
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
        </Sheet>

        <Sheet num="03" title={`Склад · ${run.bench.length}`}>
          {run.bench.length === 0 ? (
            <p className="note">пусто — купи модуль в снабжении</p>
          ) : (
            <div className="bench">
              {run.bench.map((item) => (
                <button
                  key={item.uid}
                  className={`bench__item ${item.uid === selected ? 'is-active' : ''}`}
                  onClick={() => pickModule(item.uid)}
                >
                  <MiniShape defId={item.defId} />
                  {label.get(item.uid)}
                </button>
              ))}
            </div>
          )}
        </Sheet>

        <Sheet
          num="04"
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
      </div>
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
