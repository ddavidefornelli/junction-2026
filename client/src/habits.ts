// When the customer spends on "Fun extras", the optional basket: by time of
// day, weekend or weekday, just after payday, and in many small amounts.
// Walter uses these to point out habits research links to impulse buying
// (see HABITS in ../chat.ts for what each one means and its sources).

import type { Transaction } from './api'
import { basketOf, INCOME_TYPES } from './baskets.ts'

const MONTHS = 6 // full months measured
const PAYDAY_DAYS = 4 // the day the salary arrives and the three after it
const SMALL = 15 // € and under counts as a small purchase

// Hours are the transaction's own local time ("2026-09-27T23:03:14").
export const BANDS = [
  { name: 'morning', label: '5–12', from: 5, to: 12 },
  { name: 'afternoon', label: '12–18', from: 12, to: 18 },
  { name: 'evening', label: '18–22', from: 18, to: 22 },
  { name: 'late night', label: '22–5', from: 22, to: 29 },
] as const

export type Habits = {
  months: number
  total: number // fun extras a month
  bands: { name: string; label: string; perMonth: number; share: number; count: number; average: number }[]
  weekendShare: number // share of fun extras on Saturday and Sunday (2 of 7 days = 29% if spread evenly)
  payday: { share: number; even: number } | null // share spent in the PAYDAY_DAYS from each salary, and the share if spread evenly
  small: { perMonth: number; count: number } // small purchases a month
}

export function makeHabits(all: Transaction[]): Habits | null {
  const months = [...new Set(all.map((tx) => tx.tx_date.slice(0, 7)))].sort().slice(0, -1).slice(-MONTHS)
  if (!months.length) return null
  const window = new Set(months)
  const inWindow = all.filter((tx) => window.has(tx.tx_date.slice(0, 7)))
  const fun = inWindow.filter((tx) => basketOf(tx)?.basket === 'everyday')
  const total = fun.reduce((s, tx) => s - tx.tx_amount_eur, 0)
  if (!fun.length || total <= 0) return null

  const hour = (tx: Transaction) => {
    const h = Number(tx.tx_timestamp.slice(11, 13))
    return h < 5 ? h + 24 : h
  }
  const bands = BANDS.map((b) => {
    const txs = fun.filter((tx) => hour(tx) >= b.from && hour(tx) < b.to)
    const sum = txs.reduce((s, tx) => s - tx.tx_amount_eur, 0)
    return { name: b.name, label: b.label, perMonth: sum / months.length, share: sum / total, count: txs.length / months.length, average: txs.length ? sum / txs.length : 0 }
  })

  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
  const weekend = fun.filter((tx) => weekday(tx.tx_date) % 6 === 0).reduce((s, tx) => s - tx.tx_amount_eur, 0)

  // Days from each salary: the day it arrives and the next three.
  const paydays = new Set<string>()
  for (const tx of inWindow)
    if (tx.transaction_type === 'salary' || (INCOME_TYPES.has(tx.transaction_type ?? '') && tx.tx_amount_eur > 500))
      for (let i = 0; i < PAYDAY_DAYS; i++) {
        const d = new Date(`${tx.tx_date}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + i)
        paydays.add(d.toISOString().slice(0, 10))
      }
  const days = new Set<string>()
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number)
    for (let d = 1; d <= new Date(Date.UTC(y, mo, 0)).getUTCDate(); d++) days.add(`${m}-${String(d).padStart(2, '0')}`)
  }
  const paydayDays = [...paydays].filter((d) => days.has(d)).length
  const payday = paydayDays
    ? { share: fun.filter((tx) => paydays.has(tx.tx_date)).reduce((s, tx) => s - tx.tx_amount_eur, 0) / total, even: paydayDays / days.size }
    : null

  const small = fun.filter((tx) => -tx.tx_amount_eur <= SMALL)
  return {
    months: months.length,
    total: total / months.length,
    bands,
    weekendShare: weekend / total,
    payday,
    small: { perMonth: small.reduce((s, tx) => s - tx.tx_amount_eur, 0) / months.length, count: small.length / months.length },
  }
}

const eur = (n: number) => `${Math.round(n)} €`
const pct = (n: number) => `${Math.round(n * 100)}%`

// The habits as lines of the summary Walter answers from.
export function habitLines(h: Habits): string[] {
  return [
    `When the customer spends on "Fun extras" (monthly average over the last ${h.months} full month(s), ${eur(h.total)} a month):`,
    ...h.bands.map(
      (b) => `- ${b.name} (${b.label} o'clock): ${eur(b.perMonth)} a month, ${pct(b.share)} of fun extras, about ${Math.round(b.count)} purchases a month averaging ${eur(b.average)}`,
    ),
    `- Weekends: ${pct(h.weekendShare)} of fun extras (29% if spread evenly over the week)`,
    ...(h.payday ? [`- First ${PAYDAY_DAYS} days after a salary arrives: ${pct(h.payday.share)} of fun extras (${pct(h.payday.even)} if spread evenly)`] : []),
    `- Small purchases of ${SMALL} € or less: about ${Math.round(h.small.count)} a month, ${eur(h.small.perMonth)} in all`,
  ]
}
