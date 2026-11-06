import { useEffect, useState } from 'react'
import { track } from '../analytics.ts'
import { gameReady } from '../platform.ts'
import { Rules } from './Rules.tsx'
import { readRecord, winsWord } from './record.ts'
import { Settings } from './Settings.tsx'
import { ShipGlyph } from './ShipGlyph.tsx'

/**
 * Main menu: blueprint intro animation (only on launch), then start / continue,
 * how to play, settings and the record.
 */
export function Splash({
  intro,
  hasSave,
  tutorialDefault,
  onContinue,
  onStart,
}: {
  /** Play the intro; coming back from a run opens the menu at once. */
  intro: boolean
  hasSave: boolean
  tutorialDefault: boolean
  onContinue: () => void
  onStart: (withTutorial: boolean) => void
}) {
  const [skipped, setSkipped] = useState(!intro)
  // Interactive from the first frame: the platform can drop its loader.
  useEffect(() => gameReady(), [])
  const [tutorial, setTutorial] = useState(tutorialDefault)
  const [panel, setPanel] = useState<'rules' | 'settings' | null>(null)
  const [record] = useState(readRecord)
  const open = (p: 'rules' | 'settings') => {
    track('menu', { open: p })
    setPanel(p)
  }
  return (
    <>
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
          <div className="splash__more">
            <button onClick={() => open('rules')}>Как играть</button>
            <button onClick={() => open('settings')}>Настройки</button>
          </div>
          {record > 0 && (
            <p className="splash__record">
              рекорд · {record} {winsWord(record)}
            </p>
          )}
        </div>
      </div>
      {panel === 'rules' && <Rules onClose={() => setPanel(null)} />}
      {panel === 'settings' && <Settings onClose={() => setPanel(null)} />}
    </>
  )
}
