import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ageGroup, CPI_2022_TO_2025, gapWords, makeBenchmark } from './benchmarks.ts'

const tx = (day, amount, type, category = null, mcc = null) => ({
  tx_date: day, tx_timestamp: `${day}T12:00:00Z`, bank_account_id: 'A', balance_after_eur: 0,
  tx_amount_eur: amount, transaction_type: type, category, mcc_code: mcc, merchant_id: null,
})

test('ages map to the survey groups', () => {
  assert.equal(ageGroup(null), 'all')
  assert.equal(ageGroup(16), 'all')
  assert.equal(ageGroup(17), '17–24')
  assert.equal(ageGroup(25), '25–34')
  assert.equal(ageGroup(34), '25–34')
  assert.equal(ageGroup(64), '55–64')
  assert.equal(ageGroup(84), '75–84')
  assert.equal(ageGroup(91), '85+')
})

test('averages spending over the months and compares it at 2025 prices', () => {
  const all = [
    tx('2026-01-03', -200, 'purchase', 'Restaurants', '5812'),
    tx('2026-02-03', -100, 'purchase', 'Restaurants', '5812'),
    tx('2026-02-04', -900, 'housing_payment', 'Housing'), // not compared
    tx('2026-02-05', 2500, 'salary', null), // not spending
    tx('2026-03-01', -999, 'purchase', 'Restaurants', '5812'), // outside the window
  ]
  const b = makeBenchmark(all, ['2026-01', '2026-02'], 30)
  assert.equal(b.group, '25–34')
  const r = b.lines.find((l) => l.category === 'Restaurants')
  assert.equal(r.you, 150)
  assert.ok(Math.abs(r.typical - 112 * CPI_2022_TO_2025) < 1e-9)
  assert.ok(!b.lines.some((l) => l.category === 'Housing'))
})

test('gaps read in plain words', () => {
  assert.equal(gapWords(1.05), 'about the same')
  assert.equal(gapWords(1.38), '38% more')
  assert.equal(gapWords(0.8), '20% less')
  assert.equal(gapWords(2.46), '2.5× as much')
})
