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

/**
 * Fighter-style warship hugging the hold: the cross-shaped hold fills the
 * fuselage and the roots of the delta wings, with a thin margin around it.
 */
export function silhouette(gw: number, gh: number): Silhouette {
  const c = gh / 2
  const m = ([x, y]: Pt): Pt => [x, gh - y]
  const topWing: Pt[] = [
    [gw + 0.3, c - 1.0],
    [gw - 1.5, -0.35],
    [1.4, -0.35],
    [-0.4, 1.0],
    [-0.2, c - 1.3],
  ]
  const topTail: Pt[] = [
    [-0.6, c - 1.0],
    [-1.5, c - 1.9],
    [-1.9, c - 1.85],
    [-1.2, c - 0.95],
  ]
  return {
    pad: { left: 2.0, right: 1.8, top: 0.6, bottom: 0.6 },
    hull: [
      [-0.9, c - 1.05],
      [gw - 0.1, c - 1.2],
      [gw + 0.8, c - 0.55],
      [gw + 1.65, c],
      [gw + 0.8, c + 0.55],
      [gw - 0.1, c + 1.2],
      [-0.9, c + 1.05],
    ],
    fins: [topWing, topWing.map(m), topTail, topTail.map(m)],
    engines: [
      { x: -1.5, y: c - 0.85, w: 0.6, h: 0.65 },
      { x: -1.5, y: c + 0.2, w: 0.6, h: 0.65 },
    ],
    lines: [
      // canopy
      [
        [gw + 0.35, c - 0.28],
        [gw + 1.15, c],
        [gw + 0.35, c + 0.28],
        [gw + 0.05, c],
        [gw + 0.35, c - 0.28],
      ],
      // wingtip cannons
      [
        [1.6, -0.5],
        [gw - 1.6, -0.5],
      ],
      [m([1.6, -0.5]), m([gw - 1.6, -0.5])],
      // exhaust flames
      [
        [-1.5, c - 0.52],
        [-1.95, c - 0.52],
      ],
      [
        [-1.5, c + 0.52],
        [-1.95, c + 0.52],
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
