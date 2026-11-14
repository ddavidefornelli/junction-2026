import type { Transaction } from './api'
import { basketOf } from './baskets.ts'

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
  signals?: Signals | null // null with fewer than two complete months
}

// What the account itself shows about the three dimensions a questionnaire would
// otherwise ask about. Each is worked out from the transactions alone, the same
// way every time. They are signs of how the money is handled, not a reading of
// what the customer feels or knows.
export type Signals = {
  steady: number // 0–1: how even spending is from month to month (1 = the same every month)
  covered: number // share of days with at least two weeks of spending in the account
  trend: number // 0–1: the balance in the second half of the period against the first (1 = level or rising)
  invested: number // share of complete months with money moved to investments
  saved: number // share of complete months with money moved to savings
  setAside: number // share of complete months with either
  idleMonths: number // months of spending that sit in the account on average
  steadyFun: number // share of complete months where fun extras stayed within a fifth of the usual
}

const COVER_DAYS = 14 // days of spending that count as "enough in the account"
const STEADY_CV = 0.5 // month-to-month variation at which spending counts as not steady at all
const TREND_FLOOR = 0.8 // a balance down to this share of its earlier level scores zero
const IDLE_FREE = 6 // months of spending that can sit in the account before it counts as idle
const IDLE_MAX = 12 // months at which it scores zero
const FUN_MARGIN = 1.2 // fun extras up to this multiple of the usual month still count as steady

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

// Whether every question of a dimension has an answer.
function answered(a: WellnessAnswers, dimension: 'perception' | 'knowledge'): boolean {
  return dimension === 'perception'
    ? [a.control, a.worry, a.confidence].every((n) => Number.isInteger(n) && n !== null && n >= 0 && n <= 4)
    : [a.inflation, a.compoundInterest, a.diversification].every((v) => typeof v === 'boolean')
}

// Money put to work: investing counts in full, a savings account for half.
const workShare = (s: Signals) => Math.min(1, s.invested + 0.5 * s.saved)
// Cash not left idle: full marks up to IDLE_FREE months of spending, none from IDLE_MAX.
const idleShare = (s: Signals) => clamp((IDLE_MAX - s.idleMonths) / (IDLE_MAX - IDLE_FREE), 1)

export type Dimension = { name: string; score: number | null; max: number; lines: string[] }

// The four dimensions with, in plain words, what each score rests on.
export function wellnessBreakdown(w: Wellness, a: WellnessAnswers): Dimension[] {
  const scores = wellnessScores(w, a)
  const s = w.signals ?? null
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const one = (n: number) => n.toLocaleString('fi-FI', { maximumFractionDigits: 1 })
  const monthly = w.outgoing / w.days * 30
  const need = 'Needs two complete months of transactions.'
  return [
    {
      name: 'Resilience', score: scores.resilience, max: 35,
      lines: scores.resilience === null ? ['Not enough account activity yet.'] : [
        `You keep ${pct(w.savingsRate!)} of the money you get. 20% gives full marks.`,
        `Your average balance covers ${one(w.averageBalance / monthly)} months of what goes out. 3 gives full marks.`,
        `Below zero on ${w.negativeDays} of ${w.days} days.`,
      ],
    },
    {
      name: 'Perception', score: scores.perception, max: 25,
      lines: answered(a, 'perception') ? ['From your own answers.'] : !s ? [need] : [
        `Your spending is ${pct(s.steady)} steady from month to month.`,
        `On ${pct(s.covered)} of days you had at least two weeks of spending in the account.`,
        s.trend >= 1 ? 'Your balance is level or rising.' : s.trend <= 0 ? 'Your balance has fallen by a fifth or more.' : 'Your balance is slipping.',
      ],
    },
    {
      name: 'Knowledge', score: scores.knowledge, max: 20,
      lines: answered(a, 'knowledge') ? ['From your own answers.'] : !s ? [need] : [
        s.invested > 0 ? `You moved money to investments in ${pct(s.invested)} of months.`
          : s.saved > 0 ? `You moved money to savings in ${pct(s.saved)} of months. Investing counts double.`
          : 'No money moved to savings or investments.',
        `About ${one(s.idleMonths)} months of spending sit in your account. Up to ${IDLE_FREE} gives full marks.`,
      ],
    },
    {
      name: 'Behaviors', score: scores.behaviors, max: 20,
      lines: w.observedMonths < 2 ? [need] : [
        `More came in than went out in ${w.savingMonths} of ${w.observedMonths} months.`,
        typeof a.budget === 'boolean' ? `You ${a.budget ? 'track' : 'do not track'} a budget (your answer).`
          : s ? `Fun extras stayed near your usual in ${pct(s.steadyFun)} of months.` : need,
        typeof a.plan === 'boolean' ? `You ${a.plan ? 'have' : 'do not have'} a financial plan (your answer).`
          : s ? `You set money aside in ${pct(s.setAside)} of months.` : need,
      ],
    },
  ]
}

