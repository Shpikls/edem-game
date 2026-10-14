import { useMemo, useState } from 'react'
import { battleRules } from '../../content/battleRules.ts'
import { sandboxPresets } from '../../content/ships.ts'
import { simulate, type BattleResult, type Side } from '../../engine/index.ts'
import { usePersistentState } from '../usePersistentState.ts'
import {
  formatEvent,
  formatTime,
  sideName,
  summarizeBySource,
} from './formatEvent.ts'
import { fromPreset, toEngineShip, type SandboxShip } from './sandboxShip.ts'
import { ShipEditor } from './ShipEditor.tsx'

type Ships = Record<Side, SandboxShip>

const outcomeText: Record<BattleResult['winner'], string> = {
  player: 'Победил игрок',
  enemy: 'Победил враг',
  draw: 'Ничья',
}

const defaultShips = (): Ships => ({
  player: fromPreset(sandboxPresets.player),
  enemy: fromPreset(sandboxPresets.enemy),
})

export function BattleSandbox() {
  const [ships, setShips] = usePersistentState<Ships>(
    'sandbox.ships.v1',
    defaultShips(),
  )
  const [seed, setSeed] = usePersistentState('sandbox.seed.v1', 1)
  const [showRegen, setShowRegen] = useState(false)
  const [run, setRun] = useState<
    { result: BattleResult } | { error: string } | null
  >(null)

  const fight = () => {
    try {
      setRun({
        result: simulate(
          toEngineShip(ships.player),
          toEngineShip(ships.enemy),
          seed,
          battleRules,
        ),
      })
    } catch (e) {
      setRun({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  const result = run && 'result' in run ? run.result : null
  const summary = useMemo(
    () => (result ? summarizeBySource(result.events) : []),
    [result],
  )
  const visibleEvents = result
    ? result.events.filter((e) => showRegen || e.type !== 'shieldRegen')
    : []

  return (
    <div className="sandbox">
      <div className="ships">
        <ShipEditor
          title="Игрок"
          ship={ships.player}
          onChange={(player) => setShips({ ...ships, player })}
        />
        <ShipEditor
          title="Враг"
          ship={ships.enemy}
          onChange={(enemy) => setShips({ ...ships, enemy })}
        />
      </div>

      <section className="panel controls">
        <label className="field">
          <span>Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Math.trunc(Number(e.target.value)) || 0)}
          />
        </label>
        <button onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>
          🎲
        </button>
        <button className="primary" onClick={fight}>
          Бой
        </button>
        <button
          onClick={() => setShips({ player: ships.enemy, enemy: ships.player })}
        >
          Поменять местами
        </button>
        <button
          onClick={() => {
            setShips(defaultShips())
            setRun(null)
          }}
        >
          Сброс
        </button>
        <span className="hint">
          Перегрев с {formatTime(battleRules.overheatStartMs)}; seed пока ни на
          что не влияет
        </span>
      </section>

      {run && 'error' in run && (
        <section className="panel error">{run.error}</section>
      )}

      {result && (
        <>
          <section className="panel result">
            <h2>
              {outcomeText[result.winner]} за {formatTime(result.durationMs)}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Сторона</th>
                  <th>Модуль</th>
                  <th>Выстрелов</th>
                  <th>Урон</th>
                  <th>По корпусу</th>
                  <th>Урон/с</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr
                    key={`${s.side}:${s.source}`}
                    className={`side--${s.side}`}
                  >
                    <td>{sideName[s.side]}</td>
                    <td>
                      <code>{s.source}</code>
                    </td>
                    <td>{s.shots}</td>
                    <td>{s.damage}</td>
                    <td>{s.hullDamage}</td>
                    <td>
                      {((s.damage / result.durationMs) * 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="log-head">
              <h2>Лог ({visibleEvents.length})</h2>
              <label>
                <input
                  type="checkbox"
                  checked={showRegen}
                  onChange={(e) => setShowRegen(e.target.checked)}
                />{' '}
                показывать реген щита
              </label>
            </div>
            <ol className="log">
              {visibleEvents.map((e, i) => (
                <li
                  key={i}
                  className={`log__row log__row--${e.type} ${logSide(e)}`}
                >
                  <span className="log__time">{formatTime(e.t)}</span>
                  <span>{formatEvent(e)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function logSide(e: BattleResult['events'][number]): string {
  if (e.type === 'hit' || e.type === 'shieldRegen' || e.type === 'destroyed') {
    return `side--${e.side}`
  }
  return ''
}
