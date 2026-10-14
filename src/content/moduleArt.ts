import type { ModuleId } from './modules.ts'

/**
 * Blueprint line art for modules, drawn for rotation 0 in a box of
 * (shape width × 100) by (shape height × 100) units. One source for both
 * the DOM (inline SVG) and the battle scene (Pixi Graphics.svg).
 */

type Prim =
  | {
      t: 'rect'
      x: number
      y: number
      w: number
      h: number
      r?: number
      solid?: boolean
    }
  | {
      t: 'circle'
      cx: number
      cy: number
      r: number
      solid?: boolean
      dash?: string
    }
  | { t: 'path'; d: string; thin?: boolean; dash?: string }

interface Art {
  w: number
  h: number
  prims: Prim[]
}

export const moduleArt: Record<ModuleId, Art> = {
  laser: {
    w: 200,
    h: 100,
    prims: [
      { t: 'rect', x: 10, y: 26, w: 72, h: 48, r: 6 },
      { t: 'path', d: 'M24 38 H60 M24 50 H60 M24 62 H60', thin: true },
      { t: 'path', d: 'M82 42 H92 M82 58 H92' },
      { t: 'circle', cx: 110, cy: 50, r: 18 },
      { t: 'circle', cx: 110, cy: 50, r: 7, solid: true },
      { t: 'path', d: 'M128 36 L190 50 L128 64' },
      { t: 'path', d: 'M132 50 H190', thin: true, dash: '6 6' },
    ],
  },
  railgun: {
    w: 300,
    h: 100,
    prims: [
      { t: 'rect', x: 10, y: 20, w: 62, h: 60, r: 4 },
      { t: 'circle', cx: 41, cy: 50, r: 11 },
      { t: 'path', d: 'M72 36 H290 M72 64 H290' },
      {
        t: 'path',
        d: 'M110 26 V74 M146 26 V74 M182 26 V74 M218 26 V74',
        thin: true,
      },
      { t: 'path', d: 'M290 28 V72' },
      { t: 'path', d: 'M240 50 H280', thin: true, dash: '6 6' },
    ],
  },
  shield: {
    w: 200,
    h: 200,
    prims: [
      { t: 'path', d: 'M100 18 L171 59 L171 141 L100 182 L29 141 L29 59 Z' },
      { t: 'circle', cx: 100, cy: 100, r: 50, dash: '12 9' },
      { t: 'circle', cx: 100, cy: 100, r: 20 },
      { t: 'circle', cx: 100, cy: 100, r: 8, solid: true },
      {
        t: 'path',
        d: 'M100 50 V80 M100 120 V150 M50 100 H80 M120 100 H150',
        thin: true,
      },
    ],
  },
  armor: {
    w: 100,
    h: 200,
    prims: [
      { t: 'rect', x: 12, y: 12, w: 76, h: 176, r: 4 },
      { t: 'path', d: 'M12 70 H88 M12 130 H88' },
      {
        t: 'path',
        d: 'M30 30 L70 52 M30 88 L70 110 M30 148 L70 170',
        thin: true,
      },
      { t: 'circle', cx: 24, cy: 24, r: 4, solid: true },
      { t: 'circle', cx: 76, cy: 24, r: 4, solid: true },
      { t: 'circle', cx: 24, cy: 176, r: 4, solid: true },
      { t: 'circle', cx: 76, cy: 176, r: 4, solid: true },
    ],
  },
}

/** Full SVG document; every element carries its own attributes (Pixi's parser needs that). */
export function artSvg(id: ModuleId, color: string): string {
  const { w, h, prims } = moduleArt[id]
  const stroke = (thin?: boolean, dash?: string) =>
    `fill="none" stroke="${color}" stroke-width="${thin ? 3 : 5}" stroke-linecap="round" stroke-linejoin="round"${
      dash ? ` stroke-dasharray="${dash}"` : ''
    }`
  const body = prims
    .map((p) => {
      switch (p.t) {
        case 'rect':
          return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r ?? 0}" ${
            p.solid ? `fill="${color}"` : stroke()
          }/>`
        case 'circle':
          return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" ${
            p.solid ? `fill="${color}"` : stroke(false, p.dash)
          }/>`
        case 'path':
          return `<path d="${p.d}" ${stroke(p.thin, p.dash)}/>`
      }
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`
}
