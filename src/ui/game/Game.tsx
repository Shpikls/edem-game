import { useState, useSyncExternalStore } from 'react'
import { runContext } from '../../content/run.ts'
import {
  createRun,
  reduceRun,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from './Sheet.tsx'
import { track } from '../analytics.ts'
import { isMuted, onMuteChange, setMuted, sfx } from '../sound.ts'
import { usePersistentState } from '../usePersistentState.ts'
import { BattleView } from './BattleView.tsx'
import { SalvageScreen } from './SalvageScreen.tsx'
import { Shipyard } from './Shipyard.tsx'
import { Splash } from './Splash.tsx'
import { Tutorial, type TutorialState } from './Tutorial.tsx'

const freshRun = (): RunState =>
  createRun(runContext, Math.floor(Math.random() * 2 ** 31))

/** A run the player actually starts (counted in analytics). */
const newRun = (): RunState => {
  track('run_start')
  return freshRun()
}

export function Game() {
  const [run, setRun] = usePersistentState<RunState>('game.run.v14', freshRun)
  const [tut, setTut] = usePersistentState<TutorialState>('tutorial.v1', {
    on: true,
    done: [],
  })
  // The title screen shows on every launch (session only).
  const [splash, setSplash] = useState(true)
  const hasSave =
    run.phase !== 'over' &&
    (run.round > 1 || run.placed.length > 0 || run.bench.length > 0)
  // Keeps the crate screen up through the reveal after the last crate is opened.
  const [cratePending, setCratePending] = useState(false)
  const dispatch = (action: RunAction) => {
    actionSound(run, reduceRun(runContext, run, action), action)
    setRun((s) => {
      const next = reduceRun(runContext, s, action)
      if (next !== s) report(s, next, action)
      return next
    })
  }
  const { config } = runContext
  // During a battle the outcome isn't final yet (the player may still jump out):
  // show the values from before the fight until "Next".
  const shown =
    run.phase === 'battle' && run.lastBattle ? run.lastBattle.before : run

  if (splash)
    return (
      <Splash
        hasSave={hasSave}
        tutorialDefault={tut.on && tut.done.length === 0}
        onContinue={() => {
          track('continue', { round: run.round })
          setSplash(false)
        }}
        onStart={(withTutorial) => {
          track('tutorial_choice', { on: withTutorial })
          setTut(() => ({ on: withTutorial, done: [] }))
          setRun(newRun())
          setSplash(false)
        }}
      />
    )

  return (
    <div className="game">
      <Tutorial
        run={run}
        inBattle={run.phase === 'battle'}
        salvage={
          run.phase === 'shop' && (run.salvage.length > 0 || cratePending)
        }
        tut={tut}
        setTut={setTut}
      />
      <div className="hud">
        <div className="hud__stats">
          <span>
            раунд <b>{run.round}</b>/{config.rounds}
          </span>
          <span>
            <b>{shown.gold}</b> зол.
          </span>
          <span>
            побед <b>{shown.wins}</b>
          </span>
          <span
            className="lives"
            title="аварийные прыжки — жизни корабля: поражение не уничтожает корабль, а уводит его в прыжок"
          >
            {Array.from({ length: config.jumpCharges }, (_, i) => (
              <i key={i} className={i < shown.jumps ? 'on' : ''} />
            ))}
          </span>
          <button
            className="link-button hud__restart"
            title="новый забег"
            onClick={() => {
              if (confirm('Начать новый забег? Текущий пропадёт.'))
                setRun(newRun())
            }}
          >
            ⟲
          </button>
          <SoundToggle />
        </div>
        {run.phase === 'shop' && (
          <button
            className="stamp hud__fight"
            onClick={() => dispatch({ type: 'fight' })}
          >
            В бой
          </button>
        )}
      </div>

      {run.phase === 'shop' && <Shipyard run={run} dispatch={dispatch} />}
      {run.phase === 'shop' && (run.salvage.length > 0 || cratePending) && (
        <SalvageScreen
          run={run}
          dispatch={dispatch}
          onSearch={() => setCratePending(true)}
          onDone={() => setCratePending(false)}
        />
      )}

      {run.phase === 'battle' && run.lastBattle && (
        <BattleView
          key={`${run.round}`}
          run={run}
          battle={run.lastBattle}
          onNext={() => dispatch({ type: 'next' })}
        />
      )}

      {run.phase === 'over' && (
        <Sheet num="—" title="Забег окончен">
          <p className="verdict-big">
            {run.lives > 0 ? 'Корабль выстоял' : 'Корабль уничтожен'} · побед{' '}
            {run.wins} из {run.round}
          </p>
          <button className="stamp" onClick={() => setRun(newRun())}>
            Новый забег
          </button>
        </Sheet>
      )}
    </div>
  )
}

function SoundToggle() {
  const muted = useSyncExternalStore(onMuteChange, isMuted)
  return (
    <button
      className="link-button sound-toggle"
      title={muted ? 'включить звук' : 'выключить звук'}
      aria-pressed={!muted}
      onClick={() => setMuted(!muted)}
    >
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" />
        {muted ? (
          <path d="M13 7.5l5 5M18 7.5l-5 5" />
        ) : (
          <path d="M13 7a4 4 0 0 1 0 6M15.5 4.5a7.5 7.5 0 0 1 0 11" />
        )}
      </svg>
    </button>
  )
}

function actionSound(prev: RunState, next: RunState, action: RunAction) {
  if (next === prev) {
    if (action.type !== 'next' && action.type !== 'searchWreck') sfx('error')
    return
  }
  switch (action.type) {
    case 'buy':
      sfx('buy')
      if (action.place) sfx('drop')
      break
    case 'place':
    case 'unplace':
      sfx('drop')
      break
    case 'sell':
      sfx('sell')
      break
    case 'reroll':
      sfx('reroll')
      break
    case 'repair':
    case 'repairAll':
      sfx('repair')
      break
    case 'fight':
      sfx('launch')
      break
  }
}

/** Sends every meaningful player action to analytics (one event per action). */
function report(prev: RunState, next: RunState, action: RunAction) {
  const base = { round: prev.round, gold: prev.gold }
  const name = (uid: string) =>
    [...prev.bench, ...prev.placed, ...next.bench, ...next.placed].find(
      (i) => i.uid === uid,
    )?.defId
  switch (action.type) {
    case 'fight': {
      const b = next.lastBattle
      if (!b) break
      track(
        b.result.winner === 'player'
          ? 'battle_win'
          : b.autoJump
            ? 'battle_jump'
            : 'battle_lost',
        {
          ...base,
          seconds: Math.round(b.result.durationMs / 1000),
          modules: b.fielded.length,
          cracks: prev.cracks.length,
          jumpsLeft: next.jumps,
        },
      )
      break
    }
    case 'buy':
      track('buy', {
        ...base,
        module: prev.shop[action.slot],
        tier: prev.shopTiers[action.slot] ?? 1,
        toHull: Boolean(action.place),
      })
      break
    case 'reroll':
      track('reroll', { ...base, free: prev.freeRerolls > 0 })
      break
    case 'place': {
      const fromBench = prev.bench.some((b) => b.uid === action.uid)
      track(fromBench ? 'place' : 'move', {
        ...base,
        module: name(action.uid),
        x: action.x,
        y: action.y,
        rotation: action.rotation,
      })
      break
    }
    case 'unplace':
      track('to_bench', { ...base, module: name(action.uid) })
      break
    case 'sell':
      track('sell', {
        ...base,
        module: name(action.uid),
        got: next.gold - prev.gold,
      })
      break
    case 'repair':
    case 'repairAll':
      track('repair', {
        ...base,
        mode: action.type === 'repair' ? 'cell' : 'auto',
        cells: prev.cracks.length - next.cracks.length,
        spent: prev.gold - next.gold,
      })
      break
    case 'searchWreck': {
      const found = next.bench.at(-1)
      track('salvage', {
        ...base,
        module: found?.defId,
        tier: found?.tier ?? 1,
      })
      break
    }
    case 'next':
      track('next', { ...base, station: next.station, jumped: next.jumped })
      break
  }
  if (next.phase === 'over' && prev.phase !== 'over')
    track(next.lives > 0 ? 'run_won' : 'run_lost', {
      round: next.round,
      wins: next.wins,
      jumpsLeft: next.jumps,
      modules: next.placed.length,
    })
}
