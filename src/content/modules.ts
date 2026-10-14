import { parseShape, type ModuleStats, type Shape } from '../engine/index.ts'

export interface ModuleDef {
  id: string
  name: string
  /** Short drawing label, e.g. 'ЛЗ' → 'ЛЗ-1' on the hull grid. */
  code: string
  shape: Shape
  stats: ModuleStats
}

// Placeholder balance for the sandbox; real numbers come with playtesting.
export const modules = {
  laser: {
    id: 'laser',
    code: 'ЛЗ',
    name: 'Лазер',
    shape: parseShape(['##']),
    stats: {
      kind: 'weapon',
      damage: 6,
      damageType: 'energy',
      cooldownMs: 1_200,
    },
  },
  railgun: {
    id: 'railgun',
    code: 'РС',
    name: 'Рельсотрон',
    shape: parseShape(['###']),
    stats: {
      kind: 'weapon',
      damage: 14,
      damageType: 'kinetic',
      cooldownMs: 2_500,
    },
  },
  shield: {
    id: 'shield',
    code: 'ЩТ',
    name: 'Щит',
    shape: parseShape(['##', '##']),
    stats: {
      kind: 'shield',
      capacity: 30,
      regenAmount: 3,
      regenIntervalMs: 1_000,
    },
  },
  armor: {
    id: 'armor',
    code: 'БР',
    name: 'Броня',
    shape: parseShape(['#', '#']),
    stats: { kind: 'armor', armor: 3 },
  },
} satisfies Record<string, ModuleDef>

export type ModuleId = keyof typeof modules

export const moduleList: readonly ModuleDef[] = Object.values(modules)
