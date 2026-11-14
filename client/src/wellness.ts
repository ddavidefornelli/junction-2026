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
  savingMonths: number
  observedMonths: number
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

// This is an illustrative model, NOT Intesa Sanpaolo's proprietary formula.
// Unknown answers and insufficient transaction history are never scored as zero.
export type WellnessAnswers = {
  control: number | null       // 0–4: perceived control over finances
  worry: number | null         // 0–4: frequency of financial worry (reversed)
  confidence: number | null    // 0–4: confidence in reaching goals
  inflation: boolean | null
  compoundInterest: boolean | null
  diversification: boolean | null
  budget: boolean | null
  plan: boolean | null
}

export const emptyAnswers = (): WellnessAnswers => ({
  control: null, worry: null, confidence: null,
  inflation: null, compoundInterest: null, diversification: null,
  budget: null, plan: null,
})

export type WellnessScores = {
  resilience: number | null
  perception: number | null
  knowledge: number | null
  behaviors: number | null
  total: number | null
}

export function wellnessScores(w: Wellness, a: WellnessAnswers): WellnessScores {
  const monthlyOutgoings = w.outgoing / w.days * 30
  const resilience = w.savingsRate === null || monthlyOutgoings <= 0 ? null : Math.round(
    15 * clamp(w.savingsRate / 0.2, 1) +
    15 * clamp(w.averageBalance / (3 * monthlyOutgoings), 1) +
    5 * (1 - w.negativeDays / w.days),
  )
  const ratings = [a.control, a.worry, a.confidence]
  const perception = ratings.every((n) => Number.isInteger(n) && n !== null && n >= 0 && n <= 4)
    ? Math.round(25 * ((a.control! + (4 - a.worry!) + a.confidence!) / 12)) : null
  const quiz = [a.inflation, a.compoundInterest, a.diversification]
  const knowledge = quiz.every((v) => typeof v === 'boolean')
    ? Math.round(20 * quiz.filter(Boolean).length / 3) : null
  const behaviors = w.observedMonths < 2 || typeof a.budget !== 'boolean' || typeof a.plan !== 'boolean'
    ? null : Math.round(10 * w.savingMonths / w.observedMonths + (a.budget ? 5 : 0) + (a.plan ? 5 : 0))
  const parts = [resilience, perception, knowledge, behaviors]
  return {
    resilience, perception, knowledge, behaviors,
    total: parts.every((n) => n !== null) ? parts.reduce<number>((sum, n) => sum + n!, 0) : null,
  }
}

// Show an account-activity-only preview while the questionnaire or full-month
// history is incomplete. It is not the full four-dimension score: rescale only
// the measured resilience (35 points) instead of treating missing answers as zero.
export function visibleWellnessScore(w: Wellness, a: WellnessAnswers): { value: number | null; provisional: boolean } {
  const { total, resilience } = wellnessScores(w, a)
  if (total !== null) return { value: total, provisional: false }
  if (resilience !== null) return { value: Math.round(resilience / 35 * 100), provisional: true }
  return { value: null, provisional: false }
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
  const months = new Map<string, number>()
  const byDay = new Map<string, Map<string, number>>()
  for (const tx of rows) {
    const amount = Number(tx.tx_amount_eur)
    const month = tx.tx_date.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + amount)
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
  // Count only complete calendar months: partial boundary months distort saving regularity.
  const fullMonths: number[] = []
  const firstMonth = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  for (const month = firstMonth; month.toISOString().slice(0, 7) <= to.slice(0, 7); month.setUTCMonth(month.getUTCMonth() + 1)) {
    const key = month.toISOString().slice(0, 7)
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    if (from <= `${key}-01` && to >= end) fullMonths.push(months.get(key) ?? 0)
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
    savingMonths: fullMonths.filter((net) => net > 0).length,
    observedMonths: fullMonths.length,
  }
}
