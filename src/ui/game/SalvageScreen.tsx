import { useEffect, useState } from 'react'
import { runContext } from '../../content/run.ts'
import { itemStats, type RunAction, type RunState } from '../../engine/index.ts'
import { def, describeStats } from './describe.ts'
import { ModuleArt } from './ModuleArt.tsx'
import { ShipGlyph } from './ShipGlyph.tsx'

const SCAN_MS = 2000
/** Warp transition back to the shipyard after the last wreck. */
const LEAVE_MS = 3000
const CELL = 40

type Stage = 'idle' | 'scanning' | 'reveal' | 'leaving'

const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Full-screen search of a defeated enemy's wreck: tap → a scanner sweeps the
 * drifting fragments for ~2 s (the glow colour hints the tier) → the find.
 */
export function SalvageScreen({
  run,
  dispatch,
  onSearch,
  onDone,
}: {
  run: RunState
  dispatch: (action: RunAction) => void
  onSearch: () => void
  onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>('idle')
  const [uid, setUid] = useState<string | null>(null)
  // The wreck being searched, frozen when the search starts.
  const [wreck, setWreck] = useState(run.salvage[0] ?? null)
  const current = stage === 'idle' ? (run.salvage[0] ?? wreck) : wreck
  const item = uid ? run.bench.find((b) => b.uid === uid) : undefined
  const tier = item?.tier ?? 1

  const finish = () => {
    setStage('idle')
    setUid(null)
    onDone()
  }

  useEffect(() => {
    if (stage !== 'scanning' && stage !== 'leaving') return
    const t = window.setTimeout(
      () => (stage === 'scanning' ? setStage('reveal') : finish()),
      stage === 'scanning' ? SCAN_MS : LEAVE_MS,
    )
    return () => window.clearTimeout(t)
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const search = () => {
    if (stage !== 'idle' || !run.salvage[0]) return
    setWreck(run.salvage[0])
    setUid(`i${run.nextUid}`)
    onSearch()
    dispatch({ type: 'searchWreck' })
    setStage('scanning')
  }

  // More wrecks → straight to the next one; after the last → a short warp out.
  const done = () => (run.salvage.length > 0 ? finish() : setStage('leaving'))

  const left = run.salvage.length + (stage === 'idle' ? 0 : 1)
  const onBoard = summarize(current?.pool ?? [])
  // Which fragment holds the find (deterministic per wreck).
  const hull = runContext.hull
  const findIndex = Math.floor(noise((current?.round ?? 1) * 7.3) * hull.length)

  return (
    <div
      className={`crate-screen salvage salvage--${stage} crate-screen--t${tier}`}
      onClick={stage === 'idle' ? search : undefined}
    >
      {stage !== 'leaving' && (
        <div className="crate-screen__head">
          <span>обломки врага · раунд {current?.round ?? run.round - 1}</span>
          {left > 1 && <span>ещё обломков: {left - 1}</span>}
        </div>
      )}

      {stage === 'leaving' ? (
        <div className="warp">
          {Array.from({ length: 36 }, (_, i) => (
            <i
              key={i}
              style={{
                top: `${noise(i + 1) * 100}%`,
                animationDelay: `${noise(i + 40) * 1.2}s`,
                animationDuration: `${0.5 + noise(i + 60) * 0.6}s`,
                width: `${15 + noise(i + 80) * 40}%`,
              }}
            />
          ))}
          <div className="warp__course">
            <span>курс</span>
            <b>
              {run.station ? 'станция снабжения' : 'точка встречи'} · миссия{' '}
              {run.round}/{runContext.config.rounds}
            </b>
          </div>
          <ShipGlyph className="warp__ship" />
        </div>
      ) : stage !== 'reveal' ? (
        <div className="crate-stage">
          <div className="crate-glow" />
          <svg
            className="wreck"
            viewBox={`-40 -40 ${6 * CELL + 80} ${6 * CELL + 80}`}
            width={6 * CELL + 80}
            height={6 * CELL + 80}
          >
            {hull.map((c, i) => {
              const dx = (noise(i + 1) - 0.5) * 12 + (c.x - 2.5) * 5
              const dy = (noise(i + 9) - 0.5) * 12 + (c.y - 2.5) * 5
              const rot = (noise(i + 17) - 0.5) * 24
              const isFind = i === findIndex
              return (
                <g
                  key={i}
                  className={`wreck__frag ${isFind ? 'wreck__frag--find' : ''}`}
                  style={{
                    transform: `translate(${c.x * CELL + dx}px, ${c.y * CELL + dy}px) rotate(${rot}deg)`,
                    animationDelay: `${-noise(i + 3) * 4}s`,
                  }}
                >
                  <rect
                    x={-CELL / 2 + 3}
                    y={-CELL / 2 + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                  />
                  {noise(i + 5) > 0.5 && (
                    <path
                      d={`M${-CELL / 2 + 6} ${-4} L0 2 L${CELL / 2 - 8} ${-8}`}
                      className="wreck__crack"
                    />
                  )}
                </g>
              )
            })}
            <rect
              className="wreck__scan"
              x={-40}
              y={-40}
              width={6 * CELL + 80}
              height={6}
            />
          </svg>
          <p className="crate-screen__hint">
            {stage === 'idle' ? 'тапни, чтобы обыскать' : 'сканирование…'}
          </p>
          {onBoard && (
            <p className="note salvage__onboard">на борту было: {onBoard}</p>
          )}
        </div>
      ) : (
        item && (
          <div className="crate-reveal">
            <div className="crate-glow crate-glow--burst" />
            <div className="crate-screen__head-inline">найдено в обломках</div>
            <ModuleArt defId={item.defId} cell="64px" grid tier={item.tier} />
            <div className="crate-reveal__name">
              {def(item.defId).name}
              {tier > 1 && (
                <span className="crate-reveal__stars"> {'★'.repeat(tier)}</span>
              )}
            </div>
            <div className="note">
              {describeStats(itemStats(runContext, item))}
            </div>
            {wreck?.kit && (
              <div className="salvage__kit">+ 🔧 ремкомплект — на складе</div>
            )}
            <button className="stamp" onClick={done}>
              На склад
            </button>
          </div>
        )
      )}
    </div>
  )
}

function summarize(pool: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const id of pool) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts]
    .map(([id, n]) => `${def(id).name}${n > 1 ? ` ×${n}` : ''}`)
    .join(', ')
}
