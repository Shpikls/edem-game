import { artSvg, moduleArt } from '../../content/moduleArt.ts'
import type { ModuleId } from '../../content/modules.ts'
import type { Rotation } from '../../engine/index.ts'

/** Module icon sized to its rotated footprint; `cell` is a CSS length for one cell. */
export function ModuleArt({
  defId,
  rotation = 0,
  cell,
  className = '',
}: {
  defId: string
  rotation?: Rotation
  cell: string
  className?: string
}) {
  const art = moduleArt[defId as ModuleId]
  const cw = art.w / 100
  const ch = art.h / 100
  const odd = rotation % 2 === 1
  return (
    <span
      className={`module-art module-art--${defId} ${className}`}
      style={{
        width: `calc(${cell} * ${odd ? ch : cw})`,
        height: `calc(${cell} * ${odd ? cw : ch})`,
      }}
    >
      <span
        className="module-art__svg"
        style={{
          width: `calc(${cell} * ${cw})`,
          height: `calc(${cell} * ${ch})`,
          transform: `translate(-50%, -50%) rotate(${rotation * 90}deg)`,
        }}
        dangerouslySetInnerHTML={{
          __html: artSvg(defId as ModuleId, 'currentColor'),
        }}
      />
    </span>
  )
}
