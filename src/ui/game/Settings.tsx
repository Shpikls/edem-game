import { useSyncExternalStore } from 'react'
import { track } from '../analytics.ts'
import {
  getVolume,
  isMuted,
  onSoundChange,
  setMuted,
  setVolume,
  sfx,
} from '../sound.ts'

/** Settings panel over the game: sound, tutorial, new run, build id. */
export function Settings({
  onClose,
  onResetTutorial,
  onNewRun,
}: {
  onClose: () => void
  onResetTutorial: () => void
  onNewRun: () => void
}) {
  const muted = useSyncExternalStore(onSoundChange, isMuted)
  const volume = useSyncExternalStore(onSoundChange, getVolume)
  return (
    <div className="settings" onClick={onClose}>
      <section
        className="sheet settings__sheet"
        role="dialog"
        aria-label="Настройки"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="sheet__title">
          <span className="sheet__num">⚙</span>
          Настройки
        </h2>
        <button
          className="settings__close link-button"
          aria-label="закрыть"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="settings__row">
          <span className="settings__label">звук</span>
          <div className="segmented" role="group" aria-label="звук">
            {[
              { on: true, text: 'вкл' },
              { on: false, text: 'выкл' },
            ].map((o) => (
              <button
                key={o.text}
                className={o.on === !muted ? 'is-active' : ''}
                aria-pressed={o.on === !muted}
                onClick={() => {
                  if (o.on === !muted) return
                  setMuted(!o.on)
                  track('settings', { sound: o.on })
                  if (o.on) sfx('click')
                }}
              >
                {o.text}
              </button>
            ))}
          </div>
        </div>

        <label className={`settings__row ${muted ? 'is-off' : ''}`}>
          <span className="settings__label">громкость</span>
          <input
            className="settings__range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(volume * 100)}
            disabled={muted}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            onPointerUp={() => sfx('buy')}
            onKeyUp={() => sfx('buy')}
          />
          <b className="settings__value">{Math.round(volume * 100)}%</b>
        </label>

        <div className="settings__row">
          <span className="settings__label">обучение</span>
          <button
            onClick={() => {
              onResetTutorial()
              onClose()
            }}
          >
            показать заново
          </button>
        </div>

        <div className="settings__row">
          <span className="settings__label">забег</span>
          <button
            className="settings__danger"
            onClick={() => {
              if (confirm('Начать новый забег? Текущий пропадёт.')) {
                onNewRun()
                onClose()
              }
            }}
          >
            ⟲ начать заново
          </button>
        </div>

        <p className="settings__build">EDEM · сборка {__BUILD__}</p>
      </section>
    </div>
  )
}
