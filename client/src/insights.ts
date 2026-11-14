// The overview is built from the customer's own data: every possible insight is
// worked out, given a value in euros a year, and the four worth most are shown,
// the biggest first. The value can be money to save or money to put to use.
// Each insight carries one chart and one thing to do.

import type { Transaction } from './api'
import { INCOME_TYPES, TRIM, type Baskets } from './baskets.ts'
import { BENCHMARK_SOURCE, gapWords, type Benchmark } from './benchmarks.ts'
import type { Suggestion } from './mcc'

export type InsightChart =
  // One bar a month; `limit` draws a line to stay under, `recent` darkens the last bars.
  | { kind: 'months'; months: string[]; values: number[]; limit?: { value: number; label: string }; recent?: number }
  // A few amounts side by side.
  | { kind: 'compare'; rows: { label: string; value: number; role: 'you' | 'other' | 'goal' }[] }
  // Year by year, the same money left in the account or invested.
  | { kind: 'growth'; kept: number[]; invested: number[] }
  // The balance day by day, next to the buffer to reach.
  | { kind: 'balance'; from: string; to: string; values: number[]; target: number }

export type Insight = {
  id: string
  topic: string // two insights on one topic are never shown together
  title: string
  value: number // euros a year: what ranks it
  figure: string // the value in words, shown large
  tone: 'gain' | 'loss' | 'plain'
  text: string // what the data says
  action: string // the one thing to do
  ask: string // the question that opens a chat with Walter about it
  chart: InsightChart
  note: string | null
}

export const INVEST_FROM = 60 // score needed before investing is suggested
export const BUFFER_MONTHS = 3 // months of spending to keep in the account
export const SHOWN = 4
const MIN_VALUE = 50 // € a year; below this an insight is noise
const MIN_INVEST = 100 // € above the buffer worth moving at once
const EXAMPLE_YEARS = 10
const EXAMPLE_RETURN = 0.04 // a year; an example, not a forecast
const BALANCE_DAYS = 180
const SET_ASIDE = new Set(['Invest Deposit', 'Salary Sweep', 'Invest Withdraw'])
const DAY_MS = 86_400_000

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
const pct = (n: number) => `${Math.round(n * 100)}%`
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

