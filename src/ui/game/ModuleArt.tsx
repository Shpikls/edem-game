import { artSvg, moduleArt } from '../../content/moduleArt.ts'
import { modules, type ModuleId } from '../../content/modules.ts'
import { rotateShape, type Rotation, type Tier } from '../../engine/index.ts'

/**
 * Module icon sized to its rotated footprint; `cell` is a CSS length for one cell.
 * With `grid`, the occupied cells are drawn under the icon so the footprint is obvious.
 */
export function ModuleArt({
  defId,
  rotation = 0,
  cell,
  grid = false,
  tier,
  className = '',
}: {
  defId: string
  rotation?: Rotation
  cell: string
  grid?: boolean
  tier?: Tier | undefined
  className?: string
}) {
  const id = defId as ModuleId
  const art = moduleArt[id]
  const cw = art.w / 100
  const ch = art.h / 100
  const odd = rotation % 2 === 1
  return (
    <span
      className={`module-art module-art--${defId} module-art--${modules[id].stats.kind} ${className}`}
      style={{
        width: `calc(${cell} * ${odd ? ch : cw})`,
        height: `calc(${cell} * ${odd ? cw : ch})`,
      }}
    >
      {grid &&
        rotateShape(modules[id].shape, rotation).map((c) => (
          <i
            key={`${c.x},${c.y}`}
            className="module-art__cell"
            style={{
              left: `calc(${cell} * ${c.x})`,
              top: `calc(${cell} * ${c.y})`,
              width: cell,
              height: cell,
            }}
          />
        ))}
      <span
        className="module-art__svg"
        style={{
          width: `calc(${cell} * ${cw})`,
          height: `calc(${cell} * ${ch})`,
          transform: `translate(-50%, -50%) rotate(${rotation * 90}deg)`,
        }}
        dangerouslySetInnerHTML={{ __html: artSvg(id, 'currentColor') }}
      />
      {tier && tier > 1 && (
        <span className={`tier-badge tier-badge--${tier}`}>
          {tier === 2 ? 'II' : 'III'}
        </span>
      )}
    </span>
  )
}
