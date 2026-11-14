// Challenges: a simple goal with a number and an end date, like "100 days,
// 1 000 €". They are offered from the customer's own data, planned (how long,
// how hard), accepted, and then tracked from the transactions that follow.
//
// "Today" is the date of the latest transaction, so progress moves with the
// account, not with the clock.

import type { Transaction } from './api'
import { basketOf, type Baskets } from './baskets.ts'
import { dailyBalance } from './insights.ts'
import type { Suggestion } from './mcc'

// save: spend less on fun extras. place: spend less at one kind of place.
// nospend: days with no fun extras at all. zero: keep the balance above zero.
export type Kind = 'save' | 'place' | 'nospend' | 'zero'

export type Offer = {
  kind: Kind
  name: string
  pitch: string // the customer's own figure that makes it worth doing
  lengths: number[] // days to choose from
  efforts: { label: string; share: number }[] // how hard; empty when there is nothing to choose
  usualPerDay: number // € a day spent now (save, place); 0 otherwise
  place?: { many: string; mcc: string }
}

// An accepted challenge, as it is stored.
export type Challenge = {
  kind: Kind
  start: string // "YYYY-MM-DD", the first day
  days: number
  target: number // € to save (save, place) or days to reach (nospend, zero)
  usualPerDay: number
  place?: { many: string; mcc: string }
  title: string
  rule: string // what to do, in one sentence
}

export type Progress = {
  day: number // 1…days
  days: number
  done: number // € saved or days reached so far
  target: number
  unit: 'eur' | 'days'
  state: 'on' | 'behind' | 'won' | 'missed'
  next: string // what to do now
  // Spending so far, day by day, against the most the challenge allows by the end…
  spent?: { byDay: number[]; allowed: number }
  // …or one mark for each day so far: reached or not.
  marks?: boolean[]
}

const DAY_MS = 86_400_000
const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS
const isoDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10)
const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const todayOf = (all: Transaction[]) => all[all.length - 1].tx_date

const isFun = (tx: Transaction) => basketOf(tx)?.basket === 'everyday'

// Up to three challenges that fit the customer. `all` is every transaction, oldest first.
export function makeOffers(d: { baskets: Baskets | null; tips: Suggestion[]; all: Transaction[] }): Offer[] {
  const { baskets: b, tips, all } = d
  if (!b || all.length === 0) return []
  const out: Offer[] = []
  const today = dayNumber(todayOf(all))

  const balances = dailyBalance(all).values.slice(-90)
  const below = balances.filter((v) => v < 0).length
  if (below > 0)
    out.push({
      kind: 'zero',
      name: 'Above zero',
      pitch: `Your balance was below zero on ${below} of the last ${balances.length} days.`,
      lengths: [14, 30, 60],
      efforts: [],
      usualPerDay: 0,
    })

  const fun = b.baskets.everyday.monthly
  if (fun >= 50)
    out.push({
      kind: 'save',
      name: 'The big save',
      pitch: `You spend ${eur(fun)} a month on eating out, fun and shopping.`,
      lengths: [30, 60, 100],
      efforts: [{ label: 'A fifth less', share: 0.2 }, { label: 'A third less', share: 1 / 3 }, { label: 'Half', share: 0.5 }],
      usualPerDay: fun / 30.44,
    })

  const tip = tips.find((t) => t.amount >= 30)
  if (tip)
    out.push({
      kind: 'place',
      name: `Fewer ${tip.many}`,
      pitch: `${eur(tip.amount)} a month goes to ${tip.many}.`,
      lengths: [30, 60, 100],
      efforts: [{ label: 'A third less', share: 1 / 3 }, { label: 'Half', share: 0.5 }, { label: 'None at all', share: 1 }],
      usualPerDay: tip.amount / 30.44,
      place: { many: tip.many, mcc: tip.mcc },
    })

  if (fun > 0) {
    const spendDays = new Set(all.filter((tx) => isFun(tx) && dayNumber(tx.tx_date) > today - 30).map((tx) => tx.tx_date))
    out.push({
      kind: 'nospend',
      name: 'Zero-euro days',
      pitch: `In the last 30 days you had ${plural(30 - spendDays.size, 'day')} with no fun extras.`,
      lengths: [14, 30, 60],
      efforts: [{ label: '3 a week', share: 3 / 7 }, { label: '4 a week', share: 4 / 7 }, { label: '5 a week', share: 5 / 7 }],
      usualPerDay: 0,
    })
  }
  return out.slice(0, 3)
}

