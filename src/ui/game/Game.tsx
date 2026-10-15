import { useState } from 'react'
import { runContext } from '../../content/run.ts'
import {
  createRun,
  reduceRun,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { RunOver, RUN_STARTED_KEY } from './RunOver.tsx'
import { Settings } from './Settings.tsx'
import { actionSounds } from './actionSounds.ts'
import { track } from '../analytics.ts'
import { sfx } from '../sound.ts'
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
  try {
    localStorage.setItem(RUN_STARTED_KEY, String(Date.now()))
  } catch {
    /* no run timer */
  }
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
  const [settings, setSettings] = useState(false)
  const hasSave =
    run.phase !== 'over' &&
    (run.round > 1 || run.placed.length > 0 || run.bench.length > 0)
  // Keeps the crate screen up through the reveal after the last crate is opened.
  const [cratePending, setCratePending] = useState(false)
  // Side effects live next to the reducer call so it runs once per action
  // (StrictMode's dev double call is absorbed by sfx throttling).
  const dispatch = (action: RunAction) =>
    setRun((s) => {
      const next = reduceRun(runContext, s, action)
      for (const name of actionSounds(s, next, action)) sfx(name)
      if (next !== s) report(s, next, action)
      return next
    })
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
            className="link-button hud__settings"
            title="настройки"
            aria-label="настройки"
            onClick={() => setSettings(true)}
          >
            <svg viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 1.8v2.6M10 15.6v2.6M1.8 10h2.6M15.6 10h2.6M4.2 4.2l1.9 1.9M13.9 13.9l1.9 1.9M4.2 15.8l1.9-1.9M13.9 6.1l1.9-1.9" />
              <circle cx="10" cy="10" r="5.6" />
            </svg>
          </button>
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
        <RunOver run={run} onNewRun={() => setRun(newRun())} />
      )}

      {settings && (
        <Settings
          onClose={() => setSettings(false)}
          onResetTutorial={() => {
            track('tutorial_reset')
            setTut(() => ({ on: true, done: [] }))
          }}
          onNewRun={() => setRun(newRun())}
        />
      )}
    </div>
  )
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
