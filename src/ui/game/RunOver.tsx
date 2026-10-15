import { useEffect, useState } from 'react'
import { runContext } from '../../content/run.ts'
import type { RunState } from '../../engine/index.ts'
import { sfx } from '../sound.ts'
import { HullGrid } from './HullGrid.tsx'

const RECORD_KEY = 'record.v1'

function readRecord(): number {
  try {
    return Number(localStorage.getItem(RECORD_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

/** End of a run: a debrief sheet with the final build, stats and record. */
export function RunOver({
  run,
  onNewRun,
}: {
  run: RunState
  onNewRun: () => void
}) {
  const { config, hull } = runContext
  const won = run.lives > 0
  // Read once, before this run is written in: decides "new record".
  const [prevRecord] = useState(readRecord)
  const newRecord = run.wins > prevRecord
  const record = Math.max(prevRecord, run.wins)

  useEffect(() => {
    try {
      localStorage.setItem(RECORD_KEY, String(record))
    } catch {
      /* not persisted */
    }
    sfx(won ? 'runWon' : 'runLost')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const jumpsUsed = config.jumpCharges - run.jumps
  const stars = run.placed.filter((p) => (p.tier ?? 1) > 1).length
  const rows: [string, string][] = [
    ['побед', `${run.wins} из ${config.rounds}`],
    [won ? 'миссий пройдено' : 'погиб в миссии', `${run.round}`],
    ['аварийных прыжков', `${jumpsUsed} из ${config.jumpCharges}`],
    ['модулей на борту', `${run.placed.length}${stars ? ` · ★ ${stars}` : ''}`],
    ['трещин в корпусе', `${run.cracks.length}`],
  ]

  return (
    <div className={`runover ${won ? 'runover--won' : 'runover--lost'}`}>
      <div className="runover__grid" />
      <p className="runover__kicker">журнал · забег завершён</p>
      <div className="runover__stamp">
        {won ? 'Сектор пройден' : 'Корабль уничтожен'}
      </div>

      <div className="runover__pips" aria-label={`побед ${run.wins}`}>
        {Array.from({ length: config.rounds }, (_, i) => (
          <i
            key={i}
            className={i < run.wins ? 'is-won' : ''}
            style={{ animationDelay: `${0.6 + i * 0.08}s` }}
          />
        ))}
      </div>

      <div className="runover__ship">
        <HullGrid
          hull={hull}
          items={run.placed.map((p) => ({ ...p, label: '' }))}
          cracks={new Set(run.cracks)}
        />
      </div>

      <dl className="runover__stats">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className="runover__row"
            style={{ animationDelay: `${1.2 + i * 0.12}s` }}
          >
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <p className={`runover__record ${newRecord ? 'is-new' : ''}`}>
        {newRecord
          ? `новый рекорд · ${run.wins} ${plural(run.wins)}`
          : `рекорд · ${record} ${plural(record)}`}
      </p>

      <button className="stamp runover__again" onClick={onNewRun}>
        Новый забег
      </button>
    </div>
  )
}

function plural(n: number): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return 'победа'
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'победы'
  return 'побед'
}
