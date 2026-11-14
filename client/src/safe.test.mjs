import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { safeToSpend } from './safe.ts'
import { makeBaskets } from './baskets.ts'

// Months of salary on the 1st, rent on the 2nd, groceries and restaurants; data ends on `end`.
function history({ salary, rent, groceries, fun, start, end = '2026-10-10' }) {
  const all = []
  let balance = start
  const add = (date, amount, transaction_type, category, mcc_code = null) => {
    if (date > end) return
    balance += amount
    all.push({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code })
  }
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add(`${m}-01`, salary, 'salary', 'Salary')
    add(`${m}-02`, -rent, 'housing_payment', 'Housing')
    for (let d = 3; d < 13; d++) {
      add(`${m}-${String(d).padStart(2, '0')}`, -groceries / 10, 'purchase', 'Groceries', '5411')
      add(`${m}-${String(d).padStart(2, '0')}`, -fun / 10, 'purchase', 'Restaurants', '5812')
    }
  }
  return all
}
const safe = (h) => safeToSpend(h, makeBaskets(h))

test('a large balance is not safe to spend: the weekly pace is the limit', () => {
  const s = safe(history({ salary: 3000, rent: 1000, groceries: 400, fun: 400, start: 3000 }))
  assert.equal(s.payday, '2026-11-01')
  assert.equal(s.billsDue, 0) // October rent is paid
  assert.equal(s.limitedBy, 'pace')
  assert.ok(Math.abs(s.week - (3000 - 1000 - 400) * 7 / (365.25 / 12)) < 1)
  assert.ok(s.week < s.balance / 10)
})

test('a full buffer frees the money that would go to it', () => {
  const building = safe(history({ salary: 2200, rent: 1000, groceries: 400, fun: 400, start: 0 }))
  const full = safe(history({ salary: 2200, rent: 1000, groceries: 400, fun: 400, start: 20000 }))
  assert.ok(building.saving > 0)
  assert.equal(full.saving, 0)
  assert.ok(full.week > building.week)
})

test('a balance close to zero is the limit, and never goes below zero', () => {
  const s = safe(history({ salary: 2000, rent: 1200, groceries: 400, fun: 600, start: -1200 }))
  assert.equal(s.limitedBy, 'balance')
  assert.equal(s.week, 0)
})

test('rent not yet paid this cycle is held back', () => {
  const s = safe(history({ salary: 3000, rent: 1000, groceries: 400, fun: 400, start: 3000, end: '2026-10-01' }))
  assert.ok(Math.abs(s.billsDue - 1000) < 50, `billsDue ${s.billsDue}`)
})

test('no salary, no figure', () => {
  const h = history({ salary: 3000, rent: 1000, groceries: 400, fun: 400, start: 3000 }).filter((t) => t.transaction_type !== 'salary')
  assert.equal(safe(h), null)
})
