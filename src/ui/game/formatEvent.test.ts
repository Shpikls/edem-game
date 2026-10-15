import { expect, test } from 'vitest'
import { formatEvent, summarizeBySource } from './formatEvent.ts'

test('formats a hit with only the non-zero damage parts', () => {
  expect(
    formatEvent({
      t: 1_000,
      type: 'hit',
      side: 'player',
      source: 'railgun#1',
      target: 'enemy',
      amount: 10,
      damageType: 'kinetic',
      absorbed: 5,
      blocked: 0,
      hullDamage: 5,
      shieldHp: 20,
      hullHp: 95,
    }),
  ).toBe(
    'Игрок · railgun#1 → 10 кинет.: щит −5, корпус −5 | у цели щит 20, корпус 95',
  )
})

test('summarizes damage per weapon', () => {
  const hit = {
    type: 'hit',
    side: 'player',
    source: 'laser#1',
    target: 'enemy',
    amount: 6,
    damageType: 'energy',
    absorbed: 6,
    blocked: 0,
    hullDamage: 0,
    shieldHp: 0,
    hullHp: 100,
  } as const
  expect(
    summarizeBySource([
      { ...hit, t: 1 },
      { ...hit, t: 2, absorbed: 0, hullDamage: 6 },
    ]),
  ).toEqual([
    { side: 'player', source: 'laser#1', shots: 2, damage: 12, hullDamage: 6 },
  ])
})
