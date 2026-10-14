import { useEffect, useMemo, useRef, useState } from 'react'
import type { BattleScene, SceneShip } from '../../battle/BattleScene.ts'
import { runContext } from '../../content/run.ts'
import {
  autoPlace,
  type Battle,
  type BattleEvent,
  type RunState,
  type Side,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { formatEvent } from '../sandbox/formatEvent.ts'
import { def, engineLabel, shieldMax } from './describe.ts'

interface Props {
  run: RunState
  battle: Battle
  onNext: () => void
}

const TAIL_MS = 1_600

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
    if (e.type === 'hit')
      view[e.target] = { hull: e.hullHp, shield: e.shieldHp }
    else if (e.type === 'shieldRegen') view[e.side].shield = e.shieldHp
    else if (e.type === 'overheat') view[e.target].hull = e.hullHp
  }
  return view
}

function sceneShips(run: RunState, battle: Battle): Record<Side, SceneShip> {
  // Player engine ids are defId#n in placed order (see buildShip).
  const counts = new Map<string, number>()
  const player = run.placed.map((p) => {
    const n = (counts.get(p.defId) ?? 0) + 1
    counts.set(p.defId, n)
    return {
      id: `${p.defId}#${n}`,
      shape: def(p.defId).shape,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      kind: def(p.defId).stats.kind,
      defId: p.defId,
    }
  })
  const enemyItems = battle.enemy.modules.map((m) => ({
    id: m.id,
    shape: def(m.id.split('#')[0]!).shape,
    kind: m.stats.kind,
    defId: m.id.split('#')[0]!,
  }))
  const enemy = autoPlace(runContext.hull, enemyItems).flatMap((p, i) =>
    p ? [{ ...p, kind: enemyItems[i]!.kind, defId: enemyItems[i]!.defId }] : [],
  )
  return {
    player: { hull: runContext.hull, modules: player },
    enemy: { hull: runContext.hull, modules: enemy },
  }
}

export function BattleView({ run, battle, onNext }: Props) {
  const { result } = battle
  const [speed, setSpeed] = useState(1)
  const [t, setT] = useState(0)
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const stageRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BattleScene | null>(null)
  const ships = useMemo(() => sceneShips(run, battle), [run, battle])

  useEffect(() => {
    let scene: BattleScene | null = null
    let cancelled = false
    // Pixi is loaded lazily so the shipyard opens without it.
    void import('../../battle/BattleScene.ts').then(({ BattleScene }) => {
      if (cancelled || !stageRef.current) return
      scene = new BattleScene(battle, ships)
      sceneRef.current = scene
      void scene.mount(stageRef.current)
    })
    return () => {
      cancelled = true
      scene?.destroy()
      sceneRef.current = null
    }
  }, [battle, ships])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) * speedRef.current
      last = now
      setT((prev) => Math.min(result.durationMs + TAIL_MS, prev + dt))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [result])

  useEffect(() => {
    sceneRef.current?.render(t)
  }, [t])

  const done = t >= result.durationMs
  const view = stateAt(battle, t)
  const log = result.events
    .filter((e) => e.t <= t && e.type !== 'shieldRegen')
    .slice(-4)
    .reverse()

  return (
    <div className="battle">
      <Sheet
        num="01"
        title={`Бой · раунд ${run.round} · ${(Math.min(t, result.durationMs) / 1000).toFixed(1)} с`}
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
        <div className="battle__bars">
          <ShipBars
            side="player"
            title="Игрок"
            view={view.player}
            battle={battle}
          />
          <ShipBars
            side="enemy"
            title="Враг"
            view={view.enemy}
            battle={battle}
          />
        </div>
        <div className="battle__stage" ref={stageRef} />
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

      <Sheet num="02" title="Журнал">
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
      </Sheet>
    </div>
  )
}

function sideClass(e: BattleEvent): string {
  return `side--${e.type === 'overheat' ? e.target : e.side}`
}

function ShipBars({
  side,
  title,
  view,
  battle,
}: {
  side: Side
  title: string
  view: SideView
  battle: Battle
}) {
  const ship = battle[side]
  const maxShield = shieldMax(ship)
  return (
    <div className={`ship-bars side--${side}`}>
      <div className="ship-bars__title">{title}</div>
      <Bar label="корпус" value={view.hull} max={ship.hullHp} kind="hull" />
      {maxShield > 0 && (
        <Bar label="щит" value={view.shield} max={maxShield} kind="shield" />
      )}
    </div>
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
