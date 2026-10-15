import { describe, expect, test } from 'vitest'
import { runContext } from '../../content/run.ts'
import { createRun, type RunState } from '../../engine/index.ts'
import { armedWeapons, rerollNeedsConfirm } from './readiness.ts'

const run = (patch: Partial<RunState> = {}): RunState => ({
  ...createRun(runContext, 1),
  ...patch,
})
const gun = { uid: 'g', defId: 'machinegun', x: 2, y: 2, rotation: 0 as const }

describe('readiness', () => {
  test('an empty or unarmed ship has no weapons', () => {
    expect(armedWeapons(run())).toBe(0)
    expect(
      armedWeapons(run({ placed: [{ ...gun, uid: 'a', defId: 'armor' }] })),
    ).toBe(0)
    expect(armedWeapons(run({ placed: [gun] }))).toBe(1)
  })

  test('a weapon on a crack does not count', () => {
    expect(armedWeapons(run({ placed: [gun], cracks: ['2,2'] }))).toBe(0)
  })

  test('reroll asks again only when it leaves an unarmed ship broke', () => {
    expect(rerollNeedsConfirm(run({ gold: 6 }))).toBe(false)
    expect(rerollNeedsConfirm(run({ gold: 2 }))).toBe(true)
    expect(rerollNeedsConfirm(run({ gold: 2, placed: [gun] }))).toBe(false)
    expect(
      rerollNeedsConfirm(
        run({ gold: 2, bench: [{ uid: 'b', defId: 'laser' }] }),
      ),
    ).toBe(false)
    expect(rerollNeedsConfirm(run({ gold: 1, freeRerolls: 1 }))).toBe(false)
  })
})
