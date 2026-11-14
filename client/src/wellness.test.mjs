import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculateWellness, emptyAnswers, visibleWellnessScore, wellnessScores } from './wellness.ts'

const tx = (day, amount, balance) => ({
  tx_date: day, tx_timestamp: `${day}T12:00:00Z`, bank_account_id: 'A',
  tx_amount_eur: amount, balance_after_eur: balance, category: 'Other',
})

test('missing survey or incomplete months do not yield a total', () => {
  const w = calculateWellness([tx('2026-01-15', 100, 100), tx('2026-02-15', -20, 80)])
  assert.equal(w.observedMonths, 0)
  assert.equal(wellnessScores(w, emptyAnswers()).total, null)
  assert.deepEqual(visibleWellnessScore(w, emptyAnswers()), { value: 100, provisional: true })
})

test('months without activity count as non-saving months', () => {
  const w = calculateWellness([tx('2026-01-01', 100, 100), tx('2026-04-30', -20, 80)])
  assert.equal(w.observedMonths, 4)
  assert.equal(w.savingMonths, 1)
})

test('four weighted dimensions sum to 100 when all inputs are available', () => {
  const w = {
    savingsRate: 0.2, outgoing: 100, days: 30, averageBalance: 300,
    negativeDays: 0, observedMonths: 2, savingMonths: 2,
  }
  const answers = {
    control: 4, worry: 0, confidence: 4,
    inflation: true, compoundInterest: true, diversification: true,
    budget: true, plan: true,
  }
  assert.deepEqual(wellnessScores(w, answers), {
    resilience: 35, perception: 25, knowledge: 20, behaviors: 20, total: 100,
  })
  assert.equal(wellnessScores({ ...w, savingsRate: null }, answers).total, null)
  assert.equal(wellnessScores(w, { ...answers, budget: null }).total, null)
  assert.deepEqual(visibleWellnessScore(w, emptyAnswers()), { value: 100, provisional: true })
  assert.deepEqual(visibleWellnessScore(w, answers), { value: 100, provisional: false })
  assert.deepEqual(visibleWellnessScore({ ...w, savingsRate: 0.1, averageBalance: 0 }, emptyAnswers()), { value: 37, provisional: true })
  assert.deepEqual(visibleWellnessScore({ ...w, savingsRate: null }, answers), { value: null, provisional: false })
  assert.deepEqual(visibleWellnessScore({ ...w, outgoing: 0 }, emptyAnswers()), { value: null, provisional: false })
})

// Two years of a salary and rent, with fun extras and, optionally, a monthly investment.
function account({ invest = 0, fun = 100, start = 2000 } = {}) {
  const all = []
  let balance = start
  const add = (date, amount, transaction_type, category, mcc_code = null) => {
    balance += amount
    all.push({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code })
  }
  for (let m = 0; m < 12; m++) {
    const month = `2026-${String(m + 1).padStart(2, '0')}`
    add(`${month}-01`, 2000, 'salary', 'Salary')
    add(`${month}-02`, -1000, 'housing_payment', 'Housing')
    if (invest) add(`${month}-03`, -invest, 'investment_deposit', 'Invest Deposit')
    add(`${month}-15`, -fun, 'purchase', 'Restaurants', '5812')
    add(`${month}-${new Date(Date.UTC(2026, m + 1, 0)).getUTCDate()}`, -400, 'purchase', 'Groceries', '5411')
  }
  return all
}

test('every dimension is scored from the account alone, the same way every time', () => {
  const w = calculateWellness(account({ invest: 200 }))
  const scores = wellnessScores(w, emptyAnswers())
  assert.deepEqual(scores, wellnessScores(calculateWellness(account({ invest: 200 })), emptyAnswers()))
  for (const part of ['resilience', 'perception', 'knowledge', 'behaviors']) assert.equal(typeof scores[part], 'number')
  assert.equal(scores.total, scores.resilience + scores.perception + scores.knowledge + scores.behaviors)
  assert.equal(visibleWellnessScore(w, emptyAnswers()).provisional, false)
})

test('steady spending, a covered account and a rising balance give full perception', () => {
  const w = calculateWellness(account())
  assert.deepEqual([w.signals.steady, w.signals.covered, w.signals.trend], [1, 1, 1])
  assert.equal(wellnessScores(w, emptyAnswers()).perception, 25)
})

test('investing every month scores knowledge and planning; not investing does not', () => {
  const investor = calculateWellness(account({ invest: 200 }))
  const saver = calculateWellness(account())
  assert.equal(investor.signals.invested, 1)
  assert.equal(saver.signals.setAside, 0)
  assert.ok(wellnessScores(investor, emptyAnswers()).knowledge > wellnessScores(saver, emptyAnswers()).knowledge)
  assert.ok(wellnessScores(investor, emptyAnswers()).behaviors > wellnessScores(saver, emptyAnswers()).behaviors)
})

test('the customer’s own answers replace the estimate for that part', () => {
  const w = calculateWellness(account())
  const answers = { ...emptyAnswers(), control: 0, worry: 4, confidence: 0 }
  assert.equal(wellnessScores(w, answers).perception, 0)
  assert.equal(wellnessScores(w, { ...emptyAnswers(), control: 0 }).perception, 25)
})
