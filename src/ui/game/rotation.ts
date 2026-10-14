import {
  checkPlacement,
  placedCells,
  rotateShape,
  type Placement,
  type Rotation,
  type Shape,
} from '../../engine/index.ts'

export const nextRotation = (r: Rotation) => ((r + 1) % 4) as Rotation

const NUDGES = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
] as const

/**
 * Rotates a placed module by 90° around its center; if that spot is taken,
 * tries small nudges. Returns the new placement or null if nothing fits.
 */
export function rotateInPlace(
  hull: Shape,
  others: readonly Placement[],
  item: Placement,
): Placement | null {
  const cells = placedCells(item)
  const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length
  const cy = cells.reduce((s, c) => s + c.y, 0) / cells.length
  const rotation = nextRotation(item.rotation)
  const rotated = rotateShape(item.shape, rotation)
  const w = Math.max(...rotated.map((c) => c.x)) + 1
  const h = Math.max(...rotated.map((c) => c.y)) + 1
  // Alternate floor/ceil on .5 so four turns bring the module back to where it started.
  const snap = rotation % 2 === 1 ? Math.floor : Math.ceil
  const baseX = snap(cx - (w - 1) / 2)
  const baseY = snap(cy - (h - 1) / 2)
  for (const [dx, dy] of NUDGES) {
    const candidate = { ...item, rotation, x: baseX + dx, y: baseY + dy }
    if (checkPlacement(hull, others, candidate).ok) return candidate
  }
  return null
}

/**
 * Where to drop a module so that it covers the cell under the pointer.
 * Prefers the current rotation and grab point; otherwise any rotation and any
 * of the shape's cells under the pointer. Falls back to the preferred (invalid)
 * spot so the preview can show red.
 */
export function resolveDrop(
  hull: Shape,
  others: readonly Placement[],
  id: string,
  shape: Shape,
  rotation: Rotation,
  grab: { x: number; y: number },
  over: { x: number; y: number },
): { placement: Placement; ok: boolean } {
  const preferred: Placement = {
    id,
    shape,
    rotation,
    x: over.x - grab.x,
    y: over.y - grab.y,
  }
  if (checkPlacement(hull, others, preferred).ok)
    return { placement: preferred, ok: true }
  for (let k = 0; k < 4; k++) {
    const r = ((rotation + k) % 4) as Rotation
    const cells = [...rotateShape(shape, r)].sort(
      (a, b) =>
        Math.hypot(a.x - grab.x, a.y - grab.y) -
        Math.hypot(b.x - grab.x, b.y - grab.y),
    )
    for (const c of cells) {
      const candidate = {
        id,
        shape,
        rotation: r,
        x: over.x - c.x,
        y: over.y - c.y,
      }
      if (checkPlacement(hull, others, candidate).ok)
        return { placement: candidate, ok: true }
    }
  }
  return { placement: preferred, ok: false }
}
