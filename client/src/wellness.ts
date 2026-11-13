import type { Transaction } from './api'

const DAY_MS = 86_400_000
const utcDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS

export type Wellness = {
  from: string
  to: string
  days: number
  accounts: number
  incoming: number
  outgoing: number
  net: number
  savingsRate: number | null
  averageBalance: number
  negativeDays: number
  essentials: number
  categories: [string, number][]
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

// Indicative 0–100 financial impact score: 40 points for saving 20% or more
// of income, 35 for a 3-month average cash buffer, 25 for no overdrawn days.
export function impactScore(w: Wellness): number {
  const savings = 40 * clamp((w.savingsRate ?? 0) / 0.2, 1)
  const monthlyOutgoings = w.outgoing / w.days * 30
  const buffer = monthlyOutgoings > 0
    ? 35 * clamp(w.averageBalance / (monthlyOutgoings * 3), 1)
    : (w.averageBalance > 0 ? 35 : 0)
  const overdraft = 25 * (1 - w.negativeDays / w.days)
  return Math.round(savings + buffer + overdraft)
}

// A day uses the last recorded balance for each account. Carry it forward on days
// without activity; do not assume an opening balance before an account first appears.
export function calculateWellness(txs: Transaction[]): Wellness | null {
  if (txs.length === 0) return null
  const rows = [...txs].sort((a, b) => a.tx_timestamp.localeCompare(b.tx_timestamp))
  let incoming = 0
  let outgoing = 0
  let essentials = 0
  const spending = new Map<string, number>()
  const byDay = new Map<string, Map<string, number>>()
  for (const tx of rows) {
    const amount = Number(tx.tx_amount_eur)
    if (amount > 0) incoming += amount
    if (amount < 0) {
      outgoing -= amount
      const category = tx.category || 'Altro'
      spending.set(category, (spending.get(category) ?? 0) - amount)
      if (['Housing', 'Utilities'].includes(category)) essentials -= amount
    }
    const balances = byDay.get(tx.tx_date) ?? new Map<string, number>()
    balances.set(tx.bank_account_id, Number(tx.balance_after_eur))
    byDay.set(tx.tx_date, balances)
  }

  const dates = [...byDay.keys()].sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  const days = utcDay(to) - utcDay(from) + 1
  const balances = new Map<string, number>()
  let balanceSum = 0
  let negativeDays = 0
  for (let day = utcDay(from); day <= utcDay(to); day++) {
    const key = new Date(day * DAY_MS).toISOString().slice(0, 10)
    for (const [account, balance] of byDay.get(key) ?? []) balances.set(account, balance)
    const total = [...balances.values()].reduce((sum, balance) => sum + balance, 0)
    balanceSum += total
    if (total < 0) negativeDays++
  }
  const net = incoming - outgoing
  return {
    from,
    to,
    days,
    accounts: balances.size,
    incoming,
    outgoing,
    net,
    savingsRate: incoming > 0 ? net / incoming : null,
    averageBalance: balanceSum / days,
    negativeDays,
    essentials,
    categories: [...spending].sort((a, b) => b[1] - a[1]).slice(0, 5),
  }
}
