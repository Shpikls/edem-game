import { describe, expect, test } from 'vitest'
import { parseShape, placedCells } from '../../engine/index.ts'
import { centerFit, resolveDrop, rotateInPlace } from './rotation.ts'

const HULL = parseShape(['#####', '#####', '#####'])
const BAR = parseShape(['###'])

test('rotateInPlace turns a bar around its center', () => {
  const r = rotateInPlace(HULL, [], {
    id: 'a',
    shape: BAR,
    x: 1,
    y: 1,
    rotation: 0,
  })
  expect(r && placedCells(r)).toEqual([
    { x: 2, y: 0 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ])
})

test('rotateInPlace returns null when no rotation fits', () => {
  const thin = parseShape(['#####'])
  expect(
    rotateInPlace(thin, [], { id: 'a', shape: BAR, x: 0, y: 0, rotation: 0 }),
  ).toBeNull()
})

test('resolveDrop picks another rotation when the current one does not fit', () => {
  // Vertical bar dropped on the top row of a 3-high hull with grab at its middle → would stick out.
  const res = resolveDrop(HULL, [], 'a', BAR, 1, { x: 0, y: 1 }, { x: 0, y: 0 })
  expect(res.ok).toBe(true)
  expect(placedCells(res.placement)).toContainEqual({ x: 0, y: 0 })
})

test('four turns return a module to its original cells (no drift)', () => {
  const LASER = parseShape(['##'])
  const start = { id: 'a', shape: LASER, x: 2, y: 1, rotation: 0 as const }
  let p: ReturnType<typeof rotateInPlace> = start
  for (let i = 0; i < 4; i++) p = rotateInPlace(HULL, [], p!)
  expect(placedCells(p!)).toEqual(placedCells(start))
})

describe('centerFit', () => {
  const hull = parseShape(['#####', '#####', '#####'])
  const shape = parseShape(['#'])

  test('puts a new module in the middle of the hull', () => {
    expect(centerFit(hull, [], 'n', shape)).toMatchObject({ x: 2, y: 1 })
  })

  test('takes the nearest free spot when the middle is taken', () => {
    const mid = { id: 'm', shape, rotation: 0 as const, x: 2, y: 1 }
    const spot = centerFit(hull, [mid], 'n', shape)!
    expect(Math.abs(spot.x - 2) + Math.abs(spot.y - 1)).toBe(1)
  })

  test('no room → null', () => {
    const big = parseShape(['######'])
    expect(centerFit(hull, [], 'n', big)).toBeNull()
  })
})
