import { parseShape } from '../engine/index.ts'
import type { ModuleId } from './modules.ts'

export const frigate = {
  name: 'Фрегат',
  hullHp: 100,
  hull: parseShape([
    '..##..',
    '.####.',
    '######',
    '######',
    '.####.',
    '..##..',
  ]),
}

export interface SandboxShipPreset {
  hullHp: number
  modules: ModuleId[]
}

export const sandboxPresets: Record<'player' | 'enemy', SandboxShipPreset> = {
  player: { hullHp: 100, modules: ['laser', 'laser', 'shield'] },
  enemy: { hullHp: 100, modules: ['railgun', 'armor'] },
}
