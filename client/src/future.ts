// "Call your future self": where the customer's money stands some years from
// now, in two futures. In one they keep today's habits and the money sits in
// the account. In the other they keep up one change (their running challenge,
// or a fifth less on fun extras) and invest what they keep each month, so it
// compounds.
//
// The sums are deliberately plain, in today's euros: no pay rises, no
// inflation, and one stated assumption for the market (RETURN). It is an
// illustration of a habit, not a forecast, and every figure the voice on the
// call quotes comes from here (see FUTURE in chat.ts).
//
// The call is only offered when it has something to say (see `why`): a big
// win within reach, or habits that run the account dry.

import type { Transaction } from './api'
import { TRIM, type Baskets } from './baskets.ts'
import type { Challenge } from './challenges.ts'
import { BUFFER_MONTHS, dailyBalance } from './insights.ts'

export const MAX_YEARS = 10
// Assumed growth of invested money, a year, after inflation. An assumption, not a promise.
export const RETURN = 0.05
// Offered for the upside when, after MAX_YEARS, the changed future is ahead by this many months of today's spending…
export const UPSIDE_MONTHS = 12
// …or for the danger when today's habits leave less than this many months of spending by then.
export const DANGER_MONTHS = 1
const MONTH_DAYS = 30.44
const MONTHLY = (1 + RETURN) ** (1 / 12) - 1

export type Future = {
  today: string // "YYYY-MM-DD", the latest transaction
  balance: number // € across the accounts today
  spending: number // € spent a month now
  keep: number // € kept a month now (money in less spending); may be negative
  extra: number // € more kept a month in the changed future
  change: string // the change, after "if you…"
  label: string // the changed future, as a short name
  // Why the call is worth making: a big win within reach, or money running out.
  why: 'upside' | 'danger'
}

export type Point = {
  year: number // the calendar year reached
  balance: number // € by then, invested money included
  growth: number // € of that which the market added (0 when nothing is invested)
  cover: number // months of spending that balance pays for
  stage: number // 0–4, for the apple: below zero … twice the buffer
}

// Null when there is nothing to project from, or the two futures are too
// alike to be worth a call.
export function makeFuture(d: { all: Transaction[]; baskets: Baskets | null; challenge: Challenge | null }): Future | null {
  const { all, baskets: b, challenge: c } = d
  if (!b || all.length === 0 || b.spending <= 0) return null
  const saving = c && (c.kind === 'save' || c.kind === 'place') && c.target > 0 ? c : null
  const extra = saving ? (saving.target / saving.days) * MONTH_DAYS : b.baskets.everyday.monthly * TRIM
  if (extra < 1) return null
  const f: Future = {
    today: all[all.length - 1].tx_date,
    balance: dailyBalance(all).values.at(-1)!,
    spending: b.spending,
    keep: b.income - b.spending,
    extra,
    change: `${saving ? `keep up your challenge (${saving.title})` : 'spend a fifth less on eating out, fun and shopping'} and invest what you keep each month`,
    label: saving ? 'Challenge kept up, invested' : 'A fifth less on fun, invested',
    why: 'upside',
  }
  if (f.keep < 0 && at(f, MAX_YEARS, false).cover < DANGER_MONTHS) return { ...f, why: 'danger' }
  return gap(f, MAX_YEARS) >= UPSIDE_MONTHS * f.spending ? f : null
}

// € invested each month in the changed future: all that is kept, when anything is.
export const invested = (f: Future) => Math.max(0, f.keep + f.extra)

// Where one of the two futures stands after `years`.
export function at(f: Future, years: number, changed: boolean): Point {
  const months = years * 12
  const kept = f.keep + (changed ? f.extra : 0)
  const paid = kept * months
  // Paid in at the end of each month and left to grow.
  const grown = changed && kept > 0 ? kept * (((1 + MONTHLY) ** months - 1) / MONTHLY) : paid
  const balance = Math.round(f.balance + grown)
  const cover = balance / (f.spending - (changed ? f.extra : 0))
  return {
    year: Number(f.today.slice(0, 4)) + years,
    balance,
    growth: Math.round(grown - paid),
    cover,
    stage: balance < 0 ? 0 : cover < 1 ? 1 : cover < BUFFER_MONTHS ? 2 : cover < BUFFER_MONTHS * 2 ? 3 : 4,
  }
}

// How much further ahead the changed future is after `years`.
export const gap = (f: Future, years: number) => at(f, years, true).balance - at(f, years, false).balance

// Years until today's habits empty the account; null when they never do.
export const runsOut = (f: Future) => (f.keep < 0 ? Math.max(0, f.balance) / (-f.keep * 12) : null)

// The calendar year in which that happens.
export function dryYear(f: Future): number | null {
  const dry = runsOut(f)
  if (dry === null) return null
  return Number(f.today.slice(0, 4)) + Math.floor((Number(f.today.slice(5, 7)) - 1 + dry * 12) / 12)
}

const eur = (n: number) => `${Math.round(n)} €`

// What the voice on the call knows about its own time, added to the customer
// summary. `changed`: which of the two futures is calling.
export function futureContext(f: Future, years: number, changed: boolean, age: number | null): string {
  const mine = at(f, years, changed)
  const other = at(f, years, !changed)
  const better = at(f, years, true)
  const dry = runsOut(f)
  const did = `did this: ${f.change}`
  return [
    `Future call: you are speaking from ${mine.year}, ${years} year(s) after ${f.today}.${age === null ? '' : ` You are ${age + years} years old; your younger self is ${age}.`}`,
    changed
      ? `In your past you ${did}. That kept about ${eur(f.extra)} more each month.`
      : `In your past you changed nothing: the same habits as today, every month, and the money stayed in the account.`,
    `- Money kept each month back then: ${eur(f.keep + (changed ? f.extra : 0))}${changed && invested(f) > 0 ? ', all of it invested in the market month after month' : ''}`,
    `- Money you have now, in ${mine.year}: ${eur(mine.balance)} (it was ${eur(f.balance)} on ${f.today})`,
    ...(changed && mine.growth > 0 ? [`- Of that, ${eur(mine.growth)} is growth: money the market added on top of what you paid in. It grows faster each year because the growth itself grows.`] : []),
    ...(!changed && dry !== null && dry <= years ? [`- Your account ran dry around ${dryYear(f)}; since then you have been below zero.`] : []),
    `- That pays for about ${Math.max(0, Math.round(mine.cover))} month(s) of your spending`,
    `- The other you, who ${changed ? 'changed nothing' : did}, has ${eur(other.balance)} in ${mine.year}: ${eur(Math.abs(mine.balance - other.balance))} ${changed ? 'less' : 'more'} than you. That pays for about ${Math.max(0, Math.round(other.cover))} month(s) of their spending.${!changed && better.growth > 0 ? ` ${eur(better.growth)} of theirs is growth from investing.` : ''}`,
    `- These are plain sums in today's euros with no pay rises or price changes. Invested money is assumed to grow ${Math.round(RETURN * 100)}% a year; real markets go up and down and can lose money.`,
  ].join('\n')
}
