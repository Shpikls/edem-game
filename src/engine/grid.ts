/**
 * Hull grid geometry: module shapes, rotation, placement checks, adjacency.
 * Coordinates are screen-style: x grows right, y grows down.
 */

export interface Cell {
  x: number
  y: number
}

/** Set of cells, normalized so the minimum x and y are 0. Used for hulls and modules. */
export type Shape = readonly Cell[]

/** Number of 90° clockwise turns. */
export type Rotation = 0 | 1 | 2 | 3

export interface Placement {
  /** Module instance id, unique within a layout. */
  id: string
  shape: Shape
  /** Grid position of the rotated shape's top-left corner. */
  x: number
  y: number
  rotation: Rotation
}

export type PlacementCheck =
  | { ok: true }
  | { ok: false; reason: 'out-of-hull'; cells: Cell[] }
  | { ok: false; reason: 'overlap'; cells: Cell[]; with: string[] }

const key = (cell: Cell): string => `${cell.x},${cell.y}`

const byPosition = (a: Cell, b: Cell): number => a.y - b.y || a.x - b.x

function normalize(cells: readonly Cell[]): Cell[] {
  if (cells.length === 0) return []
  const minX = Math.min(...cells.map((c) => c.x))
  const minY = Math.min(...cells.map((c) => c.y))
  return cells.map((c) => ({ x: c.x - minX, y: c.y - minY })).sort(byPosition)
}

/**
 * Builds a shape from an ASCII picture: '#' is a cell, anything else is empty.
 *   parseShape(['##', '#.']) → L-tromino
 */
export function parseShape(rows: readonly string[]): Shape {
  const cells: Cell[] = []
  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char === '#') cells.push({ x, y })
    })
  })
  if (cells.length === 0) throw new Error('shape has no cells')
  return normalize(cells)
}

export function rotateShape(shape: Shape, rotation: Rotation): Shape {
  let cells = [...shape]
  for (let i = 0; i < rotation; i++) {
    // 90° clockwise with y pointing down: (x, y) → (-y, x)
    cells = cells.map(({ x, y }) => ({ x: -y, y: x }))
  }
  return normalize(cells)
}

export function placedCells(placement: Placement): Cell[] {
  return rotateShape(placement.shape, placement.rotation).map((c) => ({
    x: c.x + placement.x,
    y: c.y + placement.y,
  }))
}

/** Can `candidate` go into `hull` next to already placed modules? */
export function checkPlacement(
  hull: Shape,
  placed: readonly Placement[],
  candidate: Placement,
): PlacementCheck {
  const cells = placedCells(candidate)
  const hullKeys = new Set(hull.map(key))
  const outside = cells.filter((c) => !hullKeys.has(key(c)))
  if (outside.length > 0)
    return { ok: false, reason: 'out-of-hull', cells: outside }

  const owner = new Map<string, string>()
  for (const p of placed) {
    if (p.id === candidate.id) continue
    for (const c of placedCells(p)) owner.set(key(c), p.id)
  }
  const overlapping = cells.filter((c) => owner.has(key(c)))
  if (overlapping.length > 0) {
    const ids = new Set(overlapping.map((c) => owner.get(key(c))!))
    return {
      ok: false,
      reason: 'overlap',
      cells: overlapping,
      with: [...ids].sort(),
    }
  }
  return { ok: true }
}

/** Validates a full layout; returns one problem per offending module, in layout order. */
export function validateLayout(
  hull: Shape,
  placements: readonly Placement[],
): { id: string; check: Exclude<PlacementCheck, { ok: true }> }[] {
  const seen = new Set<string>()
  for (const p of placements) {
    if (seen.has(p.id)) throw new Error(`duplicate placement id '${p.id}'`)
    seen.add(p.id)
  }
  const problems: {
    id: string
    check: Exclude<PlacementCheck, { ok: true }>
  }[] = []
  placements.forEach((p, i) => {
    const check = checkPlacement(hull, placements.slice(0, i), p)
    if (!check.ok) problems.push({ id: p.id, check })
  })
  return problems
}

/**
 * Modules sharing at least one edge (diagonals don't count).
 * Every id is present in the result; neighbor lists are sorted for determinism.
 */
export function adjacency(
  placements: readonly Placement[],
): Map<string, string[]> {
  const owner = new Map<string, string>()
  for (const p of placements) {
    for (const c of placedCells(p)) owner.set(key(c), p.id)
  }
  const result = new Map<string, string[]>()
  for (const p of placements) {
    const neighbors = new Set<string>()
    for (const { x, y } of placedCells(p)) {
      for (const n of [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ]) {
        const other = owner.get(key(n))
        if (other !== undefined && other !== p.id) neighbors.add(other)
      }
    }
    result.set(p.id, [...neighbors].sort())
  }
  return result
}

/** Debug helper: renders cells as an ASCII picture (inverse of parseShape). */
export function renderCells(cells: readonly Cell[], char = '#'): string[] {
  if (cells.length === 0) return []
  const width = Math.max(...cells.map((c) => c.x)) + 1
  const height = Math.max(...cells.map((c) => c.y)) + 1
  const rows = Array.from({ length: height }, () =>
    Array<string>(width).fill('.'),
  )
  for (const c of cells) rows[c.y]![c.x] = char
  return rows.map((r) => r.join(''))
}

/**
 * Greedy first-fit: places shapes in order, trying positions row by row and all rotations.
 * Returns one placement per input (null if it didn't fit). Deterministic.
 */
export function autoPlace(
  hull: Shape,
  items: readonly { id: string; shape: Shape }[],
): (Placement | null)[] {
  const width = Math.max(...hull.map((c) => c.x)) + 1
  const height = Math.max(...hull.map((c) => c.y)) + 1
  const placed: Placement[] = []
  return items.map(({ id, shape }) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (const rotation of [0, 1, 2, 3] as const) {
          const candidate = { id, shape, x, y, rotation }
          if (checkPlacement(hull, placed, candidate).ok) {
            placed.push(candidate)
            return candidate
          }
        }
      }
    }
    return null
  })
}
