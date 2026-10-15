import type { RunState } from '../../engine/index.ts'

/** Tutorial progress lives apart from the run: it survives new runs. */
export interface TutorialState {
  on: boolean
  /** Ids of steps already completed. */
  done: string[]
}

interface Ctx {
  inBattle: boolean
  salvage: boolean
}

/**
 * Show, don't tell: players don't read hints. Each step highlights one element,
 * a finger performs the action (tap or drag) and a 2–3 word label names it.
 * A step ends when the player does it; nothing blocks the game.
 */
interface Step {
  id: string
  /** Element to act on (the first visible match). */
  target: string
  /** Drag destination; without it the finger taps. */
  to?: string
  /** 2–3 words; empty = the finger alone. */
  label: string
  when: (run: RunState, ctx: Ctx) => boolean
  doneWhen?: (run: RunState, ctx: Ctx) => boolean
  /** Informational steps fade out on their own. */
  autoDoneMs?: number
}

const inYard = (c: Ctx) => !c.inBattle && !c.salvage

export const STEPS: Step[] = [
  {
    id: 'buy',
    target: '.offer--weapon:not(.is-disabled)',
    label: 'нажми — купить оружие',
    when: (r, c) => inYard(c) && r.station && r.placed.length === 0,
    doneWhen: (r) => r.placed.length > 0,
  },
  {
    id: 'fight',
    target: '.hud__fight:not(.is-blocked)',
    label: 'в бой!',
    when: (r, c) => inYard(c) && r.placed.length > 0 && r.lastBattle === null,
    doneWhen: (r) => r.lastBattle !== null,
  },
  {
    id: 'salvage',
    // only while the wreck waits for a tap
    target: '.salvage--idle .wreck',
    // the screen already says "тапни, чтобы обыскать": finger only
    label: '',
    when: (_r, c) => c.salvage,
    doneWhen: (r) => r.round > 1 && r.bench.length > 0,
  },
  {
    id: 'place',
    target: '.bench__item',
    to: '.hull-grid',
    label: 'перетащи на корабль',
    when: (r, c) => inYard(c) && r.round > 1 && r.bench.length > 0,
    // in the yard after a search: the find left the bench
    doneWhen: (r, c) =>
      inYard(c) &&
      r.round > 1 &&
      r.bench.length === 0 &&
      r.salvage.length === 0,
    autoDoneMs: 15_000,
  },
  {
    id: 'repair',
    target: '.repair-toggle, .repair-bar button:not(.link-button)',
    label: 'трещины — почини',
    when: (r, c) => inYard(c) && r.station && r.cracks.length > 0,
    autoDoneMs: 8_000,
  },
  {
    id: 'jump',
    target: '.lives',
    label: 'аварийный прыжок потрачен',
    when: (r, c) => inYard(c) && r.jumped,
    autoDoneMs: 5_000,
  },
]

/** The step to show now, if any. */
export function currentStep(
  tut: TutorialState,
  run: RunState,
  ctx: Ctx,
): Step | undefined {
  if (!tut.on) return undefined
  return STEPS.find((s) => !tut.done.includes(s.id) && s.when(run, ctx))
}
