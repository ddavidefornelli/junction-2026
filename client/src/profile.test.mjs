import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { financialProfileTagline } from './profile.ts'

test('one short English tagline per score band, including the preliminary 51-point example', () => {
  assert.deepEqual([0, 20, 51, 60, 100].map(financialProfileTagline), [
    'One step at a time.', "You've got this.", 'Keep going!', 'Looking good!', 'Keep it up!',
  ])
  for (const score of [0, 19, 20, 39, 40, 59, 60, 79, 80, 100]) {
    assert.ok(financialProfileTagline(score).length < 24)
  }
})