export function wellnessScores(w: Wellness, a: WellnessAnswers): WellnessScores {
  const monthlyOutgoings = w.outgoing / w.days * 30
  const resilience = w.savingsRate === null || monthlyOutgoings <= 0 ? null : Math.round(
    15 * clamp(w.savingsRate / 0.2, 1) +
    15 * clamp(w.averageBalance / (3 * monthlyOutgoings), 1) +
    5 * (1 - w.negativeDays / w.days),
  )
  // Where the customer has answered, their own answers count. Everything else
  // comes from the account (see Signals), so no dimension waits for a questionnaire.
  const s = w.signals ?? null
  const perception = answered(a, 'perception')
    ? Math.round(25 * ((a.control! + (4 - a.worry!) + a.confidence!) / 12))
    : s ? Math.round(25 * (s.steady + s.covered + s.trend) / 3) : null
  const knowledge = answered(a, 'knowledge')
    ? Math.round(20 * [a.inflation, a.compoundInterest, a.diversification].filter(Boolean).length / 3)
    : s ? Math.round(10 * workShare(s) + 10 * idleShare(s)) : null
  const budget = typeof a.budget === 'boolean' ? (a.budget ? 1 : 0) : s ? s.steadyFun : null
  const plan = typeof a.plan === 'boolean' ? (a.plan ? 1 : 0) : s ? s.setAside : null
  const behaviors = w.observedMonths < 2 || budget === null || plan === null
    ? null : Math.round(10 * w.savingMonths / w.observedMonths + 5 * budget + 5 * plan)
  const parts = [resilience, perception, knowledge, behaviors]
  return {
    resilience, perception, knowledge, behaviors,
    total: parts.every((n) => n !== null) ? parts.reduce<number>((sum, n) => sum + n!, 0) : null,
  }
}

// Show an account-activity-only preview while there are fewer than two complete
// months to work the other dimensions out from. It is not the full four-dimension score: rescale only
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
  const monthly = new Map<string, { spent: number; fun: number; invested: boolean; saved: boolean }>()
  let spentTotal = 0 // what went out, without money moved to savings or investments
  const byDay = new Map<string, Map<string, number>>()
  for (const tx of rows) {
    const amount = Number(tx.tx_amount_eur)
    const month = tx.tx_date.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + amount)
    const m = monthly.get(month) ?? { spent: 0, fun: 0, invested: false, saved: false }
    if (tx.category === 'Invest Deposit') m.invested = true
    else if (tx.category === 'Salary Sweep') m.saved = true
    else if (amount < 0 && tx.category !== 'Invest Withdraw') {
      m.spent -= amount
      spentTotal -= amount
      if (basketOf(tx)?.basket === 'everyday') m.fun -= amount
    }
    monthly.set(month, m)
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
  const daily: number[] = []
  for (let day = utcDay(from); day <= utcDay(to); day++) {
    const key = new Date(day * DAY_MS).toISOString().slice(0, 10)
    for (const [account, balance] of byDay.get(key) ?? []) balances.set(account, balance)
    const total = [...balances.values()].reduce((sum, balance) => sum + balance, 0)
    balanceSum += total
    daily.push(total)
    if (total < 0) negativeDays++
  }
  // Count only complete calendar months: partial boundary months distort saving regularity.
  const fullMonths: number[] = []
  const fullKeys: string[] = []
  const firstMonth = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  for (const month = firstMonth; month.toISOString().slice(0, 7) <= to.slice(0, 7); month.setUTCMonth(month.getUTCMonth() + 1)) {
    const key = month.toISOString().slice(0, 7)
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    if (from <= `${key}-01` && to >= end) {
      fullMonths.push(months.get(key) ?? 0)
      fullKeys.push(key)
    }
  }

  let signals: Signals | null = null
  if (fullKeys.length >= 2) {
    const full = fullKeys.map((key) => monthly.get(key) ?? { spent: 0, fun: 0, invested: false, saved: false })
    const share = (test: (m: (typeof full)[number]) => boolean) => full.filter(test).length / full.length
    const mean = full.reduce((sum, m) => sum + m.spent, 0) / full.length
    const deviation = Math.sqrt(full.reduce((sum, m) => sum + (m.spent - mean) ** 2, 0) / full.length)
    const perDay = spentTotal / days
    const half = Math.floor(daily.length / 2)
    const average = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / (xs.length || 1)
    const before = average(daily.slice(0, half))
    const after = average(daily.slice(half))
    const fun = full.map((m) => m.fun).sort((x, y) => x - y)
    const usualFun = fun.length % 2 ? fun[(fun.length - 1) / 2] : (fun[fun.length / 2 - 1] + fun[fun.length / 2]) / 2
    signals = {
      steady: mean > 0 ? clamp(1 - deviation / mean / STEADY_CV, 1) : 1,
      covered: daily.filter((total) => total >= COVER_DAYS * perDay).length / daily.length,
      trend: before > 0 ? clamp((after / before - TREND_FLOOR) / (1 - TREND_FLOOR), 1) : after > before ? 1 : 0,
      invested: share((m) => m.invested),
      saved: share((m) => m.saved),
      setAside: share((m) => m.invested || m.saved),
      idleMonths: perDay > 0 ? Math.max(0, balanceSum / days) / (perDay * 30) : 0,
      steadyFun: share((m) => m.fun <= usualFun * FUN_MARGIN),
    }
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
    signals,
  }
}
