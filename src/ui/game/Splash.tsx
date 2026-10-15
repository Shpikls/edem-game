import { useEffect, useState } from 'react'
import { gameReady } from '../platform.ts'
import { ShipGlyph } from './ShipGlyph.tsx'

/** Title screen: blueprint intro animation, then start / continue. */
export function Splash({
  hasSave,
  tutorialDefault,
  onContinue,
  onStart,
}: {
  hasSave: boolean
  tutorialDefault: boolean
  onContinue: () => void
  onStart: (withTutorial: boolean) => void
}) {
  const [skipped, setSkipped] = useState(false)
  // Interactive from the first frame: the platform can drop its loader.
  useEffect(() => gameReady(), [])
  const [tutorial, setTutorial] = useState(tutorialDefault)
  return (
    <div
      className={`splash ${skipped ? 'is-skipped' : ''}`}
      onClick={() => setSkipped(true)}
    >
      <div className="splash__grid" />
      <ShipGlyph className="splash__ship" />
      <h1 className="splash__title">
        {[...'EDEM'].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${1.4 + i * 0.18}s` }}>
            {ch}
          </span>
        ))}
      </h1>
      <p className="splash__sub">собери корабль · победи в 10 боях</p>
      <div className="splash__menu" onClick={(e) => e.stopPropagation()}>
        {hasSave && (
          <button className="stamp splash__primary" onClick={onContinue}>
            Продолжить
          </button>
        )}
        <button
          className={hasSave ? 'splash__secondary' : 'stamp splash__primary'}
          onClick={() => onStart(tutorial)}
        >
          {hasSave ? 'Новый забег' : 'Начать'}
        </button>
        <label className="check splash__check">
          <input
            type="checkbox"
            checked={tutorial}
            onChange={(e) => setTutorial(e.target.checked)}
          />
          с обучением
        </label>
      </div>
    </div>
  )
}
