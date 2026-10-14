import type { ReactNode } from 'react'

/** A framed drawing area with a title tab on its top border. */
export function Sheet({
  num,
  title,
  aside,
  className = '',
  children,
}: {
  num: string
  title: ReactNode
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`sheet ${className}`}>
      <h2 className="sheet__title">
        <span className="sheet__num">{num}</span>
        {title}
      </h2>
      {aside && <div className="sheet__aside">{aside}</div>}
      {children}
    </section>
  )
}
