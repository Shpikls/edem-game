import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { RunState } from '../../engine/index.ts'
import { track } from '../analytics.ts'
import { currentStep, STEPS, type TutorialState } from './tutorialSteps.ts'

export type { TutorialState }

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** First visible element matching the selector, as a viewport box. */
function locate(selector: string): Box | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0)
      return { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  return null
}

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
  const complete = (id: string) => {
    track('tutorial_step', { step: id, round: run.round })
    setTut((t) => (t.done.includes(id) ? t : { ...t, done: [...t.done, id] }))
  }

  // Steps whose goal is reached complete by themselves.
  useEffect(() => {
    if (!tut.on) return
    for (const s of STEPS)
      if (!tut.done.includes(s.id) && s.doneWhen?.(run, ctx)) complete(s.id)
  })

  const step = currentStep(tut, run, ctx)

  useEffect(() => {
    if (!step?.autoDoneMs) return
    const t = window.setTimeout(() => complete(step.id), step.autoDoneMs)
    return () => window.clearTimeout(t)
  }, [step?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the target around (layout shifts, scrolling, animations).
  const [boxes, setBoxes] = useState<{
    id: string
    at: Box
    to: Box | null
  } | null>(null)
  useEffect(() => {
    if (!step) return
    const measure = () => {
      const at = locate(step.target)
      const to = step.to ? locate(step.to) : null
      setBoxes((prev) =>
        at &&
        prev?.id === step.id &&
        same(prev.at, at) &&
        sameOrNull(prev.to, to)
          ? prev
          : at
            ? { id: step.id, at, to }
            : null,
      )
    }
    const first = window.setTimeout(measure, 0)
    const t = window.setInterval(measure, 250)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [step])

  // Real label width keeps it on screen.
  const labelRef = useRef<HTMLParagraphElement>(null)
  const [labelW, setLabelW] = useState(0)
  useLayoutEffect(() => {
    setLabelW(labelRef.current?.offsetWidth ?? 0)
  }, [step?.label, boxes?.id])

  if (!step || !boxes || boxes.id !== step.id) return null
  const { at, to } = boxes
  const cx = at.x + at.w / 2
  const cy = at.y + at.h / 2
  const drag = to
    ? { dx: to.x + to.w / 2 - cx, dy: to.y + to.h / 2 - cy }
    : null
  // Label above the target, or below it near the top of the screen.
  const above = at.y > 90
  const fingerStyle = {
    left: cx,
    top: cy,
    '--dx': `${drag?.dx ?? 0}px`,
    '--dy': `${drag?.dy ?? 0}px`,
  } as CSSProperties
  return (
    <div className="coach" aria-live="polite">
      <div
        className="coach__ring"
        style={{
          left: at.x - 6,
          top: at.y - 6,
          width: at.w + 12,
          height: at.h + 12,
        }}
      />
      <div
        key={step.id}
        className={`coach__finger ${drag ? 'coach__finger--drag' : ''}`}
        style={fingerStyle}
      >
        <Finger />
      </div>
      {step.label && (
        <p
          ref={labelRef}
          key={`l-${step.id}`}
          className={`coach__label ${above ? 'is-above' : 'is-below'}`}
          style={{
            left: clampLabel(cx, labelW),
            top: above ? at.y - 12 : at.y + at.h + 12,
          }}
        >
          {step.label}
        </p>
      )}
    </div>
  )
}

/** Keeps a label of this width fully on screen. */
function clampLabel(cx: number, width: number): number {
  const half = Math.min(window.innerWidth / 2 - 8, width / 2)
  return Math.min(Math.max(cx, half + 8), window.innerWidth - half - 8)
}

const same = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 1 &&
  Math.abs(a.y - b.y) < 1 &&
  Math.abs(a.w - b.w) < 1 &&
  Math.abs(a.h - b.h) < 1
const sameOrNull = (a: Box | null, b: Box | null) =>
  a === null || b === null ? a === b : same(a, b)

/** Pointing hand; CSS puts the fingertip on the target. */
function Finger() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {/* Material "touch_app" icon (Apache-2.0); fingertip near (11.5, 5) */}
      <path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z" />
    </svg>
  )
}