// The combined balance at the end of each day, oldest first. `all` is oldest first.
export function dailyBalance(all: Transaction[]): { days: string[]; values: number[] } {
  const byDay = new Map<string, Map<string, number>>()
  for (const tx of all) {
    const day = byDay.get(tx.tx_date) ?? new Map<string, number>()
    day.set(tx.bank_account_id, Number(tx.balance_after_eur))
    byDay.set(tx.tx_date, day)
  }
  const dates = [...byDay.keys()].sort()
  const days: string[] = []
  const values: number[] = []
  const accounts = new Map<string, number>()
  const end = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`)
  for (let t = Date.parse(`${dates[0]}T00:00:00Z`); t <= end; t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10)
    for (const [account, balance] of byDay.get(key) ?? []) accounts.set(account, balance)
    days.push(key)
    values.push([...accounts.values()].reduce((a, n) => a + n, 0))
  }
  return { days, values }
}

// `all` is every transaction, oldest first. Empty until there is a full month to measure.
export function makeInsights(d: {
  score: number | null
  baskets: Baskets | null
  benchmark: Benchmark | null
  tips: Suggestion[]
  all: Transaction[]
}): Insight[] {
  const { score, baskets: b, benchmark, tips, all } = d
  if (!b || b.spending <= 0 || all.length === 0) return []
  const n = b.months.length
  const index = new Map(b.months.map((m, i) => [m, i]))

  // Month by month: money in, and what was moved to savings and investments.
  const income = new Array<number>(n).fill(0)
  let moved = 0
  for (const tx of all) {
    const i = index.get(tx.tx_date.slice(0, 7))
    if (i === undefined) continue
    const amount = Number(tx.tx_amount_eur)
    if (INCOME_TYPES.has(tx.transaction_type ?? '') && amount > 0) income[i] += amount
    if (SET_ASIDE.has(tx.category ?? '')) moved -= amount
  }
  const spent = b.months.map((_, i) => b.baskets.fixed.byMonth[i] + b.baskets.irregular.byMonth[i] + b.baskets.everyday.byMonth[i])
  const net = income.map((v, i) => v - spent[i])

  const history = dailyBalance(all)
  const balance = history.values[history.values.length - 1]
  const setAside = Math.max(0, moved / n)
  const kept = b.income - b.spending // left each month after spending
  const spare = kept - setAside // left after what is already set aside
  const target = BUFFER_MONTHS * b.spending
  const gap = target - balance
  const everyday = b.baskets.everyday

  const out: Insight[] = []

  // More goes out than comes in.
  if (kept < 0) {
    const bad = net.filter((v) => v < 0).length
    out.push({
      id: 'overspend',
      topic: 'overspend',
      title: `You spend ${eur(-kept)} more than you get each month`,
      value: -kept * 12,
      figure: `−${eur(-kept * 12)} a year`,
      tone: 'loss',
      text: `In ${bad} of the last ${n} months more went out than came in.`,
      action: everyday.monthly > 0
        ? `Find ${eur(-kept)} a month to cut. Fun extras are the easiest place: ${eur(everyday.monthly)} a month goes there.`
        : `Find ${eur(-kept)} a month to cut.`,
      ask: `I spend about ${eur(-kept)} more than I get each month. Where should I cut first?`,
      chart: { kind: 'months', months: b.months, values: net },
      note: 'Each bar is the money you got that month minus what you spent.',
    })
  }

  // Money above the buffer that earns nothing.
  const lump = -gap >= MIN_INVEST ? -gap : 0
  const monthly = spare >= 10 ? spare : 0
  if (score !== null && score >= INVEST_FROM && kept > 0 && gap <= 0 && (lump || monthly)) {
    const i = EXAMPLE_RETURN / 12
    const years = Array.from({ length: EXAMPLE_YEARS + 1 }, (_, y) => y)
    const keptLine = years.map((y) => lump + monthly * 12 * y)
    const invested = years.map((y) => lump * (1 + i) ** (12 * y) + (monthly * ((1 + i) ** (12 * y) - 1)) / i)
    const gain = (invested[EXAMPLE_YEARS] - keptLine[EXAMPLE_YEARS]) / EXAMPLE_YEARS
    out.push({
      id: 'invest',
      topic: 'invest',
      title: lump ? `${eur(lump)} is sitting above your buffer` : `${eur(monthly)} a month is free to invest`,
      value: gain,
      figure: `+${eur(gain)} a year`,
      tone: 'gain',
      text: `Three months of spending is ${eur(target)}. Keep that in your account. ${lump ? 'The rest' : 'What you have left each month'} earns nothing there.`,
      action: [
        lump ? `Move ${eur(lump)} to a broad, low-cost fund` : '',
        monthly ? `${lump ? 'and add' : 'Move'} ${eur(monthly)} ${lump ? '' : 'to a broad, low-cost fund '}every payday` : '',
      ].filter(Boolean).join(' ').trim() + '.',
      ask: `I have ${lump ? `${eur(lump)} above my buffer` : 'a full buffer'}${monthly ? ` and about ${eur(monthly)} left each month` : ''}. How should I start investing it?`,
      chart: { kind: 'growth', kept: keptLine, invested },
      note: `Example at ${EXAMPLE_RETURN * 100}% a year over ${EXAMPLE_YEARS} years, not a forecast or investment advice: funds can lose value. Talk to a Pankki advisor before deciding.`,
    })
  }

  // The same spare money, before the score allows a plan for it: shown as what is kept each month.
  if (!out.some((x) => x.id === 'invest') && kept > 0 && gap <= 0 && (lump || monthly)) {
    const i = EXAMPLE_RETURN / 12
    const m = EXAMPLE_YEARS * 12
    const gain = (lump * (1 + i) ** m + (monthly * ((1 + i) ** m - 1)) / i - lump - monthly * m) / EXAMPLE_YEARS
    out.push({
      id: 'kept',
      topic: 'invest',
      title: `You keep ${eur(kept)} a month and your buffer is full`,
      value: gain,
      figure: `${eur(kept * 12)} a year`,
      tone: 'plain',
      text: `You have ${eur(balance)}. Three months of spending is ${eur(target)}, so the rest is free to use.`,
      action: `Answer the questions in your financial profile. From a score of ${INVEST_FROM} you get a plan for this money${score !== null ? `; yours is ${score}` : ''}.`,
      ask: `I keep about ${eur(kept)} a month and my buffer is full. What should I do with the money?`,
      chart: { kind: 'months', months: b.months, values: net },
      note: 'Each bar is the money you got that month minus what you spent.',
    })
  }

  // The spending that slips through: its trend, and what a fifth less is worth.
  if (everyday.monthly > 0) {
    const months = everyday.byMonth
    // A rise only counts from a real base: next to almost nothing, anything is a big percentage.
    const before = n >= 6 ? avg(months.slice(-6, -3)) : 0
    const change = before >= everyday.monthly / 2 ? avg(months.slice(-3)) / before - 1 : 0
    const top = everyday.lines[0]
    out.push({
      id: 'fun',
      topic: 'fun',
      title: change >= 1 ? 'Fun extras have more than doubled in three months' : change >= 0.1 ? `Fun extras are up ${pct(change)} in three months` : `Fun extras take ${eur(everyday.monthly)} a month`,
      value: everyday.monthly * TRIM * 12,
      figure: `+${eur(everyday.monthly * TRIM * 12)} a year`,
      tone: 'gain',
      text: `Eating out, fun and shopping${top ? `. Most goes to ${top.name.toLowerCase()}: ${eur(top.monthly)} a month` : ''}.`,
      action: `Set a weekly limit of ${eur((everyday.monthly * (1 - TRIM)) / 4.33)} and stop when it is used up. That is a fifth less.`,
      ask: 'Help me spend a fifth less on fun extras. Where does it go and what should my weekly limit be?',
      chart: {
        kind: 'months',
        months: b.months,
        values: months,
        limit: { value: everyday.monthly * (1 - TRIM), label: 'A fifth less' },
        recent: change >= 0.1 ? 3 : undefined,
      },
      note: null,
    })
  }

  // The one cheaper way worth most.
  const tip = tips.find((t) => t.saving !== null)
  if (tip) {
    out.push({
      id: 'tip',
      topic: tip.title,
      title: `${tip.title} cost you ${eur(tip.amount)} a month`,
      value: tip.saving! * 12,
      figure: `+${eur(tip.saving! * 12)} a year`,
      tone: 'gain',
      text: tip.advice,
      action: `Try it this month and keep the ${eur(tip.saving!)} you save.`,
      ask: `How can I spend less at ${tip.many}?`,
      chart: {
        kind: 'compare',
        rows: [
          { label: 'Now', value: tip.amount, role: 'you' },
          { label: 'The cheaper way', value: tip.amount - tip.saving!, role: 'goal' },
        ],
      },
      note: tip.source ? `Estimate from published Finnish prices. Source: ${tip.source}.` : null,
    })
  }

  // The category furthest above what people of the same age spend.
  const line = benchmark?.lines.find((l) => l.ratio >= 1.25 && l.you - l.typical >= 10)
  if (benchmark && line) {
    const who = benchmark.group === 'all' ? 'people in Finland' : `Finns aged ${benchmark.group}`
    const half = (line.you + line.typical) / 2
    out.push({
      id: 'benchmark',
      topic: line.category,
      title: `${line.category}: you spend ${gapWords(line.ratio)} ${line.ratio >= 2 ? 'as' : 'than'} ${who}`,
      value: (line.you - half) * 12,
      figure: `+${eur((line.you - half) * 12)} a year`,
      tone: 'gain',
      text: `You spend ${eur(line.you)} a month. Typical is ${eur(line.typical)}.`,
      action: `Aim for ${eur(half)} a month. That is halfway to typical.`,
      ask: `Why do I spend more than typical on ${line.category}, and how do I get to ${eur(half)} a month?`,
      chart: {
        kind: 'compare',
        rows: [
          { label: 'You', value: line.you, role: 'you' },
          { label: 'Your goal', value: half, role: 'goal' },
          { label: 'Typical', value: line.typical, role: 'other' },
        ],
      },
      note: `Typical: ${BENCHMARK_SOURCE}, per person.`,
    })
  }

  // The buffer: how the balance has moved, next to three months of spending.
  const recent = history.values.slice(-BALANCE_DAYS)
  const below = recent.filter((v) => v < 0).length
  const full = gap <= 0 && below === 0
  {
    const pace = kept > 0 ? (spare > 0 ? spare : kept) : 0
    const wait = pace > 0 && gap > 0 ? Math.ceil(gap / pace) : 0
    out.push({
      id: 'buffer',
      topic: 'buffer',
      title: full
        ? 'Your buffer is full'
        : below > 0
        ? `Below zero on ${below} of the last ${recent.length} days`
        : `Your buffer covers ${(Math.max(0, balance) / b.spending).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} of ${BUFFER_MONTHS} months`,
      value: Math.min(Math.max(0, gap), pace * 12),
      figure: full
        ? `${(balance / b.spending).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} months of spending`
        : gap > 0 ? `${eur(gap)} to go` : `${eur(balance)} now`,
      tone: full ? 'gain' : 'plain',
      text: `You have ${eur(balance)}. Three months of spending is ${eur(target)}.`,
      action: full
        ? `Keep at least ${eur(target)} here. Check the amount again when your rent or bills change.`
        : pace > 0
        ? `Move ${eur(pace)} aside the day your salary arrives.${wait > 0 && wait <= 36 ? ` Your buffer is full in about ${wait} month${wait === 1 ? '' : 's'}.` : ''}`
        : 'Once you spend less than you get, put the difference here first.',
      ask: 'How do I build a buffer of three months of spending, and how long will it take?',
      chart: {
        kind: 'balance',
        from: history.days[history.days.length - recent.length],
        to: history.days[history.days.length - 1],
        values: recent,
        target,
      },
      note: null,
    })
  }

  const seen = new Set<string>()
  const ranked = out
    .filter((x) => x.id === 'buffer' || x.value >= MIN_VALUE)
    .sort((a, z) => z.value - a.value)
    .filter((x) => !seen.has(x.topic) && !!seen.add(x.topic))
  // A full buffer is good news, not an opportunity: it is shown only when there is little else.
  return (full && ranked.length > 3 ? ranked.filter((x) => x.id !== 'buffer') : ranked).slice(0, SHOWN)
}
