import { usePersistentState } from '../usePersistentState.ts'

type Variant = 'a' | 'b' | 'c'

interface Props {
  kind: 'win' | 'jump' | 'lost'
  title: string
  line: string
  sub?: string | undefined
  next: string
  onNext: () => void
}

/**
 * End-of-battle presentation. Three variants are live for comparison
 * (switch in the corner); the losers will be removed.
 */
export function BattleEnd({ kind, title, line, sub, next, onNext }: Props) {
  const [variant, setVariant] = usePersistentState<Variant>('ui.battleEnd', 'a')

  const switcher = (
    <div className="end-switch" onClick={(e) => e.stopPropagation()}>
      вид:
      {(['a', 'b', 'c'] as const).map((v) => (
        <button
          key={v}
          className={v === variant ? 'is-active' : ''}
          onClick={() => setVariant(v)}
        >
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  )

  if (variant === 'a')
    // A: the whole screen is the "Next" button.
    return (
      <>
        {switcher}
        <div className={`end-a end--${kind}`} onClick={onNext}>
          <div className="end-a__stamp">{title}</div>
          <p className="end-a__line">{line}</p>
          {sub && <p className="end-a__sub">{sub}</p>}
          <p className="end-a__tap">▸ тапни, чтобы продолжить</p>
        </div>
      </>
    )

  if (variant === 'b')
    // B: no overlay; a full-width button docked to the bottom of the screen.
    return (
      <>
        {switcher}
        <div className={`end-b end--${kind}`}>
          <div className="end-b__info">
            <b>{title}</b>
            <span>
              {line}
              {sub && ` · ${sub}`}
            </span>
          </div>
          <button className="end-b__next" onClick={onNext}>
            {next} ▸
          </button>
        </div>
      </>
    )

  // C: a drawing band across the screen with a stamp button.
  return (
    <>
      {switcher}
      <div className={`end-c end--${kind}`}>
        <div className="end-c__band">
          <div className="end-c__info">
            <b>{title}</b>
            <span>{line}</span>
            {sub && <span className="end-c__sub">{sub}</span>}
          </div>
          <button className="stamp end-c__next" onClick={onNext}>
            {next}
          </button>
        </div>
      </div>
    </>
  )
}
