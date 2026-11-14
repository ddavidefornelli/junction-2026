// The app is not the same for everyone: what a customer sees first depends on
// how their money is doing. `makeStatus` puts each customer in one of five
// modes from their own figures, and the overview takes its colour, its second
// headline figure, the order of its cards and Walter's opening questions from
// that mode (see Overview in App.tsx).
//
//   rescue  clearly more goes out than comes in, or the balance is below zero
//   build   positive, but less than BUFFER_MONTHS of spending saved
//   grow    the buffer is there; the next step is making money work
//   cruise  a high score and twice the buffer
//   start   not enough history to tell yet

import type { Transaction } from './api'
import type { Baskets } from './baskets.ts'
import { BUFFER_MONTHS, bufferPlanFor, dailyBalance } from './insights.ts'

export type Mode = 'start' | 'rescue' | 'build' | 'grow' | 'cruise'
// The parts of the overview whose order depends on the mode.
export type Part = 'future' | 'challenge' | 'insights'

export type Status = {
  mode: Mode
  name: string
  why: string // the customer's own figure that put them here
  focus: string // what the app does about it
  figure: string | null // the mode's own headline figure, under the balance
  caption: string | null
  progress: number | null // 0–1, towards the buffer (build only)
  accent: string // the app's colour in this mode
  starters: string[] // what Walter offers to talk about
  order: Part[]
  shown: number // how many insights are shown
}

export const CRUISE_SCORE = 80
// A shortfall under this share of spending is noise, not a leak.
const SHORT = 0.02

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`

const START: Status = {
  mode: 'start',
  name: 'Getting started',
  why: 'There is not enough account history yet to tell how your money is doing.',
  focus: 'Your app fills in as your transactions come in.',
  figure: null,
  caption: null,
  progress: null,
  accent: '#2b3fff',
  starters: ['How am I doing?', 'Where could I cut back?', 'What did I spend in the last two weeks?', 'What should I focus on first?'],
  order: ['challenge', 'insights', 'future'],
  shown: 4,
}

// `all` is every transaction, oldest first.
export function makeStatus(d: { score: number | null; baskets: Baskets | null; all: Transaction[] | null }): Status {
  const { score, baskets: b, all } = d
  if (!b || !all?.length || b.spending <= 0) return START
  const balance = dailyBalance(all).values.at(-1)!
  const kept = b.income - b.spending
  const cover = balance / b.spending // months of spending saved
  const target = BUFFER_MONTHS * b.spending

  const short = kept < -SHORT * b.spending
  if (short || balance < 0) {
    const left = short && balance > 0 ? Math.floor(balance / -kept) : null
    return {
      mode: 'rescue',
      name: 'Rescue mode',
      why: short ? `You spend ${eur(-kept)} more than you get each month.` : 'Your balance is below zero.',
      focus: 'Your app puts stopping the leak first.',
      figure: short ? `−${eur(-kept)}` : eur(balance),
      caption: short
        ? `a month, more out than in${left === null ? '' : `. At this pace the account is empty in ${months(left)}`}`
        : 'below zero today',
      progress: null,
      accent: '#c2410c',
      starters: ['Where is my money going?', 'What can I cut first?', 'How long will my money last?', 'Help me plan this month'],
      order: ['future', 'challenge', 'insights'],
      shown: 3,
    }
  }

  if (cover < BUFFER_MONTHS) {
    const plan = bufferPlanFor(all, b, balance)
    const wait = plan ? plan.months : null
    return {
      mode: 'build',
      name: 'Buffer mode',
      why: `You have ${cover.toFixed(1)} months of spending saved. The goal is ${BUFFER_MONTHS}.`,
      focus: 'Your app puts building your safety money first.',
      figure: `${cover.toFixed(1)} of ${BUFFER_MONTHS} months`,
      caption: `saved for bad days. ${eur(target - balance)} to go${wait === null ? '' : `: ${months(wait)} with your plan`}`,
      progress: Math.max(0, cover / BUFFER_MONTHS),
      accent: '#2b3fff',
      starters: [`How fast can I reach ${BUFFER_MONTHS} months saved?`, 'Where could I cut back?', 'What should I focus on first?', 'What did I spend in the last two weeks?'],
      order: ['challenge', 'insights', 'future'],
      shown: 4,
    }
  }

  if (score !== null && score >= CRUISE_SCORE && cover >= BUFFER_MONTHS * 2)
    return {
      mode: 'cruise',
      name: 'Cruise mode',
      why: `Your score is ${score} and you have ${months(Math.floor(cover))} of spending saved.`,
      focus: 'Your app stays out of the way and looks far ahead.',
      figure: months(Math.floor(cover)),
      caption: 'you could live on what you have',
      progress: null,
      accent: '#7a5c00',
      starters: ['How am I doing?', 'What could go wrong?', 'How does investing work?', 'What should I aim for next?'],
      order: ['future', 'insights', 'challenge'],
      shown: 2,
    }

  return {
    mode: 'grow',
    name: 'Growth mode',
    why: `You have ${months(Math.floor(cover))} of spending saved and keep ${eur(kept)} a month.`,
    focus: 'Your app puts making your money work first.',
    figure: eur(balance - target),
    caption: `above your ${BUFFER_MONTHS}-month safety money, earning nothing`,
    progress: null,
    accent: '#0b7a4b',
    starters: ['How does investing work?', 'How much could I put to work each month?', 'What is an index fund?', 'How am I doing?'],
    order: ['future', 'insights', 'challenge'],
    shown: 4,
  }
}
