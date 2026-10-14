interface Props {
  kind: 'win' | 'jump' | 'lost'
  title: string
  line: string
  sub?: string | undefined
  next: string
  onNext: () => void
}

/** End of battle: a stamp over the scene; the whole screen is the "Next" button. */
export function BattleEnd({ kind, title, line, sub, onNext }: Props) {
  return (
    <div className={`end-a end--${kind}`} onClick={onNext}>
      <div className="end-a__stamp">{title}</div>
      <p className="end-a__line">{line}</p>
      {sub && <p className="end-a__sub">{sub}</p>}
      <p className="end-a__tap">▸ тапни, чтобы продолжить</p>
    </div>
  )
}
