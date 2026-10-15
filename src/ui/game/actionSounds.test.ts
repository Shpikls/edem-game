import { describe, expect, test } from 'vitest'
import { runContext } from '../../content/run.ts'
import { createRun, reduceRun, type RunAction } from '../../engine/index.ts'
import { actionSounds } from './actionSounds.ts'

const start = () => createRun(runContext, 1)
const sounds = (action: RunAction, s = start()) =>
  actionSounds(s, reduceRun(runContext, s, action), action)

describe('actionSounds', () => {
  test('buying to the bench clinks; buying onto the hull also drops', () => {
    expect(sounds({ type: 'buy', slot: 0 })).toEqual(['buy'])
    const placed = sounds({
      type: 'buy',
      slot: 0,
      place: { x: 2, y: 2, rotation: 0 },
    })
    expect(placed).toEqual(['buy', 'drop'])
  })

  test('a rejected action buzzes', () => {
    const broke = { ...start(), gold: 0 }
    expect(sounds({ type: 'buy', slot: 0 }, broke)).toEqual(['error'])
    expect(sounds({ type: 'sell', uid: 'nope' })).toEqual(['error'])
  })

  test('no-op transitions stay silent', () => {
    expect(sounds({ type: 'next' })).toEqual([])
    expect(sounds({ type: 'searchWreck' })).toEqual([])
  })

  test('selling, rerolling and launching', () => {
    let s = start()
    s = reduceRun(runContext, s, { type: 'buy', slot: 0 })
    const uid = s.bench[0]!.uid
    expect(sounds({ type: 'sell', uid }, s)).toEqual(['sell'])
    expect(sounds({ type: 'reroll' }, { ...s, gold: 99 })).toEqual(['reroll'])
    expect(sounds({ type: 'fight' }, s)).toEqual(['launch'])
  })
})
