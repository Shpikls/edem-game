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
  onJump: () => void
}

/** Same as BattleScene.JUMP_MS; kept here so Pixi stays lazy-loaded. */
const JUMP_MS = 1_400
/** Ships drop out of a jump before the fight starts. */
const INTRO_MS = 900

/** Time after the last hit for the destruction animation. */
const TAIL_MS = 1_900

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
  // Only modules that actually fought, with the engine ids the log uses.
  const player = battle.fielded.flatMap(({ uid, id }) => {
    const p = run.placed.find((x) => x.uid === uid)
    if (!p) return []
    return [
      {
        id,
        shape: def(p.defId).shape,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        kind: def(p.defId).stats.kind,
        defId: p.defId,
      },
    ]
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
    player: {
      hull: runContext.hull,
      modules: player,
      cracks: run.cracks.filter((k) => !battle.newCracks.includes(k)),
      newCracks: battle.newCracks,
    },
    enemy: { hull: runContext.hull, modules: enemy },
  }
}

export function BattleView({ run, battle, onNext, onJump }: Props) {
  const { result } = battle
  const [speed, setSpeed] = useState(1)
  const [t, setT] = useState(0)
  // Emergency jump: combat time freezes at `at`, the jump animation runs for JUMP_MS.
  const [jump, setJump] = useState<{ at: number; start: number } | null>(null)
  // The killing blow on the player: playback pauses just before it to offer a jump.
  const lethalAt = useMemo(() => {
    if (run.jumps <= 0) return null
    const e = result.events.find(
      (e) =>
        (e.type === 'hit' || e.type === 'overheat') &&
        e.target === 'player' &&
        e.hullHp <= 0,
    )
    return e ? Math.max(0, e.t - 1) : null
  }, [result, run.jumps])
  const [declined, setDeclined] = useState(false)
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const stageRef = useRef<HTMLDivElement>(null)
  const jumpRef = useRef(jump)
  const jumpDone = useRef(false)
  const onJumpRef = useRef(onJump)
  const holdRef = useRef<number | null>(null)
  const hold = lethalAt !== null && !declined ? lethalAt : null
  useEffect(() => {
    jumpRef.current = jump
    onJumpRef.current = onJump
    holdRef.current = hold
  })
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
    const start = performance.now()
    let last = start
    let introDone = false
    const tick = (now: number) => {
      const dt = (now - last) * speedRef.current
      last = now
      const intro = now - start
      if (intro < INTRO_MS) {
        sceneRef.current?.setIntro(intro / INTRO_MS)
        frame = requestAnimationFrame(tick)
        return
      }
      if (!introDone) {
        introDone = true
        sceneRef.current?.setIntro(null)
      }
      setT((prev) => {
        if (jumpRef.current) return jumpRef.current.at
        const limit = holdRef.current ?? result.durationMs + TAIL_MS
        return Math.min(limit, prev + dt)
      })
      if (jumpRef.current) {
        const age = now - jumpRef.current.start
        sceneRef.current?.setJump(age)
        if (age >= JUMP_MS && !jumpDone.current) {
          jumpDone.current = true
          onJumpRef.current()
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [result])

  useEffect(() => {
    sceneRef.current?.render(t)
  }, [t])

  const done = t >= result.durationMs
  const critical = hold !== null && t >= hold && !jump
  // "Next" waits for the wreck animation to play out.
  const finished = t >= result.durationMs + TAIL_MS - 100
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
                  ? `поражение −1 жизнь · +${runContext.config.lossBonus} зол.`
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
        <div className="battle__stage" ref={stageRef}>
          {jump && <div className="jump-overlay">аварийный прыжок</div>}
          {critical && (
            <div className="critical">
              <div className="critical__title">корпус критичен</div>
              <p className="note">
                следующее попадание уничтожит корабль. Аварийный прыжок вернёт
                на верфь к этой же миссии и восстановит корабль.
              </p>
              <div className="critical__actions">
                <button
                  className="jump-button"
                  onClick={() =>
                    setJump({ at: hold, start: performance.now() })
                  }
                >
                  ⚡ прыжок · осталось {run.jumps}
                </button>
                <button onClick={() => setDeclined(true)}>принять бой</button>
              </div>
            </div>
          )}
        </div>
        {done && (
          <p className="battle__summary">
            {battle.newCracks.length > 0
              ? `корпус: +${battle.newCracks.length} ${plural(battle.newCracks.length, 'трещина', 'трещины', 'трещин')} — ремонт на верфи`
              : 'корпус цел'}
            {battle.salvageWon && ' · обломки врага можно обыскать'}
            {result.winner === 'enemy' &&
              runContext.config.stationAfterLoss &&
              ' · дальше аварийная стоянка: ремонт и магазин'}
          </p>
        )}
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
          {!finished && !jump && !critical && (
            <button
              onClick={() =>
                setT(
                  hold !== null
                    ? hold
                    : done
                      ? result.durationMs + TAIL_MS
                      : result.durationMs,
                )
              }
            >
              пропустить
            </button>
          )}
          {finished && (
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

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return one
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few
  return many
}
