import { Application, Container, Graphics, Text } from 'pixi.js'
import type {
  Battle,
  BattleEvent,
  Placement,
  Shape,
  Side,
} from '../engine/index.ts'
import { placedCells, rotateShape } from '../engine/index.ts'
import { artSvg, moduleArt } from '../content/moduleArt.ts'
import type { ModuleId } from '../content/modules.ts'

/**
 * Replays a battle log as an animation. Stateless with respect to time:
 * render(t) draws the scene for any moment, so speed changes and skipping are free.
 */

export interface SceneShip {
  hull: Shape
  /** Placement ids must equal engine module ids ('laser#1'). */
  modules: readonly (Placement & {
    kind: 'weapon' | 'shield' | 'armor'
    defId: string
  })[]
  /** Cracked cells before the battle / cracks this battle will cause ('x,y'). */
  cracks?: readonly string[]
  newCracks?: readonly string[]
}

const INK = 0xeaf2ff
const AMBER = 0xffd27a
const RED = 0xff8a66

const LASER_MS = 160
const SLUG_FLIGHT_MS = 260
const HIT_FX_MS = 420
const SHAKE_MS = 180
const FLOAT_MS = 900
const EXPLOSION_MS = 1400

interface ShipView {
  side: Side
  root: Container
  body: Graphics
  /** Cell size in px and grid origin (top-left) inside root. */
  cell: number
  width: number
  height: number
  mirror: boolean
  moduleCenter: Map<string, { x: number; y: number }>
  moduleRects: Map<string, { x: number; y: number }[]>
  center: { x: number; y: number }
  radius: { x: number; y: number }
}

