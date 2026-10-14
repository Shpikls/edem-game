import { parseShape } from '../engine/index.ts'
import type { ModuleId } from './modules.ts'

export const frigate = {
  name: 'Фрегат',
  hullHp: 100,
  // The hold (cargo grid) inside the fighter's silhouette; nose points right.
  hull: parseShape([
    '..##..',
    '.####.',
    '######',
    '######',
    '.####.',
    '..##..',
  ]),
}

type Pt = readonly [number, number]

/**
 * FTL-style ship outline around a hold of gw × gh cells, in cell units,
 * nose pointing to +x. Shared by the shipyard (SVG) and the battle (Pixi).
 */
export interface Silhouette {
  /** Extra room around the hold, in cells. */
  pad: { left: number; right: number; top: number; bottom: number }
  hull: Pt[]
  fins: Pt[][]
  engines: { x: number; y: number; w: number; h: number }[]
  /** Short decorative strokes: panel lines, cockpit, exhaust. */
  lines: Pt[][]
}

/** Fighter-style warship around the hold: delta wings, twin tail, nose canopy. */
function fighter(gw: number, gh: number): Silhouette {
  const c = gh / 2
  // mirror a point across the horizontal centre line (bottom half = top half)
  const m = ([x, y]: Pt): Pt => [x, gh - y]
  // The wing root overlaps the fuselage and its leading edge clears the hold's
  // corners (checked by ships.test.ts).
  const topWing: Pt[] = [
    [gw + 0.62, c - 0.9],
    [3.1, -1.75],
    [1.4, -1.95],
    [-0.35, -1.55],
    [-0.15, c - 0.9],
  ]
  const topTail: Pt[] = [
    [-0.4, c - 1.05],
    [-1.55, c - 2.15],
    [-2.05, c - 2.05],
    [-1.3, c - 0.95],
  ]
  return {
    pad: { left: 2.2, right: 2.9, top: 2.05, bottom: 2.05 },
    // fuselage: long body with a pointed nose
    hull: [
      [-1.35, c - 1.25],
      [gw + 0.6, c - 1.25],
      [gw + 1.6, c - 0.55],
      [gw + 2.75, c],
      [gw + 1.6, c + 0.55],
      [gw + 0.6, c + 1.25],
      [-1.35, c + 1.25],
    ],
    fins: [topWing, topWing.map(m), topTail, topTail.map(m)],
    engines: [
      { x: -1.95, y: c - 0.9, w: 0.65, h: 0.7 },
      { x: -1.95, y: c + 0.2, w: 0.65, h: 0.7 },
    ],
    lines: [
      // canopy
      [
        [gw + 0.15, c - 0.32],
        [gw + 1.25, c],
        [gw + 0.15, c + 0.32],
        [gw - 0.35, c],
        [gw + 0.15, c - 0.32],
      ],
      // wingtip cannons
      [
        [1.2, -1.9],
        [2.9, -1.9],
      ],
      [m([1.2, -1.9]), m([2.9, -1.9])],
      // wing panel lines
      [
        [gw - 1.6, c - 1.25],
        [1.3, -1.45],
      ],
      [m([gw - 1.6, c - 1.25]), m([1.3, -1.45])],
      // exhaust flames
      [
        [-1.95, c - 0.55],
        [-2.55, c - 0.55],
      ],
      [
        [-1.95, c + 0.55],
        [-2.55, c + 0.55],
      ],
    ],
  }
}

export interface SandboxShipPreset {
  hullHp: number
  modules: ModuleId[]
}

export const sandboxPresets: Record<'player' | 'enemy', SandboxShipPreset> = {
  player: { hullHp: 100, modules: ['laser', 'laser', 'shield'] },
  enemy: { hullHp: 100, modules: ['railgun', 'armor'] },
}

/** How tightly the fighter hugs the hold (1 = original drawing). */
const SHIP_SCALE = 0.86

/** The fighter, shrunk around the hold's centre so the hold fills more of it. */
export function silhouette(gw: number, gh: number): Silhouette {
  const base = fighter(gw, gh)
  const cx = gw / 2
  const cy = gh / 2
  const k = SHIP_SCALE
  const pt = ([x, y]: Pt): Pt => [cx + (x - cx) * k, cy + (y - cy) * k]
  return {
    pad: {
      left: (base.pad.left + cx) * k - cx,
      right: (base.pad.right + cx) * k - cx,
      top: (base.pad.top + cy) * k - cy,
      bottom: (base.pad.bottom + cy) * k - cy,
    },
    hull: base.hull.map(pt),
    fins: base.fins.map((f) => f.map(pt)),
    engines: base.engines.map((e) => {
      const [x, y] = pt([e.x, e.y])
      return { x, y, w: e.w * k, h: e.h * k }
    }),
    lines: base.lines.map((l) => l.map(pt)),
  }
}
