import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeStatus } from './status.ts'
import { makeBaskets } from './baskets.ts'

const tx = (date, amount, transaction_type, category, balance) =>
  ({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code: '5812' })

// Three full months of `salary` in and 1 000 € out, ending on `balance`.
function status(salary, balance, score = 50) {
  const all = []
  for (const m of ['04', '05', '06'])
    all.push(tx(`2026-${m}-01`, salary, 'salary', 'Salary', balance), tx(`2026-${m}-02`, -1000, 'purchase', 'Restaurants', balance))
  all.push(tx('2026-07-01', salary, 'salary', 'Salary', balance))
  return makeStatus({ score, baskets: makeBaskets(all), all })
}

test('more out than in is rescue mode, with how long the money lasts', () => {
  const s = status(900, 500)
  assert.equal(s.mode, 'rescue')
  assert.match(s.why, /100[\s ]€ more than you get/)
  assert.match(s.caption, /empty in 5 months/)
  assert.equal(s.order[0], 'future')
})

test('a shortfall of a few euros is not a rescue', () => {
  assert.equal(status(990, 500).mode, 'build')
})

test('a balance below zero is rescue mode even when money is kept', () => {
  assert.equal(status(1200, -50).mode, 'rescue')
})

test('under three months saved is buffer mode, with progress towards it', () => {
  const s = status(1200, 1500)
  assert.equal(s.mode, 'build')
  assert.equal(s.figure, '1.5 of 3 months')
  assert.equal(s.progress, 0.5)
  assert.match(s.caption, /8 months with your plan/) // 1 500 € to go at 200 € a month
  assert.equal(s.order[0], 'challenge')
})

test('with the buffer in place it is growth mode: the money above it', () => {
  const s = status(1200, 5000)
  assert.equal(s.mode, 'grow')
  assert.match(s.figure, /^2[\s ]000[\s ]€$/)
  assert.match(s.starters[0], /investing/)
})

test('a high score and twice the buffer is cruise mode, with fewer cards', () => {
  const s = status(1200, 7000, 85)
  assert.deepEqual([s.mode, s.figure, s.shown], ['cruise', '7 months', 2])
  assert.equal(status(1200, 7000, 70).mode, 'grow')
})

test('each mode has its own colour and questions', () => {
  const all = [status(900, 500), status(1200, 1500), status(1200, 5000), status(1200, 7000, 85)]
  assert.equal(new Set(all.map((s) => s.accent)).size, 4)
  assert.equal(new Set(all.map((s) => s.starters[0])).size, 4)
})

test('without history the app is in its starting mode', () => {
  assert.equal(makeStatus({ score: null, baskets: null, all: null }).mode, 'start')
  assert.equal(makeStatus({ score: 50, baskets: null, all: [] }).mode, 'start')
})
