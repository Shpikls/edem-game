import { useEffect } from 'react'
import type { RunState } from '../../engine/index.ts'
import { track } from '../analytics.ts'

/** Tutorial progress lives apart from the run: it survives new runs. */
export interface TutorialState {
  on: boolean
  /** Ids of hints already shown and dismissed / completed. */
  done: string[]
}

interface Hint {
  id: string
  text: string
  /** CSS selector of the element to highlight. */
  target?: string
  /** Shown while this is true (and not done). */
  when: (run: RunState, ctx: HintCtx) => boolean
  /** Completes by itself once this becomes true. */
  doneWhen?: (run: RunState, ctx: HintCtx) => boolean
}

interface HintCtx {
  inBattle: boolean
  salvage: boolean
}

const HINTS: Hint[] = [
  {
    id: 'drag',
    text: 'Перетащи оружие из снабжения на корабль. Модули занимают клетки — места мало.',
    target: '.shop',
    when: (r, c) =>
      !c.inBattle && !c.salvage && r.station && r.placed.length === 0,
    doneWhen: (r) => r.placed.length > 0,
  },
  {
    id: 'rotate',
    text: 'Модуль не влезает? Проведи его через ↻ — он повернётся. Тап по модулю на корабле — меню.',
    target: '.rotate-zone',
    when: (r, c) =>
      !c.inBattle && !c.salvage && r.placed.length > 0 && r.round === 1,
  },
  {
    id: 'fight',
    text: 'Собрал корабль? Жми «В бой». Состав врага заранее неизвестен.',
    target: '.hud__fight',
    when: (r, c) =>
      !c.inBattle && !c.salvage && r.placed.length > 0 && r.round === 1,
    doneWhen: (r) => r.wins > 0 || r.lastBattle !== null,
  },
  {
    id: 'battle',
    text: 'Бой идёт сам: каждое оружие стреляет по своему таймеру. Можно ускорить ×2 / ×4.',
    target: '.battle__controls',
    when: (_r, c) => c.inBattle,
  },
  {
    id: 'salvage',
    text: 'После победы — обломки врага. Тапни, чтобы обыскать: один модуль уцелеет.',
    when: (_r, c) => c.salvage,
  },
  {
    id: 'bench',
    text: 'Магазин — на станции раз в 2 боя. Сейчас расставь находки со склада на корабль.',
    target: '.bench',
    when: (r, c) => !c.inBattle && !c.salvage && !r.station && r.round > 1,
  },
  {
    id: 'cracks',
    text: 'Корпус получил трещины: модуль на трещине не работает. Почини на станции (🔧) или переставь модуль.',
    target: '.cell--cracked',
    when: (r, c) => !c.inBattle && !c.salvage && r.cracks.length > 0,
  },
  {
    id: 'jump',
    text: 'Аварийный прыжок — это жизнь корабля, их всего 2 (◆ вверху). Страховка поможет пересобрать корабль.',
    target: '.lives',
    when: (r, c) => !c.inBattle && !c.salvage && r.jumped,
  },
]

export function Tutorial({
  run,
  inBattle,
  salvage,
  tut,
  setTut,
}: {
  run: RunState
  inBattle: boolean
  salvage: boolean
  tut: TutorialState
  setTut: (f: (t: TutorialState) => TutorialState) => void
}) {
  const ctx = { inBattle, salvage }

  // Auto-complete hints whose goal is reached.
  useEffect(() => {
    if (!tut.on) return
    const reached = HINTS.filter(
      (h) => !tut.done.includes(h.id) && h.doneWhen?.(run, ctx),
    ).map((h) => h.id)
    if (reached.length) setTut((t) => ({ ...t, done: [...t.done, ...reached] }))
  })

  const hint = tut.on
    ? HINTS.find((h) => !tut.done.includes(h.id) && h.when(run, ctx))
    : undefined

  // Highlight the target element.
  useEffect(() => {
    if (!hint?.target) return
    const el = document.querySelector(hint.target)
    el?.classList.add('tut-target')
    return () => el?.classList.remove('tut-target')
  }, [hint?.target, hint?.id, run])

  if (!hint) return null
  const step = HINTS.indexOf(hint) + 1
  return (
    <div className={`tut ${salvage ? 'tut--over' : ''}`} role="status">
      <span className="tut__step">
        {step}/{HINTS.length}
      </span>
      <p className="tut__text">{hint.text}</p>
      <div className="tut__actions">
        <button
          onClick={() => {
            track('tutorial_ok', { hint: hint.id, round: run.round })
            setTut((t) => ({ ...t, done: [...t.done, hint.id] }))
          }}
        >
          понятно
        </button>
        <button
          className="link-button"
          onClick={() => {
            track('tutorial_skip', { hint: hint.id, round: run.round })
            setTut((t) => ({ ...t, on: false }))
          }}
        >
          пропустить обучение
        </button>
      </div>
    </div>
  )
}
