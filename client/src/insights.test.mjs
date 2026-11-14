import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeInsights } from './insights.ts'
import { makeBaskets } from './baskets.ts'

// Seven months of a salary, rent and restaurants; the last month is left out as unfinished.
function history({ salary, rent, fun, start }) {
  const all = []
  let balance = start
  const add = (date, amount, transaction_type, category, mcc_code = null) => {
    balance += amount
    all.push({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code })
  }
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add(`${m}-01`, salary, 'salary', 'Salary')
    add(`${m}-02`, -rent, 'housing_payment', 'Housing')
    for (let d = 3; d < 13; d++) add(`${m}-${String(d).padStart(2, '0')}`, -fun / 10, 'purchase', 'Restaurants', '5812')
  }
  return all
}
const insights = (score, h) => makeInsights({ score, baskets: makeBaskets(h), benchmark: null, tips: [], all: h })

test('spending more than comes in is shown, month by month', () => {
  const list = insights(30, history({ salary: 1000, rent: 900, fun: 600, start: 9000 }))
  assert.equal(list[0].id, 'overspend')
  assert.equal(list[0].value, 500 * 12)
  assert.ok(list[0].chart.values.every((v) => v === -500))
  assert.ok(!list.some((x) => x.id === 'invest'))
})

test('without three months of spending the buffer is shown, with the balance over time', () => {
  const list = insights(70, history({ salary: 2000, rent: 900, fun: 600, start: 0 }))
  const buffer = list.find((x) => x.id === 'buffer')
  assert.match(buffer.figure, /to go/)
  assert.equal(buffer.chart.kind, 'balance')
  assert.ok(!list.some((x) => x.id === 'invest'))
})

test('a good score with a full buffer is shown what the spare money could do', () => {
  const list = insights(70, history({ salary: 2000, rent: 900, fun: 600, start: 20000 }))
  const invest = list.find((x) => x.id === 'invest')
  assert.equal(invest.chart.kept.length, 11)
  assert.ok(invest.chart.invested[10] > invest.chart.kept[10])
  assert.equal(Math.round(invest.value), Math.round((invest.chart.invested[10] - invest.chart.kept[10]) / 10))
  assert.match(invest.note, /not a forecast or investment advice/)
  // With little else to show, the full buffer is good news worth a card.
  assert.equal(list.find((x) => x.id === 'buffer').title, 'Your buffer is full')
})

test('a low score is not shown investing, even with a full buffer', () => {
  assert.ok(!insights(40, history({ salary: 2000, rent: 900, fun: 600, start: 20000 })).some((x) => x.id === 'invest'))
})

test('a low score with spare money is sent to the profile questions', () => {
  const kept = insights(40, history({ salary: 2000, rent: 900, fun: 600, start: 20000 })).find((x) => x.id === 'kept')
  assert.match(kept.action, /score of 60/)
})

test('four at most, the most valuable first', () => {
  const list = insights(70, history({ salary: 2000, rent: 900, fun: 600, start: 20000 }))
  assert.ok(list.length > 0 && list.length <= 4)
  assert.deepEqual(list.map((x) => x.value), list.map((x) => x.value).sort((a, z) => z - a))
})
