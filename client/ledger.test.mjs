import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asOfDate, calendar, parseLedger, runTool, toolsFor } from './ledger.ts'

// Balance starts at 1000 and follows the amounts.
let balance = 1000
const row = (when, amount, category, kind = null, flow = 'purchase', basket = null) => [
  `${when}T12:00`, amount, category, kind, flow, basket, (balance = Math.round((balance + amount) * 100) / 100),
]
const ledger = parseLedger([
  row('2026-08-05', -40, 'Transportation', 'Taxi', 'purchase', 'Fun extras'),
  row('2026-08-31', 2000, 'Salary', null, 'income'),
  row('2026-09-01', -700, 'Housing', null, 'bill', 'Must pay every month'),
  row('2026-09-05', -30.5, 'Transportation', 'Taxi', 'purchase', 'Fun extras'),
  row('2026-09-10', -400, 'Invest Deposit', null, 'savings'),
  row('2026-09-18', -12.25, 'Transportation', 'Taxi', 'purchase', 'Fun extras'),
  row('2026-09-20', -60, 'Groceries', 'Supermarket', 'purchase', 'Must pay every month'),
  row('2026-09-27', -45, 'Transportation', 'Taxi', 'purchase', 'Fun extras'),
  row('2026-09-30', -3.3, 'Transportation', 'Public transport', 'purchase', 'Must pay every month'),
])
const TODAY = '2026-11-14'
const ask = (args, name = 'query_transactions') => runTool(ledger, TODAY, name, { title: 'Test', ...args })

test('rows that are not ledger rows are refused', () => {
  assert.equal(parseLedger('x'), null)
  assert.equal(parseLedger([['2026-02-30T10:00', -1, 'A', null, 'purchase', null, 0]]), null)
  assert.equal(parseLedger([['2026-02-03T10:00', -1, 'A', null, 'theft', null, 0]]), null)
  assert.equal(ledger.length, 9)
})

test('stale data: relative periods end on the day of the latest transaction', () => {
  assert.equal(asOfDate(ledger, TODAY), '2026-09-30')
  assert.equal(asOfDate(ledger, '2026-10-03'), '2026-10-03')
  const text = calendar(ledger, TODAY)
  assert.match(text, /data ends on 2026-09-30 .*"this month" is 2026-09, "last month" is 2026-08/)
  assert.doesNotMatch(text, /2026-11-14/) // the calendar date would only pull "last month" towards October
  assert.match(text, /last 14 days \(two weeks\): 2026-09-17 to 2026-09-30/)
  assert.match(text, /last month: 2026-08-01 to 2026-08-31/)
  assert.match(text, /last week: 2026-09-21 to 2026-09-27/)
})

test('taxis in the last two weeks: exact total, count and the two weeks before', () => {
  const { result, lookup } = ask({ kinds: ['taxi'], from: '2026-09-17', to: '2026-09-30' })
  assert.equal(result.total, 57.25)
  assert.equal(result.count, 2)
  assert.deepEqual(result.period, { from: '2026-09-17', to: '2026-09-30', days: 14 })
  assert.deepEqual(result.previous_period, { from: '2026-09-03', to: '2026-09-16', total: 30.5, count: 1 })
  assert.equal(lookup.total, 57.25)
  assert.deepEqual(lookup.rows[0], { label: 'Taxi', amount: 45, date: '2026-09-27' })
})

test('spending leaves out income and savings; other flows are asked for by name', () => {
  assert.equal(ask({ from: '2026-09-01' }).result.total, 851.05)
  assert.equal(ask({ what: 'purchases', from: '2026-09-01' }).result.total, 151.05) // without the rent
  assert.equal(ask({ what: 'bills' }).result.total, 700)
  assert.equal(ask({ what: 'income' }).result.total, 2000)
  assert.equal(ask({ what: 'savings' }).result.total, 400)
  const all = ask({ what: 'all' }).result
  assert.deepEqual([all.money_in, all.money_out, all.total], [2000, 1291.05, 708.95])
})

test('groups: months include empty ones, categories come biggest first', () => {
  const months = ask({ kinds: ['Taxi'], group_by: 'month', from: '2026-08-01' }).result
  assert.deepEqual(months.groups.map((g) => [g.label, g.total, g.count]), [['2026-08', 40, 1], ['2026-09', 87.75, 3]])
  assert.equal(months.average_per_group, 63.88)
  const kinds = ask({ group_by: 'kind', from: '2026-09-01' }).result.groups
  assert.deepEqual(kinds.map((g) => g.label), ['Housing', 'Taxi', 'Supermarket', 'Public transport'])
  assert.equal(ask({ group_by: 'day' }).result.groups.length, 57) // every day from the first transaction to the last
})

test('list returns the transactions asked for, in the order asked for', () => {
  const { transactions } = ask({ list: 2, sort: 'largest', from: '2026-09-01' }).result
  assert.deepEqual(transactions.map((t) => t.amount), [-700, -60])
  assert.equal(transactions[0].day, '1 September 2026')
  assert.equal(ask({ weekdays: ['Sun'], min_amount: 40 }).result.count, 2)
})

test('a bad request comes back as an error to correct', () => {
  assert.match(ask({ kinds: ['Coffee'] }).result.error, /Unknown value "Coffee".*Taxi/)
  assert.match(ask({ from: '2026-11-01', to: '2026-11-14' }).result.error, /2026-08-05 to 2026-09-30/)
  assert.match(ask({ from: 'last week' }).result.error, /must be a date/)
  assert.match(ask({ what: 'spending', categories: ['Invest Deposit'] }).result.error, /set to "savings"/)
  assert.equal(ask({ kinds: ['Taxi'], from: '2026-08-10', to: '2026-08-20' }).result.count, 0) // truly nothing: an answer, not an error
})

test('balance history: start, end, extremes and month ends', () => {
  const { result } = ask({ from: '2026-09-01' }, 'balance_history')
  assert.equal(result.start_balance, 2960)
  assert.equal(result.end_balance, 1708.95)
  assert.deepEqual(result.lowest, { balance: 1708.95, date: '2026-09-30' })
  assert.deepEqual(result.highest, { balance: 2960, date: '2026-09-01' })
  const whole = ask({}, 'balance_history').result
  assert.equal(whole.start_balance, 1000)
  assert.deepEqual(ask({ from: '2026-09-05', to: '2026-09-05' }, 'balance_history').lookup.rows.map((r) => r.label), ['Start', 'End'])
  assert.deepEqual(whole.month_end_balances, [{ month: '2026-08', balance: 2960 }, { month: '2026-09', balance: 1708.95 }])
})

test('the tools offer only the values this customer has', () => {
  const [query] = toolsFor(ledger)
  assert.deepEqual(query.function.parameters.properties.kinds.items.enum, ['Public transport', 'Supermarket', 'Taxi'])
})
