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
import { CrateOpening } from './CrateOpening.tsx'
import { Shipyard } from './Shipyard.tsx'

const newRun = () => createRun(runContext, Math.floor(Math.random() * 2 ** 31))

export function Game() {
  const [run, setRun] = usePersistentState<RunState>('game.run.v4', newRun())
  // Keeps the crate screen up through the reveal after the last crate is opened.
  const [cratePending, setCratePending] = useState(false)
  const dispatch = (action: RunAction) =>
    setRun((s) => reduceRun(runContext, s, action))
  const { config } = runContext

  return (
    <div className="game">
      <div className="status">
        <span>
          раунд <b>{run.round}</b>/{config.rounds}
        </span>
        <span className="lives">
          жизни
          {Array.from({ length: config.lives }, (_, i) => (
            <i key={i} className={i < run.lives ? 'on' : ''} />
          ))}
        </span>
        <span>
          золото <b>{run.gold}</b>
        </span>
        <span>
          побед <b>{run.wins}</b>
        </span>
        <button
          className="link-button"
          onClick={() => {
            if (confirm('Начать новый забег? Текущий пропадёт.'))
              setRun(newRun())
          }}
        >
          новый забег
        </button>
      </div>

      {run.phase === 'shop' && <Shipyard run={run} dispatch={dispatch} />}
      {run.phase === 'shop' && (run.crates.length > 0 || cratePending) && (
        <CrateOpening
          run={run}
          dispatch={dispatch}
          onOpen={() => setCratePending(true)}
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
            {run.lives > 0 ? 'Флот выстоял' : 'Флот потерян'} · побед {run.wins}{' '}
            из {run.round}
          </p>
          <button className="stamp" onClick={() => setRun(newRun())}>
            Новый забег
          </button>
        </Sheet>
      )}
    </div>
  )
}
