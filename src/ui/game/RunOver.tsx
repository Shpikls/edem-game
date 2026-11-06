import { useEffect, useState } from 'react'
import { runContext } from '../../content/run.ts'
import type { RunState } from '../../engine/index.ts'
import { sfx } from '../sound.ts'
import { load } from '../storage.ts'
import { HullGrid } from './HullGrid.tsx'
import { readRecord, saveRecord, winsWord } from './record.ts'

/** Wall-clock start of the current run (set when the player starts it). */
export const RUN_STARTED_KEY = 'run.startedAt'

function runMinutes(): string | null {
  try {
    const started = Number(load(RUN_STARTED_KEY))
    if (!started) return null
    const s = Math.max(0, Math.round((Date.now() - started) / 1000))
    // A run left open for days says nothing about play time.
    if (s > 3 * 3600) return null
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  } catch {
    return null
  }
}

/** End of a run: a debrief sheet with the final build, stats and record. */
export function RunOver({
  run,
  onNewRun,
  onMainMenu,
}: {
  run: RunState
  onNewRun: () => void
  onMainMenu: () => void
}) {
  const { config, hull } = runContext
  const won = run.lives > 0
  // Read once, before this run is written in: decides "new record".
  const [prevRecord] = useState(readRecord)
  const [time] = useState(runMinutes)
  const newRecord = run.wins > prevRecord
  const record = Math.max(prevRecord, run.wins)

  useEffect(() => {
    saveRecord(record)
    sfx(won ? 'runWon' : 'runLost')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const jumpsUsed = config.jumpCharges - run.jumps
  const stars = run.placed.filter((p) => (p.tier ?? 1) > 1).length
  const rows: [string, string][] = [
    ['побед', `${run.wins} из ${config.rounds}`],
    ['аварийных прыжков', `${jumpsUsed} из ${config.jumpCharges}`],
    ['модулей на борту', `${run.placed.length}${stars ? ` · ★ ${stars}` : ''}`],
    ['трещин в корпусе', `${run.cracks.length}`],
    ...(time ? [['время забега', time] as [string, string]] : []),
  ]
  const title = won ? 'Поздравляем!' : 'Корабль уничтожен'

  return (
    <div className={`runover ${won ? 'runover--won' : 'runover--lost'}`}>
      <div className="runover__grid" />
      {won && (
        <div className="runover__sparks" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${8 + ((i * 37) % 84)}%`,
                top: `${6 + ((i * 53) % 30)}%`,
                animationDelay: `${0.5 + (i % 6) * 0.35}s`,
              }}
            />
          ))}
        </div>
      )}
      <h1 className="runover__title">
        {/* letters drop in one by one; words never break apart */}
        {title.split(' ').map((word, w, words) => {
          const offset = words.slice(0, w).join(' ').length + (w ? 1 : 0)
          return (
            <span key={w} className="runover__word">
              {[...word].map((ch, i) => (
                <span
                  key={i}
                  style={{ animationDelay: `${0.1 + (offset + i) * 0.05}s` }}
                >
                  {ch}
                </span>
              ))}
            </span>
          )
        })}
      </h1>
      <p className="runover__sub">
        {won
          ? `все ${config.rounds} миссий пройдены`
          : `погиб в миссии ${run.round} из ${config.rounds}`}
      </p>

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
          ? `новый рекорд · ${run.wins} ${winsWord(run.wins)}`
          : `рекорд · ${record} ${winsWord(record)}`}
      </p>

      <button className="stamp runover__again" onClick={onNewRun}>
        Новый забег
      </button>
      <button className="runover__menu" onClick={onMainMenu}>
        Главное меню
      </button>
    </div>
  )
}
