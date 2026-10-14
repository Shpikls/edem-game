import { useState } from 'react'
import { runContext } from '../../content/run.ts'
import {
  createRun,
  reduceRun,
  type RunAction,
  type RunState,
} from '../../engine/index.ts'
import { Sheet } from '../sandbox/Sheet.tsx'
import { usePersistentState } from '../usePersistentState.ts'
import { BattleView } from './BattleView.tsx'
import { SalvageScreen } from './SalvageScreen.tsx'
import { Shipyard } from './Shipyard.tsx'

const newRun = () => createRun(runContext, Math.floor(Math.random() * 2 ** 31))

export function Game() {
  const [run, setRun] = usePersistentState<RunState>('game.run.v10', newRun())
  // Keeps the crate screen up through the reveal after the last crate is opened.
  const [cratePending, setCratePending] = useState(false)
  const dispatch = (action: RunAction) =>
    setRun((s) => reduceRun(runContext, s, action))
  const { config } = runContext
  // During a battle the outcome isn't final yet (the player may still jump out):
  // show the values from before the fight until "Next".
  const shown =
    run.phase === 'battle' && run.lastBattle ? run.lastBattle.before : run

  return (
    <div className="game">
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
