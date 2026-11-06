import { runContext } from '../../content/run.ts'

/** "How to play": the whole run on one sheet, from the menu or the game. */
export function Rules({ onClose }: { onClose: () => void }) {
  const { config } = runContext
  return (
    <div className="settings" onClick={onClose}>
      <section
        className="sheet settings__sheet rules"
        role="dialog"
        aria-label="Как играть"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="sheet__title">
          <span className="sheet__num">?</span>
          Как играть
        </h2>
        <button
          className="settings__close link-button"
          aria-label="закрыть"
          onClick={onClose}
        >
          ✕
        </button>
        <ol className="rules__list">
          <li>
            <b>Цель</b> — пройти {config.rounds} миссий. Враги всё сильнее.
          </li>
          <li>
            <b>Станция</b>: покупай модули и ставь их на сетку корпуса. Места
            всегда мало.
          </li>
          <li>
            <b>Бой идёт сам.</b> Щит гасит лазеры, броня — пулемёт и ракеты,
            ракеты пробивают щит.
          </li>
          <li>
            <b>Победа</b> — золото и модуль из обломков врага, иногда ★.
          </li>
          <li>
            <b>Трещины</b>: модуль на трещине не работает. Ремонт на станции —{' '}
            {config.repairCost} зол. за клетку.
          </li>
          <li>
            <b>Поражение</b> — аварийный прыжок (их {config.jumpCharges}):
            пересобери корабль и повтори миссию. Без прыжков корабль гибнет.
          </li>
          <li>
            <b>После {config.rounds}-го боя</b> забег окончен: итоги и рекорд.
            Новый забег — новые враги и модули.
          </li>
        </ol>
        <button className="stamp rules__ok" onClick={onClose}>
          Понятно
        </button>
      </section>
    </div>
  )
}
