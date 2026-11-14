import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { basketOf, leaks, makeBaskets } from './baskets.ts'

const tx = (day, amount, type, category = null, mcc = null) => ({
  tx_date: day, tx_timestamp: `${day}T12:00:00Z`, bank_account_id: 'A', balance_after_eur: 0,
  tx_amount_eur: amount, transaction_type: type, category, mcc_code: mcc, merchant_id: null,
})

test('each kind of payment lands in its basket', () => {
  const at = (...a) => basketOf(tx('2026-01-01', ...a))
  assert.deepEqual(at(-500, 'housing_payment', 'Housing'), { basket: 'fixed', line: 'Housing' })
  assert.deepEqual(at(-40, 'utilities_payment', 'Utilities'), { basket: 'fixed', line: 'Utilities' })
  assert.equal(at(-60, 'purchase', 'Groceries', '5411').basket, 'fixed')
  assert.deepEqual(at(-60, 'purchase', 'Groceries', '5499'), { basket: 'everyday', line: 'Convenience stores' })
  assert.equal(at(-30, 'purchase', 'Transportation', '4111').basket, 'fixed')
  assert.deepEqual(at(-30, 'purchase', 'Transportation', '4121'), { basket: 'everyday', line: 'Taxis' })
  assert.equal(at(-90, 'purchase', 'Health', '8021').basket, 'irregular')
  assert.equal(at(-900, 'purchase', 'Home & Tech', '5732').basket, 'irregular')
  assert.deepEqual(at(-20, 'purchase', 'Restaurants', '5814'), { basket: 'everyday', line: 'Fast food' })
  assert.equal(at(-800, 'purchase', 'Travel', '7011').basket, 'everyday')
})

test('income, savings and transfers are not spending', () => {
  assert.equal(basketOf(tx('2026-01-01', 2500, 'salary', 'Salary')), undefined)
  assert.equal(basketOf(tx('2026-01-01', -400, 'investment_deposit', 'Invest Deposit')), undefined)
  assert.equal(basketOf(tx('2026-01-01', -2500, 'salary_sweep', 'Salary Sweep')), undefined)
  assert.equal(basketOf(tx('2026-01-01', 25, 'purchase', 'Lifestyle')), undefined) // a refund
})

test('averages cover full months only, empty months included', () => {
  const b = makeBaskets([
    tx('2026-01-05', 2000, 'salary', 'Salary'),
    tx('2026-01-08', -600, 'housing_payment', 'Housing'),
    tx('2026-01-20', -300, 'purchase', 'Health', '8011'),
    // February: nothing at all
    tx('2026-03-08', -600, 'housing_payment', 'Housing'),
    tx('2026-03-09', -30, 'purchase', 'Restaurants', '5812'),
    tx('2026-03-10', -30, 'purchase', 'Restaurants', '5812'),
    tx('2026-04-02', -999, 'purchase', 'Travel', '4511'), // current month: left out
  ])
  assert.deepEqual(b.months, ['2026-01', '2026-02', '2026-03'])
  assert.equal(b.baskets.fixed.monthly, 400)
  assert.deepEqual(b.baskets.irregular.byMonth, [300, 0, 0])
  assert.deepEqual(b.peak, { month: '2026-01', amount: 300 })
  assert.equal(b.baskets.everyday.monthly, 20)
  assert.equal(b.spending, 520)
  assert.equal(b.income, 2000 / 3)
  assert.deepEqual(leaks(b), [{ name: 'Restaurants', monthly: 20, purchases: 2 / 3 }])
  const shares = Object.values(b.baskets).reduce((a, x) => a + x.share, 0)
  assert.ok(Math.abs(shares - 1) < 1e-9)
})

test('no full month, no baskets', () => {
  assert.equal(makeBaskets([tx('2026-04-02', -10, 'purchase', 'Restaurants')]), null)
  assert.equal(makeBaskets([]), null)
})
