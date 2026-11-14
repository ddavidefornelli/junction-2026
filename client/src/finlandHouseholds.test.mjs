import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { householdFacts, householdSnapshot } from './finlandHouseholds.ts'

test('2025 household asset shares use the official national asset totals, not household counts', () => {
  assert.equal(householdSnapshot.financialAssets.year, '2025')
  assert.deepEqual([
    householdSnapshot.financialAssets.totalMillionsEur,
    householdSnapshot.financialAssets.cashAndDepositsMillionsEur,
    householdSnapshot.financialAssets.mutualFundsMillionsEur,
  ], [436871, 131302, 54781])
  assert.equal(householdFacts().cashSharePercent, 30.1)
  assert.equal(householdFacts().fundSharePercent, 12.5)
  assert.equal(householdFacts().cashToFundRatio, 2.4)
})

test('2026Q2 national indebtedness ratio change is in percentage points', () => {
  assert.equal(householdSnapshot.debt.quarter, '2026Q2')
  assert.equal(householdSnapshot.debt.ratioPercent, 117.6)
  assert.equal(householdFacts().debtRatioChangePoints, -2.6)
})
