import { describe, expect, test } from 'vitest'
import {
  adjacency,
  checkPlacement,
  parseShape,
  placedCells,
  renderCells,
  rotateShape,
  validateLayout,
  type Placement,
  type Rotation,
  type Shape,
} from './grid.ts'

const L = parseShape(['#.', '#.', '##'])
const BAR = parseShape(['###'])
const DOT = parseShape(['#'])
const HULL = parseShape(['.####.', '######', '######', '.####.'])

const at = (
  id: string,
  shape: Shape,
  x: number,
  y: number,
  rotation: Rotation = 0,
): Placement => ({ id, shape, x, y, rotation })

describe('parseShape / renderCells', () => {
  test('round-trips an ASCII picture', () => {
    expect(renderCells(L)).toEqual(['#.', '#.', '##'])
    expect(renderCells(HULL)).toEqual(['.####.', '######', '######', '.####.'])
  })

  test('normalizes offsets', () => {
    expect(parseShape(['...', '.#.'])).toEqual([{ x: 0, y: 0 }])
  })

  test('rejects empty shapes', () => {
    expect(() => parseShape(['...'])).toThrow()
  })
})

describe('rotateShape', () => {
  test('rotates clockwise', () => {
    expect(renderCells(rotateShape(L, 1))).toEqual(['###', '#..'])
    expect(renderCells(rotateShape(L, 2))).toEqual(['##', '.#', '.#'])
    expect(renderCells(rotateShape(L, 3))).toEqual(['..#', '###'])
    expect(renderCells(rotateShape(BAR, 1))).toEqual(['#', '#', '#'])
  })

  test('four turns return the original shape', () => {
    let shape: Shape = L
    for (let i = 0; i < 4; i++) shape = rotateShape(shape, 1)
    expect(shape).toEqual(L)
  })

  test('rotation keeps the cell count', () => {
    for (const r of [0, 1, 2, 3] as const) {
      expect(rotateShape(HULL, r)).toHaveLength(HULL.length)
    }
  })
})

describe('checkPlacement', () => {
  test('accepts a module inside an empty hull', () => {
    expect(checkPlacement(HULL, [], at('a', L, 1, 0))).toEqual({ ok: true })
  })

  test('rejects cells outside the hull, including cut corners', () => {
    expect(checkPlacement(HULL, [], at('a', DOT, 0, 0))).toEqual({
      ok: false,
      reason: 'out-of-hull',
      cells: [{ x: 0, y: 0 }],
    })
    const result = checkPlacement(HULL, [], at('a', BAR, 4, 1))
    expect(result).toMatchObject({ ok: false, reason: 'out-of-hull' })
  })

  test('rotation decides whether a module fits', () => {
    // Vertical bar of 3 fits in column 0 rows 1..3? Row 3 col 0 is cut → no.
    expect(checkPlacement(HULL, [], at('a', BAR, 0, 1, 1)).ok).toBe(false)
    expect(checkPlacement(HULL, [], at('a', BAR, 1, 0, 1)).ok).toBe(true)
  })

  test('rejects overlap and names the blocking modules', () => {
    const placed = [at('bar', BAR, 1, 1), at('dot', DOT, 3, 2)]
    expect(checkPlacement(HULL, placed, at('L', L, 3, 1))).toEqual({
      ok: false,
      reason: 'overlap',
      cells: [
        { x: 3, y: 1 },
        { x: 3, y: 2 },
      ],
      with: ['bar', 'dot'],
    })
  })

  test('ignores its own previous placement when moving a module', () => {
    const placed = [at('a', BAR, 1, 1)]
    expect(checkPlacement(HULL, placed, at('a', BAR, 2, 1))).toEqual({
      ok: true,
    })
  })
})

describe('validateLayout', () => {
  test('reports each bad module', () => {
    const problems = validateLayout(HULL, [
      at('ok', BAR, 1, 1),
      at('clash', DOT, 2, 1),
      at('outside', DOT, 0, 0),
    ])
    expect(problems.map((p) => [p.id, p.check.reason])).toEqual([
      ['clash', 'overlap'],
      ['outside', 'out-of-hull'],
    ])
  })

  test('rejects duplicate ids', () => {
    expect(() =>
      validateLayout(HULL, [at('a', DOT, 1, 1), at('a', DOT, 2, 2)]),
    ).toThrow(/duplicate/)
  })
})

describe('adjacency', () => {
  test('edge contact counts, diagonal does not', () => {
    const map = adjacency([
      at('reactor', DOT, 2, 1),
      at('right', DOT, 3, 1),
      at('below', DOT, 2, 2),
      at('diagonal', DOT, 3, 2),
      at('far', DOT, 5, 2),
    ])
    expect(Object.fromEntries(map)).toEqual({
      reactor: ['below', 'right'],
      right: ['diagonal', 'reactor'],
      below: ['diagonal', 'reactor'],
      diagonal: ['below', 'right'],
      far: [],
    })
  })

  test('multi-cell modules touch along any of their cells', () => {
    const map = adjacency([at('L', L, 1, 0), at('bar', BAR, 3, 2)])
    // L occupies (1,0) (1,1) (1,2) (2,2); bar starts at (3,2) → shares an edge with (2,2).
    expect(map.get('L')).toEqual(['bar'])
    expect(map.get('bar')).toEqual(['L'])
  })

  test('is symmetric', () => {
    const placements = [
      at('a', L, 1, 0),
      at('b', BAR, 2, 1, 1),
      at('c', DOT, 4, 2),
      at('d', BAR, 1, 3),
    ]
    const map = adjacency(placements)
    for (const [id, neighbors] of map) {
      for (const n of neighbors) expect(map.get(n)).toContain(id)
    }
  })

  test('placedCells applies rotation then offset', () => {
    expect(placedCells(at('a', BAR, 2, 1, 1))).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ])
  })
})
