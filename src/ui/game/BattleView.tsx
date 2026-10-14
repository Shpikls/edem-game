import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { runContext } from '../../content/run.ts'
import type {
  Battle,
  BattleEvent,
  RunState,
  Ship,
  Side,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { formatEvent } from '../sandbox/formatEvent.ts'
import { def, engineLabel, shieldMax } from './describe.ts'
import { HullGrid, type GridModule } from './HullGrid.tsx'

interface Props {
  run: RunState
  battle: Battle
  onNext: () => void
}

const FLASH_MS = 250
const FLOAT_MS = 900

interface SideView {
  hull: number
  shield: number
}

/** Ship state at time t, read off the latest events. */
function stateAt(battle: Battle, t: number): Record<Side, SideView> {
  const view: Record<Side, SideView> = {
    player: { hull: battle.player.hullHp, shield: shieldMax(battle.player) },
    enemy: { hull: battle.enemy.hullHp, shield: shieldMax(battle.enemy) },
  }
  for (const e of battle.result.events) {
    if (e.t > t) break
    if (e.type === 'hit') {
      view[e.target] = { hull: e.hullHp, shield: e.shieldHp }
    } else if (e.type === 'shieldRegen') {
      view[e.side].shield = e.shieldHp
    } else if (e.type === 'overheat') {
      view[e.target].hull = e.hullHp
    }
  }
  return view
}

export function BattleView({ run, battle, onNext }: Props) {
  const { result } = battle
  const [speed, setSpeed] = useState(1)
  const [t, setT] = useState(0)
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) * speedRef.current
      last = now
      setT((prev) => Math.min(result.durationMs + FLOAT_MS, prev + dt))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [result])

  const done = t >= result.durationMs
  const view = stateAt(battle, t)
  const recent = result.events.filter((e) => e.t <= t && t - e.t < FLOAT_MS)
  const firing = new Set(
    recent
      .filter((e) => e.type === 'hit' && t - e.t < FLASH_MS)
      .map((e) => (e.type === 'hit' ? `${e.side}:${e.source}` : '')),
  )

  // Map engine ids (defId#n in placed order) back to placed items for the grid.
  const playerGrid: GridModule[] = useMemo(() => {
    const counts = new Map<string, number>()
    return run.placed.map((p) => {
      const n = (counts.get(p.defId) ?? 0) + 1
      counts.set(p.defId, n)
      return {
        ...p,
        uid: `${p.defId}#${n}`,
        label: `${def(p.defId).code}-${n}`,
      }
    })
  }, [run.placed])
  const activePlayer = new Set(
    [...firing].filter((f) => f.startsWith('player:')).map((f) => f.slice(7)),
  )

  const log = result.events
    .filter((e) => e.t <= t && e.type !== 'shieldRegen')
    .slice(-5)
    .reverse()

  return (
    <div className="battle">
      <div className="battle__ships">
        <ShipPanel
          num="01"
          title="Игрок"
          side="player"
          ship={battle.player}
          view={view.player}
          floats={recent}
          t={t}
          destroyed={
            done && result.winner !== 'player' && view.player.hull <= 0
          }
        >
          {playerGrid.length > 0 && (
            <HullGrid
              hull={runContext.hull}
              items={playerGrid}
              active={activePlayer}
              compact
            />
          )}
        </ShipPanel>
        <ShipPanel
          num="02"
          title={`Враг · раунд ${run.round}`}
          side="enemy"
          ship={battle.enemy}
          view={view.enemy}
          floats={recent}
          t={t}
          destroyed={done && view.enemy.hull <= 0}
        >
          <ul className="enemy-modules">
            {battle.enemy.modules.map((m) => (
              <li
                key={m.id}
                className={firing.has(`enemy:${m.id}`) ? 'is-firing' : ''}
              >
                <span className="part__code">{engineLabel(m.id)}</span>
              </li>
            ))}
          </ul>
        </ShipPanel>
      </div>

      <Sheet
        num="03"
        title={`Бой · ${(Math.min(t, result.durationMs) / 1000).toFixed(1)} с`}
        aside={
          done ? (
            <span className={`verdict verdict--${result.winner}`}>
              {result.winner === 'player'
                ? `победа +${runContext.config.winBonus} зол.`
                : result.winner === 'enemy'
                  ? 'поражение −1 жизнь'
                  : 'ничья'}
            </span>
          ) : undefined
        }
      >
        <ol className="log log--live">
          {log.map((e, i) => (
            <li
              key={`${e.t}-${i}`}
              className={`log__row log__row--${e.type} ${sideClass(e)}`}
            >
              <span className="log__time">{(e.t / 1000).toFixed(1)}</span>
              <span>{formatEvent(e, engineLabel)}</span>
            </li>
          ))}
        </ol>
        <div className="controls__row battle__controls">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              className={speed === s ? 'is-active' : ''}
              onClick={() => setSpeed(s)}
            >
              x{s}
            </button>
          ))}
          {!done && (
            <button onClick={() => setT(result.durationMs)}>пропустить</button>
          )}
          {done && (
            <button className="stamp" onClick={onNext}>
              {run.lives <= 0 || run.round >= runContext.config.rounds
                ? 'Итоги'
                : 'Дальше'}
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function sideClass(e: BattleEvent): string {
  return `side--${e.type === 'overheat' ? e.target : e.side}`
}

function ShipPanel({
  num,
  title,
  side,
  ship,
  view,
  floats,
  t,
  destroyed,
  children,
}: {
  num: string
  title: string
  side: Side
  ship: Ship
  view: SideView
  floats: BattleEvent[]
  t: number
  destroyed: boolean
  children: ReactNode
}) {
  const maxShield = shieldMax(ship)
  const mine = floats.filter(
    (e): e is Extract<BattleEvent, { type: 'hit' | 'overheat' }> =>
      (e.type === 'hit' || e.type === 'overheat') && e.target === side,
  )
  const hitNow = mine.some((e) => t - e.t < FLASH_MS)
  return (
    <Sheet
      num={num}
      title={title}
      className={`ship-panel side--${side} ${hitNow ? 'is-hit' : ''} ${destroyed ? 'is-destroyed' : ''}`}
    >
      <Bar label="корпус" value={view.hull} max={ship.hullHp} kind="hull" />
      {maxShield > 0 && (
        <Bar label="щит" value={view.shield} max={maxShield} kind="shield" />
      )}
      <div className="ship-panel__body">
        {children}
        <div className="floats">
          {mine.map((e, i) => (
            <span
              key={`${e.t}-${i}`}
              className={`float float--${e.type === 'hit' && e.hullDamage === 0 ? 'shield' : e.type}`}
              style={{
                ['--age' as string]: (t - e.t) / FLOAT_MS,
                left: `${20 + ((i * 37) % 60)}%`,
              }}
            >
              −{e.amount}
            </span>
          ))}
        </div>
        {destroyed && <div className="wreck-stamp">уничтожен</div>}
      </div>
    </Sheet>
  )
}

function Bar({
  label,
  value,
  max,
  kind,
}: {
  label: string
  value: number
  max: number
  kind: 'hull' | 'shield'
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`bar bar--${kind}`}>
      <span className="bar__label">{label}</span>
      <span className="bar__track">
        <span className="bar__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="bar__value">
        {value}/{max}
      </span>
    </div>
  )
}
