import { parseShape } from '../engine/index.ts'
import type { ModuleId } from './modules.ts'

export const frigate = {
  name: 'Фрегат',
  hullHp: 100,
  // The hold (cargo grid) inside the ship's silhouette; nose points right.
  hull: parseShape(['.#####.', '#######', '#######', '.#####.']),
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

export function silhouette(gw: number, gh: number): Silhouette {
  const midY = gh / 2
  return {
    pad: { left: 1.1, right: 1.3, top: 0.9, bottom: 0.9 },
    hull: [
      [-0.45, 0.35],
      [0.55, -0.35],
      [gw - 1.1, -0.35],
      [gw + 1.15, midY],
      [gw - 1.1, gh + 0.35],
      [0.55, gh + 0.35],
      [-0.45, gh - 0.35],
    ],
    fins: [
      [
        [1.2, -0.35],
        [2.2, -0.85],
        [3.6, -0.85],
        [4.2, -0.35],
      ],
      [
        [1.2, gh + 0.35],
        [2.2, gh + 0.85],
        [3.6, gh + 0.85],
        [4.2, gh + 0.35],
      ],
    ],
    engines: [
      { x: -1.0, y: midY - 1.15, w: 0.6, h: 0.8 },
      { x: -1.0, y: midY + 0.35, w: 0.6, h: 0.8 },
    ],
    lines: [
      // cockpit
      [
        [gw + 0.2, midY - 0.35],
        [gw + 0.75, midY],
        [gw + 0.2, midY + 0.35],
      ],
      // exhaust
      [
        [-1.0, midY - 0.75],
        [-1.25, midY - 0.75],
      ],
      [
        [-1.0, midY + 0.75],
        [-1.25, midY + 0.75],
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
