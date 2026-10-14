import { useMemo, useState } from 'react'
import { battleRules } from '../../content/battleRules.ts'
import { sandboxPresets } from '../../content/ships.ts'
import {
  simulate,
  type BattleEvent,
  type BattleResult,
  type Side,
} from '../../engine/index.ts'
import { usePersistentState } from '../usePersistentState.ts'
import {
  formatEvent,
  formatTime,
  sideName,
  summarizeBySource,
} from './formatEvent.ts'
import {
  drawingLabel,
  fromPreset,
  toEngineShip,
  type SandboxShip,
} from './sandboxShip.ts'
import { Sheet } from './Sheet.tsx'
import { ShipEditor, Spec } from './ShipEditor.tsx'

type Ships = Record<Side, SandboxShip>

const outcomeText: Record<BattleResult['winner'], string> = {
  player: 'Победил игрок',
  enemy: 'Победил враг',
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
          num="01"
          title="Игрок"
          side="player"
          ship={ships.player}
          onChange={(player) => setShips({ ...ships, player })}
        />
        <ShipEditor
          num="02"
          title="Враг"
          side="enemy"
          ship={ships.enemy}
          onChange={(enemy) => setShips({ ...ships, enemy })}
        />
      </div>

      <Sheet num="03" title="Испытание" className="controls">
        <div className="controls__row">
          <Spec name="seed">
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Math.trunc(Number(e.target.value)) || 0)}
            />
          </Spec>
          <button
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
          >
            случайный
          </button>
          <button
            onClick={() =>
              setShips({ player: ships.enemy, enemy: ships.player })
            }
          >
            поменять местами
          </button>
          <button
            onClick={() => {
              setShips(defaultShips())
              setRun(null)
            }}
          >
            сброс
          </button>
          <button className="stamp" onClick={fight}>
            В бой
          </button>
        </div>
        <p className="note">
          прим.: перегрев с {formatTime(battleRules.overheatStartMs)}; seed пока
          ни на что не влияет
        </p>
      </Sheet>

      {run && 'error' in run && <p className="redline">{run.error}</p>}

      {result && (
        <>
          <Sheet
            num="04"
            title="Итог"
            aside={
              <span className={`verdict verdict--${result.winner}`}>
                {outcomeText[result.winner]} · {formatTime(result.durationMs)}
              </span>
            }
          >
            <table className="spec-table">
              <thead>
                <tr>
                  <th>поз.</th>
                  <th>сторона</th>
                  <th className="num">выстр.</th>
                  <th className="num">урон</th>
                  <th className="num">по корпусу</th>
                  <th className="num">урон/с</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr
                    key={`${s.side}:${s.source}`}
                    className={`side--${s.side}`}
                  >
                    <td className="code">{drawingLabel(s.source)}</td>
                    <td>{sideName[s.side]}</td>
                    <td className="num">{s.shots}</td>
                    <td className="num">{s.damage}</td>
                    <td className="num">{s.hullDamage}</td>
                    <td className="num">
                      {((s.damage / result.durationMs) * 1000).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Sheet>

          <Sheet
            num="05"
            title={`Журнал · ${visibleEvents.length} зап.`}
            aside={
              <label className="check">
                <input
                  type="checkbox"
                  checked={showRegen}
                  onChange={(e) => setShowRegen(e.target.checked)}
                />
                реген щита
              </label>
            }
          >
            <ol className="log">
              {visibleEvents.map((e, i) => (
                <li
                  key={i}
                  className={`log__row log__row--${e.type} ${logSide(e)}`}
                >
                  <span className="log__time">{formatTime(e.t)}</span>
                  <span>{formatEvent(e, drawingLabel)}</span>
                </li>
              ))}
            </ol>
          </Sheet>
        </>
      )}
    </div>
  )
}

function logSide(e: BattleEvent): string {
  if (e.type === 'overheat') return `side--${e.target}`
  return `side--${e.side}`
}
