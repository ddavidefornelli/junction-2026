import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { calculateWellness, emptyAnswers, wellnessScores } from './wellness.ts'

const tx = (day, amount, balance) => ({
  tx_date: day, tx_timestamp: `${day}T12:00:00Z`, bank_account_id: 'A',
  tx_amount_eur: amount, balance_after_eur: balance, category: 'Other',
})

test('missing survey or incomplete months do not yield a total', () => {
  const w = calculateWellness([tx('2026-01-15', 100, 100), tx('2026-02-15', -20, 80)])
  assert.equal(w.observedMonths, 0)
  assert.equal(wellnessScores(w, emptyAnswers()).total, null)
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
})
