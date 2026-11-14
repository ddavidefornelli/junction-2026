// "What is safe for me to spend this week?", worked out by the app so Walter
// only has to explain it. Safe means: after the bills still due before payday,
// groceries and getting around at the usual pace, a share of the costs that
// come now and then, and without eating into savings. It is the smaller of two
// figures:
//   - the pace the income allows: what is left each month after bills, needs
//     and (while the buffer is not full) what is being saved, spread by week;
//   - the room in the balance: what is left of it before payday after the
//     above, spread over the weeks to payday.
// So someone with a large balance still gets a weekly pace they can keep, and
// someone close to zero gets only what the balance can carry to payday.

import type { Transaction } from './api'
import type { Baskets } from './baskets'

const DAY_MS = 86_400_000
const MONTH_DAYS = 365.25 / 12
const BUFFER_MONTHS = 3 // as in insights.ts
const BILL_TYPES = new Set(['housing_payment', 'utilities_payment'])

export type SafeToSpend = {
  asOf: string // the latest day in the data, "today" for the customer
  balance: number
  payday: string // the next expected salary
  daysLeft: number // days from asOf to payday
  billsDue: number // rent and utilities not yet paid this pay cycle
  needs: number // groceries and getting around until payday, at the usual pace
  reserve: number // "must pay sometimes" set aside until payday
  room: number // the balance after the three above; may be negative
  pace: number // a week of fun extras the income allows
  saving: number // a month: what is kept for the buffer while it is not full
  week: number // safe to spend this week: the smaller figure, never below 0
  limitedBy: 'pace' | 'balance'
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)
const time = (d: string) => Date.parse(`${d}T00:00:00Z`)

// `all` is every transaction, oldest first. Null without a salary to time payday by.
export function safeToSpend(all: Transaction[], b: Baskets | null): SafeToSpend | null {
  if (!b || all.length === 0) return null
  const asOf = all[all.length - 1].tx_date

  const salaries = [...new Set(all.filter((tx) => tx.transaction_type === 'salary' && tx.tx_amount_eur > 0).map((tx) => tx.tx_date))].sort()
  if (salaries.length < 2) return null
  const gaps = salaries.slice(-7).map((d, i, xs) => (i ? (time(d) - time(xs[i - 1])) / DAY_MS : 0)).slice(1).sort((x, y) => x - y)
  const gap = Math.max(7, Math.round(gaps[Math.floor(gaps.length / 2)]))
  const last = salaries[salaries.length - 1]
  let next = time(last) + gap * DAY_MS
  while (next <= time(asOf)) next += gap * DAY_MS
  const daysLeft = Math.round((next - time(asOf)) / DAY_MS)
  const share = daysLeft / MONTH_DAYS // of a month, until payday

  const balances = new Map<string, number>()
  for (const tx of all) balances.set(tx.bank_account_id, Number(tx.balance_after_eur))
  const balance = [...balances.values()].reduce((x, y) => x + y, 0)

  const fixed = b.baskets.fixed
  const bills = fixed.lines.filter((l) => l.name === 'Housing' || l.name === 'Utilities').reduce((x, l) => x + l.monthly, 0)
  const paid = all
    .filter((tx) => tx.tx_date >= last && BILL_TYPES.has(tx.transaction_type ?? '') && tx.tx_amount_eur < 0)
    .reduce((x, tx) => x - tx.tx_amount_eur, 0)
  const billsDue = Math.max(0, bills - paid)
  const needs = Math.max(0, fixed.monthly - bills) * share
  const reserve = b.baskets.irregular.monthly * share
  const room = balance - billsDue - needs - reserve

  const kept = b.income - b.spending
  const saving = balance < BUFFER_MONTHS * b.spending ? Math.max(0, kept) : 0
  const pace = (Math.max(0, b.income - fixed.monthly - b.baskets.irregular.monthly - saving) * 7) / MONTH_DAYS
  const roomWeek = Math.max(0, room) * Math.min(1, 7 / Math.max(1, daysLeft))
  const week = Math.min(pace, roomWeek)

  return {
    asOf,
    balance,
    payday: day(next),
    daysLeft,
    billsDue,
    needs,
    reserve,
    room,
    pace,
    saving,
    week,
    limitedBy: roomWeek < pace ? 'balance' : 'pace',
  }
}

// The figures as lines for Walter's summary (see assistant.ts).
export function safeLines(s: SafeToSpend): string[] {
  const eur = (n: number) => `${Math.round(n)} €`
  return [
    `Safe to spend (worked out by the app; quote these figures, never work safe-to-spend out yourself): ${eur(s.week)} this week, about ${eur(s.week / 7)} a day.`,
    `- Next salary expected about ${s.payday}, in ${s.daysLeft} day(s).`,
    `- Pace the income allows: ${eur(s.pace)} a week for fun extras, after "Must pay every month", "Must pay sometimes"${s.saving > 0 ? ` and ${eur(s.saving)} a month kept for the buffer of three months of spending, which is not full yet` : ''}.`,
    `- Room in the balance before payday: balance ${eur(s.balance)} minus rent and bills still due this pay cycle ${eur(s.billsDue)}, groceries and getting around until payday ${eur(s.needs)}, and a share of "Must pay sometimes" ${eur(s.reserve)} = ${eur(s.room)}.`,
    s.limitedBy === 'balance'
      ? '- The balance is the limit: it has to last until payday, so the safe figure is lower than the usual pace.'
      : '- The pace is the limit: the balance could carry more this week, but spending faster than the income allows would eat into savings.',
  ]
}
