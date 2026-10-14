import { useEffect, useState } from 'react'
import { runContext } from '../../content/run.ts'
import { itemStats, type RunAction, type RunState } from '../../engine/index.ts'
import { def, describeStats } from './describe.ts'
import { ModuleArt } from './ModuleArt.tsx'

const OPEN_MS = 2000

type Stage = 'idle' | 'opening' | 'reveal'

/**
 * Full-screen crate: tap → ~2 s of shaking with light leaking through the seams
 * (its colour hints the tier) → the lid pops and the module is revealed.
 */
export function CrateOpening({
  run,
  dispatch,
  onOpen,
  onDone,
}: {
  run: RunState
  dispatch: (action: RunAction) => void
  onOpen: () => void
  onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>('idle')
  const [uid, setUid] = useState<string | null>(null)
  // Round the crate was earned in, frozen when opening starts.
  const [earned, setEarned] = useState<number | null>(null)
  const item = uid ? run.bench.find((b) => b.uid === uid) : undefined
  const tier = item?.tier ?? 1

  useEffect(() => {
    if (stage !== 'opening') return
    const t = window.setTimeout(() => setStage('reveal'), OPEN_MS)
    return () => window.clearTimeout(t)
  }, [stage])

  const open = () => {
    if (stage !== 'idle') return
    // The roll happens now; the animation only reveals it.
    setUid(`i${run.nextUid}`)
    setEarned(run.crates[0] ?? null)
    onOpen()
    dispatch({ type: 'openCrate' })
    setStage('opening')
  }

  const done = () => {
    setStage('idle')
    setUid(null)
    setEarned(null)
    onDone()
  }

  const left = run.crates.length + (stage === 'idle' ? 0 : 1)

  return (
    <div
      className={`crate-screen crate-screen--${stage} crate-screen--t${tier}`}
      onClick={stage === 'idle' ? open : undefined}
    >
      <div className="crate-screen__head">
        <span>трофей · раунд {earned ?? run.crates[0] ?? run.round - 1}</span>
        {left > 1 && <span>контейнеров: {left}</span>}
      </div>

      {stage !== 'reveal' ? (
        <div className="crate-stage">
          <div className="crate-glow" />
          <CrateArt />
          <p className="crate-screen__hint">
            {stage === 'idle' ? 'тапни, чтобы вскрыть' : 'вскрытие…'}
          </p>
        </div>
      ) : (
        item && (
          <div className="crate-reveal">
            <div className="crate-glow crate-glow--burst" />
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
            <button className="stamp" onClick={done}>
              На склад
            </button>
          </div>
        )
      )}
    </div>
  )
}

function CrateArt() {
  const ink = 'currentColor'
  return (
    <svg className="crate-art" viewBox="0 0 220 200" width="220" height="200">
      <g className="crate-art__lid">
        <rect
          x="14"
          y="20"
          width="192"
          height="34"
          fill="rgb(16 57 106)"
          stroke={ink}
          strokeWidth="4"
        />
        <path
          d="M30 37 H190"
          stroke={ink}
          strokeWidth="2"
          strokeDasharray="8 6"
          fill="none"
        />
        <circle cx="26" cy="37" r="4" fill={ink} />
        <circle cx="194" cy="37" r="4" fill={ink} />
      </g>
      <g className="crate-art__body">
        <rect
          x="20"
          y="58"
          width="180"
          height="124"
          fill="rgb(16 57 106)"
          stroke={ink}
          strokeWidth="4"
        />
        <path
          d="M20 58 L200 182 M200 58 L20 182"
          stroke={ink}
          strokeWidth="3"
          fill="none"
          opacity="0.7"
        />
        <rect
          x="70"
          y="98"
          width="80"
          height="44"
          fill="rgb(16 57 106)"
          stroke={ink}
          strokeWidth="3"
        />
        <text
          x="110"
          y="117"
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="13"
          fill={ink}
        >
          EDEM
        </text>
        <text
          x="110"
          y="134"
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          fontSize="10"
          fill={ink}
          opacity="0.7"
        >
          ГРУЗ · 01
        </text>
        {[
          [30, 68],
          [190, 68],
          [30, 172],
          [190, 172],
        ].map(([x, y]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r="4" fill={ink} />
        ))}
      </g>
      <path
        className="crate-art__seam"
        d="M18 56 H202"
        strokeWidth="5"
        fill="none"
      />
    </svg>
  )
}