/** Small deterministic hash → [0, 1) for per-event variation (spark angles etc.). */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export class BattleScene {
  private app = new Application()
  private ready = false
  private destroyed = false
  private world = new Container()
  private fx = new Graphics()
  private floatLayer = new Container()
  private floats: Text[] = []
  private ships: Record<Side, ShipView> | null = null
  private battle: Battle
  private shipsData: Record<Side, SceneShip>
  private lastT = 0

  constructor(battle: Battle, ships: Record<Side, SceneShip>) {
    this.battle = battle
    this.shipsData = ships
  }

  async mount(el: HTMLElement) {
    await this.app.init({
      resizeTo: el,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })
    if (this.destroyed) {
      this.app.destroy(true)
      return
    }
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.world, this.fx, this.floatLayer)
    this.ready = true
    this.layout()
    this.app.renderer.on('resize', () => {
      this.layout()
      this.render(this.lastT)
    })
    this.render(this.lastT)
  }

  destroy() {
    this.destroyed = true
    if (this.ready) this.app.destroy(true, { children: true })
  }

  private layout() {
    const { width: W, height: H } = this.app.screen
    this.world.removeChildren()
    const make = (side: Side): ShipView => {
      const data = this.shipsData[side]
      const gw = Math.max(...data.hull.map((c) => c.x)) + 1
      const gh = Math.max(...data.hull.map((c) => c.y)) + 1
      const cell = Math.floor(Math.min((H * 0.72) / gh, (W * 0.3) / gw))
      const mirror = side === 'enemy'
      const root = new Container()
      const body = new Graphics()
      root.addChild(body)
      const cx = side === 'player' ? W * 0.22 : W * 0.78
      root.position.set(
        Math.round(cx - (gw * cell) / 2),
        Math.round(H / 2 - (gh * cell) / 2),
      )
      this.world.addChild(root)

      const toLocal = (x: number) => (mirror ? gw - 1 - x : x)
      const moduleRects = new Map<string, { x: number; y: number }[]>()
      const moduleCenter = new Map<string, { x: number; y: number }>()
      for (const m of data.modules) {
        const cells = placedCells(m).map((c) => ({
          x: toLocal(c.x) * cell,
          y: c.y * cell,
        }))
        moduleRects.set(m.id, cells)
        const mx = cells.reduce((s, c) => s + c.x, 0) / cells.length + cell / 2
        const my = cells.reduce((s, c) => s + c.y, 0) / cells.length + cell / 2
        moduleCenter.set(m.id, { x: root.x + mx, y: root.y + my })
      }

      drawShip(
        body,
        root,
        data,
        cell,
        gw,
        mirror,
        side === 'enemy' ? AMBER : INK,
      )
      return {
        side,
        root,
        body,
        cell,
        width: gw,
        height: gh,
        mirror,
        moduleCenter,
        moduleRects,
        center: { x: root.x + (gw * cell) / 2, y: root.y + (gh * cell) / 2 },
        radius: {
          x: (gw * cell) / 2 + cell * 0.7,
          y: (gh * cell) / 2 + cell * 0.5,
        },
      }
    }
    this.ships = { player: make('player'), enemy: make('enemy') }
  }

  render(t: number) {
    this.lastT = t
    if (!this.ready || !this.ships) return
    const { events, durationMs, winner } = this.battle.result
    const fx = this.fx
    fx.clear()
    for (const f of this.floats) f.visible = false
    let floatIndex = 0

    const shake: Record<Side, number> = { player: 0, enemy: 0 }

    events.forEach((e, i) => {
      if (e.type === 'hit') {
        const from = this.ships![e.side]
        const to = this.ships![e.target]
        const src = from.moduleCenter.get(e.source) ?? from.center
        const aim = {
          x: to.center.x + (noise(i) - 0.5) * to.radius.x * 0.9,
          y: to.center.y + (noise(i + 7) - 0.5) * to.radius.y * 1.2,
        }
        const impact =
          e.absorbed > 0 && e.hullDamage === 0 ? edgePoint(to, src) : aim
        const color = e.side === 'enemy' ? AMBER : INK

        // muzzle flash on the firing module
        const fireT = e.damageType === 'energy' ? e.t : e.t - SLUG_FLIGHT_MS
        if (t >= fireT && t - fireT < 140) {
          for (const c of from.moduleRects.get(e.source) ?? []) {
            fx.rect(
              from.root.x + c.x + 1,
              from.root.y + c.y + 1,
              from.cell - 2,
              from.cell - 2,
            )
          }
          fx.fill({ color, alpha: 0.55 })
        }

        if (e.damageType === 'energy') {
          const age = t - e.t
          if (age >= 0 && age < LASER_MS) {
            const a = 1 - age / LASER_MS
            fx.moveTo(src.x, src.y).lineTo(impact.x, impact.y)
            fx.stroke({ width: 7, color, alpha: 0.12 * a })
            fx.moveTo(src.x, src.y).lineTo(impact.x, impact.y)
            fx.stroke({ width: 3, color, alpha: 0.35 * a })
            fx.moveTo(src.x, src.y).lineTo(impact.x, impact.y)
            fx.stroke({ width: 1.2, color: 0xffffff, alpha: a })
          }
        } else {
          const p = (t - (e.t - SLUG_FLIGHT_MS)) / SLUG_FLIGHT_MS
          if (p >= 0 && p < 1) {
            const x = src.x + (impact.x - src.x) * p
            const y = src.y + (impact.y - src.y) * p
            const tx = src.x + (impact.x - src.x) * Math.max(0, p - 0.18)
            const ty = src.y + (impact.y - src.y) * Math.max(0, p - 0.18)
            fx.moveTo(tx, ty)
              .lineTo(x, y)
              .stroke({ width: 2, color, alpha: 0.5 })
            fx.rect(x - 3, y - 3, 6, 6).fill({ color: 0xffffff })
          }
        }

        const age = t - e.t
        if (age >= 0 && age < HIT_FX_MS) {
          const a = 1 - age / HIT_FX_MS
          if (e.absorbed > 0) {
            // shield bubble flash
            fx.ellipse(to.center.x, to.center.y, to.radius.x, to.radius.y)
            fx.stroke({ width: 2, color: INK, alpha: 0.7 * a })
            fx.ellipse(to.center.x, to.center.y, to.radius.x, to.radius.y)
            fx.fill({ color: INK, alpha: 0.07 * a })
            fx.circle(impact.x, impact.y, 6 + age * 0.05).stroke({
              width: 1.5,
              color: INK,
              alpha: a,
            })
          }
          if (e.hullDamage > 0) {
            for (let k = 0; k < 7; k++) {
              const ang = noise(i * 13 + k) * Math.PI * 2
              const len = 4 + age * 0.06 * (0.5 + noise(i * 31 + k))
              const x0 = impact.x + Math.cos(ang) * len * 0.4
              const y0 = impact.y + Math.sin(ang) * len * 0.4
              fx.moveTo(x0, y0).lineTo(
                impact.x + Math.cos(ang) * len,
                impact.y + Math.sin(ang) * len,
              )
            }
            fx.stroke({ width: 1.5, color: RED, alpha: a })
            if (age < SHAKE_MS)
              shake[e.target] = Math.max(
                shake[e.target],
                (1 - age / SHAKE_MS) * 4,
              )
          }
          if (e.blocked > 0) {
            fx.rect(impact.x - 5, impact.y - 5, 10, 10).stroke({
              width: 1,
              color: INK,
              alpha: a,
            })
          }
        }

        if (age >= 0 && age < FLOAT_MS) {
          const label =
            e.hullDamage > 0
              ? `−${e.hullDamage}`
              : e.absorbed > 0
                ? `−${e.absorbed}`
                : '0'
          const tint = e.hullDamage > 0 ? RED : INK
          this.showFloat(
            floatIndex++,
            label,
            tint,
            aim.x,
            aim.y - (age / FLOAT_MS) * 40,
            1 - age / FLOAT_MS,
            e.hullDamage > 0 ? 18 : 14,
          )
        }
      } else if (e.type === 'overheat') {
        const age = t - e.t
        if (age >= 0 && age < HIT_FX_MS) {
          const ship = this.ships![e.target]
          const a = 1 - age / HIT_FX_MS
          fx.ellipse(
            ship.center.x,
            ship.center.y,
            ship.radius.x * 0.9,
            ship.radius.y * 0.9,
          )
          fx.fill({ color: RED, alpha: 0.12 * a })
        }
        if (age >= 0 && age < FLOAT_MS) {
          const ship = this.ships![e.target]
          this.showFloat(
            floatIndex++,
            `−${e.amount}`,
            RED,
            ship.center.x,
            ship.root.y - 8 - (age / FLOAT_MS) * 30,
            1 - age / FLOAT_MS,
            14,
          )
        }
      }
    })

    // cracks appear on the player hull once the battle is over
    if (t >= durationMs) {
      const ship = this.ships.player
      const data = this.shipsData.player
      const a = Math.min(1, (t - durationMs) / 400)
      for (const k of data.newCracks ?? []) {
        const [cx, cy] = k.split(',').map(Number)
        const lx = ship.mirror ? ship.width - 1 - cx! : cx!
        drawCrack(
          fx,
          ship.root.x + lx * ship.cell,
          ship.root.y + cy! * ship.cell,
          ship.cell,
        )
      }
      fx.stroke({ width: 2, color: RED, alpha: a })
    }

    // destruction
    for (const side of ['player', 'enemy'] as const) {
      const ship = this.ships[side]
      const dead =
        t >= durationMs &&
        (winner === 'draw' ? true : winner !== side) &&
        lastHull(events, side) <= 0
      ship.root.alpha = dead ? Math.max(0.25, 1 - (t - durationMs) / 600) : 1
      const s = shake[side]
      ship.root.pivot.set(
        s ? (noise(t) - 0.5) * s * 2 : 0,
        s ? (noise(t + 3) - 0.5) * s * 2 : 0,
      )
      if (dead) {
        const age = t - durationMs
        if (age < EXPLOSION_MS) {
          const a = 1 - age / EXPLOSION_MS
          for (let k = 0; k < 28; k++) {
            const ang =
              noise(k * 5 + (side === 'enemy' ? 100 : 0)) * Math.PI * 2
            const speed = 0.05 + noise(k * 9) * 0.18
            const r = age * speed
            const x = ship.center.x + Math.cos(ang) * r
            const y = ship.center.y + Math.sin(ang) * r
            fx.moveTo(x, y).lineTo(x + Math.cos(ang) * 5, y + Math.sin(ang) * 5)
          }
          fx.stroke({ width: 2, color: RED, alpha: a })
          fx.circle(ship.center.x, ship.center.y, 10 + age * 0.12).stroke({
            width: 2,
            color: INK,
            alpha: a * 0.8,
          })
        }
      }
    }
  }

  private showFloat(
    i: number,
    text: string,
    color: number,
    x: number,
    y: number,
    alpha: number,
    size: number,
  ) {
    let f = this.floats[i]
    if (!f) {
      f = new Text({
        text,
        style: {
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: size,
          fontWeight: '600',
          fill: color,
        },
      })
      f.anchor.set(0.5)
      this.floats.push(f)
      this.floatLayer.addChild(f)
    }
    f.text = text
    f.style.fill = color
    f.style.fontSize = size
    f.position.set(x, y)
    f.alpha = alpha
    f.visible = true
  }
}