// The challenge an offer becomes once its length and effort are chosen. Not yet started.
export function plan(o: Offer, days: number, share: number, start: string): Challenge {
  const base = { kind: o.kind, start, days, usualPerDay: o.usualPerDay, place: o.place }
  if (o.kind === 'zero')
    return { ...base, target: days, title: `${days} days above zero`, rule: 'Keep your balance at zero or more every day. Check it before you buy anything that is not rent, bills or food.' }
  if (o.kind === 'nospend') {
    const target = Math.round(days * share)
    return {
      ...base,
      target,
      title: `${target} zero-euro days in ${days} days`,
      rule: 'A zero-euro day is a day with no eating out, fun or shopping. Rent, bills and food do not count.',
    }
  }
  const target = round(days * o.usualPerDay * share, days * o.usualPerDay * share >= 100 ? 10 : 5)
  const weekly = Math.max(0, (o.usualPerDay - target / days) * 7)
  const what = o.kind === 'place' ? o.place!.many : 'fun extras'
  return {
    ...base,
    target,
    title: o.kind === 'place' && share === 1 ? `${days} days without ${what}` : `${days} days, ${eur(target)}`,
    rule: weekly < 1
      ? `Spend nothing at ${what}. You usually spend ${eur(o.usualPerDay * 7)} a week.`
      : `Spend at most ${eur(weekly)} a week on ${what}. You usually spend ${eur(o.usualPerDay * 7)}.`,
  }
}

// How an accepted challenge is going. `all` is every transaction, oldest first.
export function progress(c: Challenge, all: Transaction[]): Progress {
  const first = dayNumber(c.start)
  const today = Math.max(first, dayNumber(todayOf(all)))
  const day = Math.min(c.days, today - first + 1)
  const over = today - first + 1 >= c.days
  const left = c.days - day

  if (c.kind === 'save' || c.kind === 'place') {
    const counts = (tx: Transaction) => (c.kind === 'place' ? tx.mcc_code === c.place!.mcc && tx.tx_amount_eur < 0 : isFun(tx))
    const byDay = new Array<number>(day).fill(0)
    for (const tx of all) {
      const i = dayNumber(tx.tx_date) - first
      if (i >= 0 && i < day && counts(tx)) byDay[i] -= Number(tx.tx_amount_eur)
    }
    const spent = byDay.reduce((a, n) => a + n, 0)
    const perDay = Math.max(0, c.usualPerDay - c.target / c.days) // the most to spend a day
    const saved = c.usualPerDay * day - spent
    const room = perDay * day - spent
    const what = c.kind === 'place' ? c.place!.many : 'fun extras'
    const state = over ? (saved >= c.target ? 'won' : 'missed') : room >= -0.5 ? 'on' : 'behind'
    return {
      day,
      days: c.days,
      done: Math.max(0, saved),
      target: c.target,
      unit: 'eur',
      state,
      next: state === 'won'
        ? `You saved ${eur(saved)}. Move it to savings before it gets spent.`
        : state === 'missed'
        ? `You saved ${eur(Math.max(0, saved))} of ${eur(c.target)}. Try a shorter or easier one next.`
        : state === 'on'
        ? perDay * 7 < 1
          ? `Nothing spent at ${what}. Keep it that way.`
          : `You are ${eur(room)} under your limit. This week: at most ${eur(perDay * 7)} on ${what}.`
        : perDay > 0 && Math.ceil(-room / perDay) <= left
        ? `You are ${eur(-room)} over your limit. ${plural(Math.ceil(-room / perDay), 'day')} without ${what} puts you back on track.`
        : perDay > 0
        ? `You are ${eur(-room)} over your limit, more than the days left can make up. Keep to ${eur(perDay * 7)} a week from here, or stop and pick an easier one.`
        : `You spent ${eur(spent)} at ${what}. Stop here to save the rest.`,
      spent: { byDay, allowed: perDay * c.days },
    }
  }

  let marks: boolean[]
  if (c.kind === 'zero') {
    const history = dailyBalance(all)
    const at = new Map(history.days.map((d, i) => [d, history.values[i]]))
    marks = Array.from({ length: day }, (_, i) => (at.get(isoDay(first + i)) ?? 0) >= 0)
  } else {
    const spendDays = new Set(all.filter(isFun).map((tx) => tx.tx_date))
    marks = Array.from({ length: day }, (_, i) => !spendDays.has(isoDay(first + i)))
  }
  const done = marks.filter(Boolean).length
  const failed = c.kind === 'zero' ? done < day : done + left < c.target
  const state = done >= c.target ? 'won' : failed || over ? 'missed' : done >= Math.floor((c.target * day) / c.days) ? 'on' : 'behind'
  return {
    day,
    days: c.days,
    done,
    target: c.target,
    unit: 'days',
    state,
    next: state === 'won'
      ? c.kind === 'zero' ? `${plural(c.days, 'day')} above zero. You did it.` : `${plural(done, 'zero-euro day')}. You did it.`
      : state === 'missed'
      ? c.kind === 'zero' ? 'Your balance went below zero. Start again when you are ready.' : `You reached ${done} of ${c.target}. Try an easier one next.`
      : c.kind === 'zero'
      ? `${plural(left, 'day')} to go. Check your balance before each purchase.`
      : `${c.target - done} more to go, ${plural(left, 'day')} left.${state === 'behind' ? ' Make today one.' : ''}`,
    marks,
  }
}
