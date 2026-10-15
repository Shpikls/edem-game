import { describe, expect, test } from 'vitest'
import { runContext } from '../../content/run.ts'
import { createRun, type RunState } from '../../engine/index.ts'
import { currentStep, STEPS } from './tutorialSteps.ts'

const yard = { inBattle: false, salvage: false }
const on = (done: string[] = []) => ({ on: true, done })
const run = (patch: Partial<RunState> = {}): RunState => ({
  ...createRun(runContext, 1),
  ...patch,
})
const gun = { uid: 'g', defId: 'laser', x: 2, y: 2, rotation: 0 as const }

describe('tutorial steps', () => {
  test('a new run starts by buying a weapon, then fighting', () => {
    expect(currentStep(on(), run(), yard)?.id).toBe('buy')
    expect(currentStep(on(['buy']), run({ placed: [gun] }), yard)?.id).toBe(
      'fight',
    )
  })

  test('the wreck, then placing finds from the bench', () => {
    expect(
      currentStep(on(['buy', 'fight']), run({ round: 2 }), {
        inBattle: false,
        salvage: true,
      })?.id,
    ).toBe('salvage')
    const found = run({
      round: 2,
      station: false,
      placed: [gun],
      bench: [{ uid: 'b', defId: 'armor' }],
      lastBattle: null,
    })
    expect(currentStep(on(['buy', 'fight', 'salvage']), found, yard)?.id).toBe(
      'place',
    )
  })

  test('off or finished: nothing to show', () => {
    expect(currentStep({ on: false, done: [] }, run(), yard)).toBeUndefined()
    expect(currentStep(on(STEPS.map((s) => s.id)), run(), yard)).toBeUndefined()
  })

  test('placing is not counted before the wreck is searched', () => {
    const place = STEPS.find((s) => s.id === 'place')!
    const beforeSearch = run({ round: 2, bench: [], salvage: [] })
    expect(
      place.doneWhen?.(beforeSearch, { inBattle: false, salvage: true }),
    ).toBe(false)
    expect(place.doneWhen?.(beforeSearch, yard)).toBe(true)
  })

  test('steps complete when the player does the thing', () => {
    const buy = STEPS.find((s) => s.id === 'buy')!
    expect(buy.doneWhen?.(run(), yard)).toBe(false)
    expect(buy.doneWhen?.(run({ placed: [gun] }), yard)).toBe(true)
  })
})
