import { silhouette } from '../../content/ships.ts'

/** The player's fighter as a small SVG (same geometry as the shipyard/battle). */
export function ShipGlyph({ className = '' }: { className?: string }) {
  const gw = 6
  const gh = 6
  const sil = silhouette(gw, gh)
  const pts = (p: readonly (readonly [number, number])[]) =>
    p.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg
      className={`ship-glyph ${className}`}
      viewBox={`${-sil.pad.left} ${-sil.pad.top} ${gw + sil.pad.left + sil.pad.right} ${gh + sil.pad.top + sil.pad.bottom}`}
      aria-hidden
    >
      {sil.fins.map((f, i) => (
        <polygon key={`f${i}`} className="ship-glyph__fin" points={pts(f)} />
      ))}
      {sil.engines.map((e, i) => (
        <rect
          key={`e${i}`}
          className="ship-glyph__fin"
          x={e.x}
          y={e.y}
          width={e.w}
          height={e.h}
        />
      ))}
      <polygon className="ship-glyph__hull" points={pts(sil.hull)} />
      {sil.lines.map((l, i) => (
        <polyline key={`l${i}`} className="ship-glyph__line" points={pts(l)} />
      ))}
      {/* engine glow */}
      <circle
        className="ship-glyph__flame"
        cx={-2.4}
        cy={gh / 2 - 0.55}
        r={0.35}
      />
      <circle
        className="ship-glyph__flame"
        cx={-2.4}
        cy={gh / 2 + 0.55}
        r={0.35}
      />
    </svg>
  )
}
