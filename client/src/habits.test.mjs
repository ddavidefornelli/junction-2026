import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { habitLines, makeHabits } from './habits.ts'

const tx = (when, amount, type, category = null, mcc = null) => ({
  tx_date: when.slice(0, 10), tx_timestamp: when, bank_account_id: 'A', balance_after_eur: 0,
  tx_amount_eur: amount, transaction_type: type, category, mcc_code: mcc, merchant_id: null,
})

test('fun extras are split by time of day, weekend, payday and size', () => {
  const txs = [
    tx('2026-08-01T09:00:00', 2000, 'salary'),
    tx('2026-08-01T23:30:00', -40, 'purchase', 'Entertainment'), // Saturday, late night, payday
    tx('2026-08-02T01:15:00', -10, 'purchase', 'Restaurants', '5812'), // late night (after midnight), small
    tx('2026-08-12T14:00:00', -50, 'purchase', 'Lifestyle'), // afternoon
    tx('2026-08-12T15:00:00', -300, 'purchase', 'Groceries'), // a need: not counted
    tx('2026-09-01T10:00:00', -5, 'purchase', 'Lifestyle'), // current month: not counted
  ]
  const h = makeHabits(txs)
  assert.equal(h.months, 1)
  assert.equal(h.total, 100)
  const night = h.bands.find((b) => b.name === 'late night')
  assert.equal(night.share, 0.5)
  assert.equal(night.count, 2)
  assert.equal(h.weekendShare, 0.5)
  assert.equal(h.payday.share, 0.5)
  assert.equal(h.payday.even, 4 / 31)
  assert.deepEqual(h.small, { perMonth: 10, count: 1 })
  assert.ok(habitLines(h).some((l) => l.startsWith('- late night (22–5')))
})

test('no fun extras, no habits', () => {
  assert.equal(makeHabits([tx('2026-08-01T09:00:00', 2000, 'salary'), tx('2026-09-01T09:00:00', 2000, 'salary')]), null)
})
