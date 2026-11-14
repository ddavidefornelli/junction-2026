// What the mortgage application and the customer's own account say together:
// how far a rejected application is from the ones that were approved, what the
// purchase costs on top of the loan, and what the customer can put towards it.
// The figures go into the assistant's summary (assistant.ts), and the AI-written
// next steps on the Loan tab are drawn from that summary (../chat.ts).

import type { Mortgage, Transaction } from './api'

// Medians among the 150 approved applications in the S-Pankki dataset. The data
// has no hard cut-off, so these are a reference point, not the bank's rule.
export const APPROVED_EQUITY_SHARE = 0.15 // equity / property price
export const APPROVED_COLLATERAL_COVER = 0.85 // collateral value / loan

// Illustration only: a 25-year annuity at 3% a year.
const RATE = 0.03
const YEARS = 25

const SAVING_MONTHS = 6 // full months averaged for what the customer sets aside
const SAVINGS = new Set(['Invest Deposit', 'Salary Sweep']) // money moved out of the account to savings
const WITHDRAWALS = new Set(['Invest Withdraw'])

export type MortgageFacts = {
  rejected: boolean
  equityGap: number | null // more equity needed to reach the approved median share; null when there is none
  collateralGap: number | null // more collateral value needed to reach the approved median cover
  repayment: number | null // illustrative monthly repayment
  oneOffCosts: { type: string; amount: number }[] // recorded during the application, biggest first
  existingLoan: number | null
  savedTotal: number // moved to savings and investments over the whole history, net of withdrawals
  monthlySaving: number | null // usual monthly money in minus money spent, counting savings transfers as kept
}

export function mortgageFacts(m: Mortgage, all: Transaction[] | null): MortgageFacts {
  const price = m.final_property_price_eur
  const loan = m.final_requested_loan_eur
  const gap = (target: number | null, have: number | null) =>
    target === null || have === null || target - have <= 0 ? null : target - have
  const rejected = m.final_decision === 'rejected'

  // The latest amount recorded for each kind of expense.
  const latest = new Map<string, number>()
  for (const e of [...m.mortgage_events].sort((a, b) => a.event_timestamp.localeCompare(b.event_timestamp)))
    if (e.event_type === 'expense_recorded' && e.expense_type && e.expense_amount != null)
      latest.set(e.expense_type, Number(e.expense_amount))
  const existingLoan = latest.get('existing_loan') ?? null
  latest.delete('existing_loan') // a debt, not a cost of buying
  const oneOffCosts = [...latest]
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount)

  let savedTotal = 0
  let monthlySaving: number | null = null
  if (all?.length) {
    const months = [...new Set(all.map((tx) => tx.tx_date.slice(0, 7)))].sort()
    const window = new Set(months.slice(0, -1).slice(-SAVING_MONTHS))
    let net = 0
    for (const tx of all) {
      const amount = Number(tx.tx_amount_eur)
      const category = tx.category ?? ''
      if (SAVINGS.has(category) || WITHDRAWALS.has(category)) savedTotal -= amount
      if (window.has(tx.tx_date.slice(0, 7)) && !SAVINGS.has(category) && !WITHDRAWALS.has(category)) net += amount
    }
    if (window.size) monthlySaving = net / window.size
  }

  const r = RATE / 12
  const n = YEARS * 12
  return {
    rejected,
    equityGap: rejected && price !== null ? gap(price * APPROVED_EQUITY_SHARE, m.final_equity_amount_eur) : null,
    collateralGap: rejected && loan !== null ? gap(loan * APPROVED_COLLATERAL_COVER, m.final_collateral_value_eur) : null,
    repayment: loan === null ? null : (loan * r) / (1 - (1 + r) ** -n),
    oneOffCosts,
    existingLoan,
    savedTotal: Math.max(0, savedTotal),
    monthlySaving,
  }
}

const eur = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n)} €`)
const pct = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n * 100)}%`)
const words = (s: string | null) => (s ?? 'unknown').replace(/_/g, ' ')

// The application, as lines for the assistant's summary.
export function mortgageLines(m: Mortgage, f: MortgageFacts): string[] {
  const collateral = m.mortgage_events.filter((e) => e.event_type === 'collateral_valuation' && e.collateral_value != null)
  const asked = m.mortgage_events.some((e) => e.event_type === 'additional_collateral_requested')
  return [
    'Mortgage application:',
    `- Decision: ${words(m.final_decision)}${m.rejection_reason ? ` (reason: ${words(m.rejection_reason)})` : ''}`,
    `- Loan ${eur(m.final_requested_loan_eur)} for a property of ${eur(m.final_property_price_eur)}; equity ${eur(m.final_equity_amount_eur)} (${pct(m.final_property_price_eur ? (m.final_equity_amount_eur ?? 0) / m.final_property_price_eur : null)} of the price); loan to value ${pct(m.final_loan_to_value)}`,
    `- Collateral value ${eur(m.final_collateral_value_eur)} (${pct(m.final_requested_loan_eur ? (m.final_collateral_value_eur ?? 0) / m.final_requested_loan_eur : null)} of the loan)${collateral.length ? `; valuations: ${collateral.map((e) => `${words(e.collateral_type)} ${eur(e.collateral_value)} (${words(e.collateral_status)})`).join(', ')}` : ''}${asked ? '; the bank asked for more collateral' : ''}`,
    `- Required monthly income: ${eur(m.required_monthly_income_eur)}`,
    ...(f.rejected
      ? [
          `- Approved applications at S-Pankki typically put in equity of ${pct(APPROVED_EQUITY_SHARE)} of the price and collateral of ${pct(APPROVED_COLLATERAL_COVER)} of the loan (a reference, not a fixed rule).`,
          `- To reach that: ${f.equityGap ? `about ${eur(f.equityGap)} more equity` : 'equity already at or above it'}; ${f.collateralGap ? `about ${eur(f.collateralGap)} more collateral value (or a loan smaller by about ${eur(f.collateralGap / APPROVED_COLLATERAL_COVER)})` : 'collateral already at or above it'}`,
        ]
      : []),
    `- Illustrative monthly repayment: about ${eur(f.repayment)} (assumes 3% interest over 25 years; not an offer)`,
    `- One-off costs recorded during the application: ${f.oneOffCosts.length ? f.oneOffCosts.map((c) => `${words(c.type)} ${eur(c.amount)}`).join(', ') : 'none'}`,
    ...(f.existingLoan ? [`- Existing loan recorded: ${eur(f.existingLoan)}`] : []),
    `- Moved to savings and investments over the account history (net of withdrawals): ${eur(f.savedTotal)}`,
    `- Usually left over each month (money in minus spending, savings transfers counted as kept), last ${SAVING_MONTHS} full months: ${eur(f.monthlySaving)}`,
  ]
}

export type MortgageStep = { title: string; text: string; figure: string | null }

// AI-written next steps towards the mortgage, from the assistant's summary (see ../chat.ts).
export async function getMortgageSteps(context: string): Promise<MortgageStep[]> {
  const res = await fetch('/api/mortgage-steps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  })
  if (!res.ok) {
    const error = (await res.json().catch(() => null))?.error
    console.error('[mortgage steps] Request failed', { status: res.status, error })
    throw new Error(error ?? `Request failed (${res.status})`)
  }
  return res.json()
}
