import { useState } from 'react'
import { runContext } from '../../content/run.ts'
import {
  createRun,
  reduceRun,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from './Sheet.tsx'
import { track } from '../analytics.ts'
import { usePersistentState } from '../usePersistentState.ts'
import { BattleView } from './BattleView.tsx'
import { SalvageScreen } from './SalvageScreen.tsx'
import { Shipyard } from './Shipyard.tsx'
import { Splash } from './Splash.tsx'
import { Tutorial, type TutorialState } from './Tutorial.tsx'

const newRun = (): RunState => {
  track('run_start')
  return createRun(runContext, Math.floor(Math.random() * 2 ** 31))
}

export function Game() {
  const [run, setRun] = usePersistentState<RunState>('game.run.v14', newRun)
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
  const dispatch = (action: RunAction) =>
    setRun((s) => {
      const next = reduceRun(runContext, s, action)
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
        onContinue={() => setSplash(false)}
        onStart={(withTutorial) => {
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

/** Sends the interesting transitions to analytics. */
function report(prev: RunState, next: RunState, action: RunAction) {
  if (action.type === 'fight' && next.lastBattle) {
    const b = next.lastBattle
    track(
      b.result.winner === 'player'
        ? 'battle_win'
        : b.autoJump
          ? 'battle_jump'
          : 'battle_lost',
      {
        round: prev.round,
        seconds: Math.round(b.result.durationMs / 1000),
        modules: prev.placed.length,
      },
    )
  }
  if (action.type === 'buy')
    track('buy', { round: prev.round, module: prev.shop[action.slot] })
  if (action.type === 'repair' || action.type === 'repairAll')
    track('repair', {
      round: prev.round,
      cells: prev.cracks.length - next.cracks.length,
    })
  if (next.phase === 'over' && prev.phase !== 'over')
    track(next.lives > 0 ? 'run_won' : 'run_lost', {
      round: next.round,
      wins: next.wins,
      jumpsLeft: next.jumps,
    })
}
