import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeOffers, plan, progress } from './challenges.ts'
import { makeBaskets } from './baskets.ts'

const tx = (date, amount, transaction_type, category, mcc_code = null, balance = 1000) =>
  ({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code })

// Three months with 10 € at a restaurant every day (about 304 € a month), then whatever `after` adds.
function history(after = []) {
  const all = []
  for (let d = Date.UTC(2026, 3, 1); d < Date.UTC(2026, 6, 1); d += 86_400_000)
    all.push(tx(new Date(d).toISOString().slice(0, 10), -10, 'purchase', 'Restaurants', '5812'))
  return [...all, ...after]
}
const base = history([tx('2026-07-01', 2000, 'salary', 'Salary')])
const save = makeOffers({ baskets: makeBaskets(base), tips: [], all: base }).find((o) => o.kind === 'save')

test('the customer is offered challenges that fit their spending', () => {
  const kinds = makeOffers({ baskets: makeBaskets(base), tips: [], all: base }).map((o) => o.kind)
  assert.deepEqual(kinds, ['save', 'nospend'])
})

test('planning sets the goal and the weekly limit', () => {
  const c = plan(save, 100, 0.5, '2026-07-01')
  assert.equal(c.target, 500)
  assert.match(c.title, /^100 days, 500/)
  assert.match(c.rule, /at most 35[\s ]€ a week/)
})

test('on the first day nothing is spent and it is on track', () => {
  const p = progress(plan(save, 100, 0.5, '2026-07-01'), base)
  assert.deepEqual([p.day, p.state, p.unit], [1, 'on', 'eur'])
})

test('spending under the limit saves money; over it falls behind', () => {
  const c = plan(save, 100, 0.5, '2026-07-01')
  const good = progress(c, history([tx('2026-07-01', 2000, 'salary', 'Salary'), tx('2026-07-10', -20, 'purchase', 'Restaurants', '5812')]))
  assert.deepEqual([good.day, good.state, Math.round(good.done)], [10, 'on', 80])
  const bad = progress(c, history([tx('2026-07-02', -90, 'purchase', 'Restaurants', '5812'), tx('2026-07-10', -5, 'purchase', 'Groceries', '5411')]))
  assert.equal(bad.state, 'behind')
  assert.match(bad.next, /over your limit/)
})

test('the challenge ends on its last day, won or missed', () => {
  const c = plan(save, 30, 0.5, '2026-07-01')
  assert.equal(progress(c, history([tx('2026-07-30', -50, 'purchase', 'Restaurants', '5812')])).state, 'won')
  assert.equal(progress(c, history([tx('2026-07-30', -250, 'purchase', 'Restaurants', '5812')])).state, 'missed')
})

test('zero-euro days are counted one by one', () => {
  const offer = makeOffers({ baskets: makeBaskets(base), tips: [], all: base }).find((o) => o.kind === 'nospend')
  const c = plan(offer, 14, 3 / 7, '2026-07-01')
  assert.equal(c.target, 6)
  const p = progress(c, history([tx('2026-07-02', -10, 'purchase', 'Restaurants', '5812'), tx('2026-07-05', -30, 'purchase', 'Groceries', '5411')]))
  assert.deepEqual(p.marks, [true, false, true, true, true])
  assert.equal(p.done, 4)
})
