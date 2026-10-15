/** Projectile timings shared by the Pixi scene and the battle sounds (no Pixi import). */
export const LASER_MS = 160
export const SLUG_FLIGHT_MS = 260
const TRACER_FLIGHT_MS = 140
const ROCKET_FLIGHT_MS = 650

/** Projectile flight time by weapon (engine ids are 'defId#n'). */
export const flightMs = (source: string, damageType: string) =>
  damageType === 'energy'
    ? 0
    : damageType === 'explosive'
      ? ROCKET_FLIGHT_MS
      : source.startsWith('machinegun#')
        ? TRACER_FLIGHT_MS
        : SLUG_FLIGHT_MS
