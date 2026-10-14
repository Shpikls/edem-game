import { expect, test } from 'vitest'
import { frigate, silhouette } from './ships.ts'

type P = readonly [number, number]
const inside = ([x, y]: P, poly: readonly P[]) => {
  let r = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r
  }
  return r
}

test('every hold cell lies inside the ship silhouette', () => {
  const gw = Math.max(...frigate.hull.map((c) => c.x)) + 1
  const gh = Math.max(...frigate.hull.map((c) => c.y)) + 1
  const sil = silhouette(gw, gh)
  const polys = [sil.hull, ...sil.fins]
  const e = 0.02
  const outside: P[] = []
  for (const c of frigate.hull)
    for (const [dx, dy] of [
      [e, e],
      [1 - e, e],
      [e, 1 - e],
      [1 - e, 1 - e],
      [0.5, e],
      [0.5, 1 - e],
      [e, 0.5],
      [1 - e, 0.5],
    ] as const) {
      const p: P = [c.x + dx, c.y + dy]
      if (!polys.some((poly) => inside(p, poly))) outside.push(p)
    }
  expect(outside).toEqual([])
})