function lastHull(events: readonly BattleEvent[], side: Side): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!
    if (e.type === 'hit' && e.target === side) return e.hullHp
    if (e.type === 'overheat' && e.target === side) return e.hullHp
  }
  return 1
}

/** Point on the shield ellipse facing the shooter. */
function edgePoint(ship: ShipView, from: { x: number; y: number }) {
  const ang = Math.atan2(from.y - ship.center.y, from.x - ship.center.x)
  return {
    x: ship.center.x + Math.cos(ang) * ship.radius.x,
    y: ship.center.y + Math.sin(ang) * ship.radius.y,
  }
}

/** Blueprint ship: hull contour, faint cell grid, module outlines with hatching. */
function drawShip(
  g: Graphics,
  parent: Container,
  data: SceneShip,
  cell: number,
  gw: number,
  mirror: boolean,
  color: number,
) {
  const lx = (x: number) => (mirror ? gw - 1 - x : x)
  const keys = new Set(data.hull.map((c) => `${c.x},${c.y}`))
  // faint cells
  for (const c of data.hull) g.rect(lx(c.x) * cell, c.y * cell, cell, cell)
  g.stroke({ width: 0.5, color, alpha: 0.18 })
  // hull contour
  for (const c of data.hull) {
    const x = lx(c.x) * cell
    const y = c.y * cell
    const edge = (dx: number, dy: number) =>
      !keys.has(`${c.x + dx},${c.y + dy}`)
    if (edge(0, -1)) g.moveTo(x, y).lineTo(x + cell, y)
    if (edge(0, 1)) g.moveTo(x, y + cell).lineTo(x + cell, y + cell)
    const left = mirror ? edge(1, 0) : edge(-1, 0)
    const right = mirror ? edge(-1, 0) : edge(1, 0)
    if (left) g.moveTo(x, y).lineTo(x, y + cell)
    if (right) g.moveTo(x + cell, y).lineTo(x + cell, y + cell)
  }
  g.stroke({ width: 2, color, alpha: 0.95 })

  const tint = { weapon: 0xff8a66, shield: 0x78cdff, armor: color } as const
  for (const m of data.modules) {
    const cells = placedCells(m)
    const own = new Set(cells.map((c) => `${c.x},${c.y}`))
    for (const c of cells) g.rect(lx(c.x) * cell, c.y * cell, cell, cell)
    g.fill({ color: tint[m.kind], alpha: m.kind === 'armor' ? 0.1 : 0.18 })
    for (const c of cells) {
      const x = lx(c.x) * cell
      const y = c.y * cell
      const edge = (dx: number, dy: number) =>
        !own.has(`${c.x + dx},${c.y + dy}`)
      if (edge(0, -1)) g.moveTo(x, y).lineTo(x + cell, y)
      if (edge(0, 1)) g.moveTo(x, y + cell).lineTo(x + cell, y + cell)
      const left = mirror ? edge(1, 0) : edge(-1, 0)
      const right = mirror ? edge(-1, 0) : edge(1, 0)
      if (left) g.moveTo(x, y).lineTo(x, y + cell)
      if (right) g.moveTo(x + cell, y).lineTo(x + cell, y + cell)
    }
    g.stroke({ width: 1.5, color })

    // Line-art icon, rotated with the module; mirrored ships flip it (see F·R(r) = R(−r)·F).
    const art = moduleArt[m.defId as ModuleId]
    if (!art) continue
    const icon = new Graphics().svg(
      artSvg(m.defId as ModuleId, color === INK ? '#eaf2ff' : '#ffd27a'),
    )
    const rotated = rotateShape(m.shape, m.rotation)
    const bw = Math.max(...rotated.map((c) => c.x)) + 1
    const bh = Math.max(...rotated.map((c) => c.y)) + 1
    const s = cell / 100
    icon.pivot.set(art.w / 2, art.h / 2)
    icon.rotation = ((mirror ? -m.rotation : m.rotation) * Math.PI) / 2
    icon.scale.set(mirror ? -s : s, s)
    const centerX = (m.x + bw / 2) * cell
    icon.position.set(
      mirror ? gw * cell - centerX : centerX,
      (m.y + bh / 2) * cell,
    )
    parent.addChild(icon)
  }

  for (const k of data.cracks ?? []) {
    const [cx, cy] = k.split(',').map(Number)
    drawCrack(g, lx(cx!) * cell, cy! * cell, cell)
  }
  g.stroke({ width: 1.5, color: RED, alpha: 0.8 })
}

function drawCrack(g: Graphics, x: number, y: number, cell: number) {
  const p = (fx: number, fy: number) => [x + fx * cell, y + fy * cell] as const
  g.moveTo(...p(0.15, 0.2))
    .lineTo(...p(0.45, 0.45))
    .lineTo(...p(0.4, 0.6))
    .lineTo(...p(0.85, 0.85))
  g.moveTo(...p(0.45, 0.45)).lineTo(...p(0.75, 0.3))
}
