// Every euro spent falls into one of three baskets, the way S-Bank teaches it:
//   1. fixed: mandatory and regular (rent, utilities, groceries, getting to work);
//   2. irregular: mandatory but irregular (health care, a broken appliance);
//   3. everyday: the spending that slips through your fingers (eating out, fun, shopping, taxis).
//
// The dataset has no merchant names and its merchant ids carry no signal (see
// docs/spending-insights.md), so a purchase is placed by its transaction type,
// category and MCC alone. Money moved to savings, investments or another of
// the customer's accounts is not spending and is left out.

import type { Transaction } from './api'

export type BasketId = 'fixed' | 'irregular' | 'everyday'

export type BasketLine = {
  name: string // a category, or a kind of place within one
  monthly: number // average euros a month
  purchases: number // average purchases a month
}

export type Basket = {
  id: BasketId
  monthly: number // average euros a month over the window
  share: number // of all spending, 0–1
  byMonth: number[] // euros per month, same order as Baskets.months
  lines: BasketLine[] // biggest first
}

export type Baskets = {
  months: string[] // "YYYY-MM", the full months measured, oldest first
  income: number // average money in a month (salary and other income)
  spending: number // average spending a month, all baskets
  baskets: Record<BasketId, Basket>
  // The irregular basket's worst month: what a buffer has to absorb.
  peak: { month: string; amount: number } | null
}

const WINDOW_MONTHS = 12 // a full year, so irregular costs have room to show up
const SPENDING_TYPES = new Set(['purchase', 'housing_payment', 'utilities_payment'])
const INCOME_TYPES = new Set(['salary', 'other_income'])

// Kinds of place set apart from their category, by MCC. Every other kind of
// transport (public transport, fuel, parking) is getting around, a fixed cost.
const NAMED: Record<string, string> = {
  '4121': 'Taxis',
  '5499': 'Convenience stores',
  '5812': 'Restaurants',
  '5813': 'Bars',
  '5814': 'Fast food',
}

// Which basket a payment belongs to, and the line it is shown under there.
// Undefined when it is not spending.
export function basketOf(tx: Pick<Transaction, 'transaction_type' | 'category' | 'mcc_code' | 'tx_amount_eur'>):
  | { basket: BasketId; line: string }
  | undefined {
  if (tx.tx_amount_eur >= 0 || !SPENDING_TYPES.has(tx.transaction_type ?? '')) return undefined
  if (tx.transaction_type === 'housing_payment') return { basket: 'fixed', line: 'Housing' }
  if (tx.transaction_type === 'utilities_payment') return { basket: 'fixed', line: 'Utilities' }
  const category = tx.category ?? 'Other'
  const mcc = tx.mcc_code ?? ''
  if (category === 'Groceries') return mcc === '5499' ? { basket: 'everyday', line: NAMED[mcc] } : { basket: 'fixed', line: 'Groceries' }
  if (category === 'Transportation')
    return mcc === '4121' ? { basket: 'everyday', line: NAMED[mcc] } : { basket: 'fixed', line: 'Getting around' }
  if (category === 'Health') return { basket: 'irregular', line: 'Health care' }
  if (category === 'Home & Tech') return { basket: 'irregular', line: 'Home and appliances' }
  if (category === 'Lifestyle') return { basket: 'everyday', line: 'Shopping' }
  return { basket: 'everyday', line: NAMED[mcc] ?? category }
}

const monthOf = (tx: Transaction) => tx.tx_date.slice(0, 7)

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

// The three baskets over the last full months. Null with no full month to measure.
// `all` is every transaction (any order).
export function makeBaskets(all: Transaction[]): Baskets | null {
  if (all.length === 0) return null
  const seen = all.map(monthOf).sort()
  const months = monthsBetween(seen[0], seen[seen.length - 1]).slice(0, -1).slice(-WINDOW_MONTHS) // the latest month is not over
  if (months.length === 0) return null
  const index = new Map(months.map((m, i) => [m, i]))
  const n = months.length

  const ids: BasketId[] = ['fixed', 'irregular', 'everyday']
  const byMonth = Object.fromEntries(ids.map((id) => [id, new Array<number>(n).fill(0)])) as Record<BasketId, number[]>
  const lines = Object.fromEntries(ids.map((id) => [id, new Map<string, { total: number; count: number }>()])) as Record<
    BasketId,
    Map<string, { total: number; count: number }>
  >
  let income = 0

  for (const tx of all) {
    const i = index.get(monthOf(tx))
    if (i === undefined) continue
    if (INCOME_TYPES.has(tx.transaction_type ?? '') && tx.tx_amount_eur > 0) income += tx.tx_amount_eur
    const place = basketOf(tx)
    if (!place) continue
    const amount = -tx.tx_amount_eur
    byMonth[place.basket][i] += amount
    const line = lines[place.basket].get(place.line) ?? { total: 0, count: 0 }
    line.total += amount
    line.count++
    lines[place.basket].set(place.line, line)
  }

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const total = sum(ids.map((id) => sum(byMonth[id])))
  const baskets = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        monthly: sum(byMonth[id]) / n,
        share: total > 0 ? sum(byMonth[id]) / total : 0,
        byMonth: byMonth[id],
        lines: [...lines[id]]
          .map(([name, l]) => ({ name, monthly: l.total / n, purchases: l.count / n }))
          .sort((a, b) => b.monthly - a.monthly),
      },
    ]),
  ) as Record<BasketId, Basket>

  const irregular = byMonth.irregular
  const worst = irregular.indexOf(Math.max(...irregular))
  return {
    months,
    income: income / n,
    spending: total / n,
    baskets,
    peak: irregular[worst] > 0 ? { month: months[worst], amount: irregular[worst] } : null,
  }
}

// The everyday lines bought most often: the small, frequent purchases that add up.
export function leaks(b: Baskets, count = 3): BasketLine[] {
  return [...b.baskets.everyday.lines].sort((a, z) => z.purchases - a.purchases).slice(0, count)
}

export const TRIM = 0.2 // the "what if" on the everyday basket: a fifth less
