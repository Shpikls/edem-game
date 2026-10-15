import type { RunAction, RunState } from '../../engine/index.ts'
import type { SoundName } from '../sound.ts'

/** Sounds for a shipyard action; a rejected action (state unchanged) buzzes. */
export function actionSounds(
  prev: RunState,
  next: RunState,
  action: RunAction,
): SoundName[] {
  if (next === prev)
    return action.type === 'next' || action.type === 'searchWreck'
      ? []
      : ['error']
  switch (action.type) {
    case 'buy':
      return action.place ? ['buy', 'drop'] : ['buy']
    case 'place':
    case 'unplace':
      return ['drop']
    case 'sell':
      return ['sell']
    case 'reroll':
    case 'adReroll':
      return ['reroll']
    case 'repair':
    case 'repairAll':
      return ['repair']
    case 'fight':
      return ['launch']
    default:
      return []
  }
}
