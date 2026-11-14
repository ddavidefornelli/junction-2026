// Turns the goal into monthly budgets, the way budgeting apps do it:
//   1. the goal becomes a monthly amount to set aside (target / months left);
//   2. that is compared with what the customer usually sets aside;
//   3. the gap is taken out of their usual spending, budget line by budget line
//      (see maxCut). A line is a category, or a kind of place the MCC sets apart
//      from it (see lineOf);
//   4. a purchase is flagged only once its line has passed its budget for that month;
//   5. the budgets, spread evenly over the month, give what is safe to spend this week.
//      Basket 1 and 2 costs (rent, bills, food, surprises) sit outside the budgets,
//      so this is money for the everyday basket only.
// Laya decides which kinds of purchase are optional for the goal (the verdicts);
// everything else here is arithmetic on the customer's own history.

import { verdictKey, type Transaction, type Verdict } from './api'
import { monthsLeft, type GoalProfile } from './goal'
import { kindOf } from './mcc'

const BASELINE_MONTHS = 6 // "usual" = average of the last full months before the current one; long enough to smooth categories that skip months
const MAX_CUT = 0.5 // an optional category gives up at most half
const SPEND_LESS_CUT = 0.1 // "Spend less" with no amount: 10% under usual

export type CategoryBudget = {
  category: string // the budget line: a category, or a kind of place such as "Taxis"
  usual: number // average monthly spend in the baseline months
  budget: number // monthly budget under the plan
  spent: number // spent so far in the current month
}

export type Plan = {
  month: string // "YYYY-MM" of the latest transaction: the month `spent` refers to
  usualSaving: number // average monthly income minus spending, in the baseline months
  requiredSaving: number | null // null when the goal has no amount and date
  maxSaving: number // the most the plan can set aside a month: usual saving plus every cut at its maximum
  reachable: boolean // false when the goal needs more than maxSaving
  categories: CategoryBudget[] // budgeted categories, biggest first
  budgetTotal: number // all monthly budgets together
  remaining: number // what is left of them in `month`, never below 0
  safeThisWeek: number // a week's share of budgetTotal, but no more than `remaining`
  capped: boolean // true when `remaining` set safeThisWeek, not the week's share
  overBudget: Set<string> // txId of each purchase made after its budget ran out
}

// Transactions carry no id of their own.
export const txId = (tx: Transaction) =>
  `${tx.bank_account_id}|${tx.tx_timestamp}|${tx.tx_amount_eur}|${tx.category}`

const FOOD = /grocer/i
const TRANSPORT = /transport|fuel/i

// The largest share of its usual spend a category can be asked to give up:
// half of what is optional for the goal, and nothing of everyday essentials
// (groceries and transport stay as they are, whatever the verdict).
function maxCut(category: string, optional: boolean): number {
  if (FOOD.test(category) || TRANSPORT.test(category)) return 0
  return optional ? MAX_CUT : 0
}

// The budget line a purchase counts towards. The MCC sets some kinds of place
// apart from their category: taxis are optional though transport is not, and
// bars can give up more than restaurants. Null for what is never budgeted
// (health care, whatever its category's verdict).
function lineOf(tx: Transaction): string | null {
  const kind = kindOf(tx)
  return kind?.cut === 0 ? null : (kind?.line ?? tx.category)
}

// `all` is every transaction of the customer, oldest first.
export function makePlan(
  goal: GoalProfile,
  all: Transaction[],
  verdicts: Record<string, Verdict>,
  today = new Date(),
): Plan | null {
  if (all.length === 0) return null
  const monthOf = (tx: Transaction) => tx.tx_date.slice(0, 7)
  const months = [...new Set(all.map(monthOf))].sort()
  const month = months[months.length - 1]
  const baseline = new Set(months.slice(0, -1).slice(-BASELINE_MONTHS))
  if (baseline.size === 0) return null // one month of history: nothing to call "usual"

  const verdictOf = (tx: Transaction) => verdicts[verdictKey(tx) ?? '']
  // Usual monthly spend and largest cut of every budget line that can give something up.
  const usual = new Map<string, number>()
  const flex = new Map<string, number>()
  let net = 0
  for (const tx of all) {
    if (!baseline.has(monthOf(tx))) continue
    // Money moved into savings ("good") leaves the account but is not spent.
    if (verdictOf(tx) !== 'good') net += tx.tx_amount_eur
    if (tx.tx_amount_eur >= 0 || verdictOf(tx) === 'good') continue
    const line = lineOf(tx)
    const share = line
      ? (flex.get(line) ?? kindOf(tx)?.cut ?? maxCut(line, verdictOf(tx) === 'bad'))
      : 0
    if (!line || share === 0) continue
    flex.set(line, share)
    usual.set(line, (usual.get(line) ?? 0) - tx.tx_amount_eur / baseline.size)
  }
  const usualSaving = net / baseline.size
  const sum = (f: (category: string, amount: number) => number) =>
    [...usual].reduce((total, [category, amount]) => total + f(category, amount), 0)

  const capacity = sum((line, amount) => amount * flex.get(line)!) // the most the plan can free

  const left = monthsLeft(goal, today)
  const requiredSaving = goal.targetEur && left ? goal.targetEur / left : null
  const cut =
    requiredSaving !== null
      ? Math.max(0, requiredSaving - usualSaving)
      : goal.goal === 'spend'
        ? sum((_, amount) => amount) * SPEND_LESS_CUT
        : 0
  const reachable = cut <= capacity
  // Every line gives up the same fraction of its own maximum.
  const effort = capacity > 0 ? Math.min(1, cut / capacity) : 0

  const budgets = new Map(
    [...usual].map(([line, amount]) => [line, Math.round(amount * (1 - flex.get(line)! * effort))]),
  )
  const spent = new Map<string, number>() // "month|line" -> running total
  const overBudget = new Set<string>()
  for (const tx of all) {
    const line = lineOf(tx)
    const budget = line ? budgets.get(line) : undefined
    if (budget === undefined || tx.tx_amount_eur >= 0 || verdictOf(tx) === 'good') continue
    const key = `${monthOf(tx)}|${line}`
    const total = (spent.get(key) ?? 0) - tx.tx_amount_eur
    spent.set(key, total)
    if (total > budget) overBudget.add(txId(tx))
  }

  const categories = [...usual]
    .map(([category, amount]) => ({
      category,
      usual: amount,
      budget: budgets.get(category)!,
      spent: spent.get(`${month}|${category}`) ?? 0,
    }))
    .sort((a, b) => b.usual - a.usual)
  // A week's share of the month, the same on any day: spreading what is left over
  // the days left would hand the whole month's leftovers to its last day.
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const budgetTotal = categories.reduce((total, c) => total + c.budget, 0)
  const remaining = Math.max(0, categories.reduce((total, c) => total + c.budget - c.spent, 0))
  const weekShare = (budgetTotal * 7) / daysInMonth

  return {
    month,
    budgetTotal,
    remaining,
    safeThisWeek: Math.min(remaining, weekShare),
    capped: remaining < weekShare,
    usualSaving,
    requiredSaving,
    maxSaving: usualSaving + capacity,
    reachable,
    overBudget,
    categories,
  }
}
