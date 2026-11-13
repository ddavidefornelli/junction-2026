// Turns the goal into monthly budgets, the way budgeting apps do it:
//   1. the goal becomes a monthly amount to set aside (target / months left);
//   2. that is compared with what the customer usually sets aside;
//   3. the gap is taken out of their usual spending, budget line by budget line, and how
//      much each line gives up depends on the household (see maxCut). A line is a
//      category, or a kind of place the MCC sets apart from it (see lineOf). No
//      group of lines is cut below the reference budget of the household;
//   4. a purchase is flagged only once its line has passed its budget for that month.
// Laya decides which kinds of purchase are optional for the goal (the verdicts);
// everything else here is arithmetic on the customer's own history.

import { verdictKey, type Transaction, type Verdict } from './api'
import { monthsLeft, type GoalProfile } from './goal'
import { kindOf } from './mcc'
import { GROUPS, groupOf, referenceFor, type Group } from './refbudget'

const BASELINE_MONTHS = 6 // "usual" = average of the last full months before the current one; long enough to smooth categories that skip months
const MAX_CUT = 0.5 // an optional category gives up at most half, before household adjustments
const SPEND_LESS_CUT = 0.1 // "Spend less" with no amount: 10% under usual
const TIGHT_MARGIN = 1.1 // a plan is tight when it leaves under 10% above the reference budget

export type CategoryBudget = {
  category: string // the budget line: a category, or a kind of place such as "Taxis"
  usual: number // average monthly spend in the baseline months
  budget: number // monthly budget under the plan
  spent: number // spent so far in the current month
}

// The customer's everyday spending next to the reference budget of their household.
export type Benchmark = {
  household: string
  exact: boolean // false: the closest published household, not the customer's own
  rows: {
    name: string
    usual: number // spent a month in the baseline months
    planned: number // what the plan's budgets leave of that
    reference: number // the reasonable minimum
    floored: boolean // the minimum limits how far this group's budgets can be cut
  }[]
}

export type Plan = {
  month: string // "YYYY-MM" of the latest transaction: the month `spent` refers to
  usualSaving: number // average monthly income minus spending, in the baseline months
  requiredSaving: number | null // null when the goal has no amount and date
  maxSaving: number // the most the plan can set aside a month: usual saving plus every cut at its maximum
  reachable: boolean // false when the goal needs more than maxSaving
  // True when the goal is out of reach, or the plan leaves everyday spending
  // within TIGHT_MARGIN of the reference budget (or it is already below it).
  tight: boolean
  benchmark: Benchmark | null // null when the household is unknown
  householdNote: string | null // how the household shaped the budgets, for the customer
  categories: CategoryBudget[] // budgeted categories, biggest first
  overBudget: Set<string> // txId of each purchase made after its budget ran out
}

// Transactions carry no id of their own.
export const txId = (tx: Transaction) =>
  `${tx.bank_account_id}|${tx.tx_timestamp}|${tx.tx_amount_eur}|${tx.category}`

// People at home, or null when the customer did not say. "3+" counts as 3.
function householdSize(goal: GoalProfile): number | null {
  if (!goal.adults && !goal.children) return null
  return parseInt(goal.adults ?? '1') + parseInt(goal.children ?? '0')
}

const FOOD = /grocer/i
const TRANSPORT = /transport|fuel/i
const DINING = /restaurant/i

// The largest share of its usual spend a category can be asked to give up.
// Optional categories start at MAX_CUT and everyday essentials at 0; the
// household then shifts that, the way reference budgets differ by household:
//   - a family's groceries and transport are fixed costs, while eating out
//     multiplies per head, so it is trimmed first;
//   - one person has room to trim groceries and transport a little, and eating
//     out is a bigger part of a normal life, so it is trimmed gently.
// A long commute by car makes transport a fixed cost for anyone.
function maxCut(category: string, optional: boolean, goal: GoalProfile): number {
  const size = householdSize(goal)
  const one = size === 1
  const family = size !== null && size >= 3
  if (DINING.test(category) && optional) return MAX_CUT * (one ? 0.5 : family ? 1.5 : 1)
  if (FOOD.test(category) || TRANSPORT.test(category)) {
    const longDrive =
      goal.commuteMode === 'car' && (goal.commuteKm === '20-50' || goal.commuteKm === '50+')
    if (TRANSPORT.test(category) && longDrive) return 0
    return size === null || family ? 0 : one ? 0.2 : 0.1
  }
  return optional ? MAX_CUT : 0
}

function householdNote(goal: GoalProfile): string | null {
  const size = householdSize(goal)
  if (size === null) return null
  if (size === 1)
    return 'Adjusted for one person: eating out is trimmed gently, and groceries and transport share a little of the saving.'
  if (size >= 3)
    return `Adjusted for a household of ${size}${goal.adults === '3+' || goal.children === '3+' ? ' or more' : ''}: groceries and transport are left alone, and eating out is trimmed first.`
  return 'Adjusted for two people: groceries and transport are trimmed only slightly.'
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
  // Usual monthly spend per reference group ('' = in none), split by budget line ('' = not budgeted).
  const byGroup = new Map<Group | '', Map<string, number>>()
  let net = 0
  for (const tx of all) {
    if (!baseline.has(monthOf(tx))) continue
    // Money moved into savings ("good") leaves the account but is not spent.
    if (verdictOf(tx) !== 'good') net += tx.tx_amount_eur
    if (tx.tx_amount_eur >= 0 || verdictOf(tx) === 'good') continue
    const line = lineOf(tx)
    const share = line
      ? (flex.get(line) ?? kindOf(tx)?.cut ?? maxCut(line, verdictOf(tx) === 'bad', goal))
      : 0
    const group = groupOf(tx) ?? ''
    const lines = byGroup.get(group) ?? new Map<string, number>()
    const key = line && share > 0 ? line : ''
    byGroup.set(group, lines.set(key, (lines.get(key) ?? 0) - tx.tx_amount_eur / baseline.size))
    if (!line || share === 0) continue
    flex.set(line, share)
    usual.set(line, (usual.get(line) ?? 0) - tx.tx_amount_eur / baseline.size)
  }
  const usualSaving = net / baseline.size
  const sum = (f: (category: string, amount: number) => number) =>
    [...usual].reduce((total, [category, amount]) => total + f(category, amount), 0)

  // The reference budget is a floor: together, the lines of a group give up no
  // more than what the customer spends above the reasonable minimum for it.
  // `held` is the share of its largest cut each group can still make (1 = all).
  const reference = referenceFor(goal)
  const held = new Map<Group | '', number>()
  const room = new Map<string, number>() // euros a month each line can give up at most
  for (const [group, lines] of byGroup) {
    const spend = [...lines.values()].reduce((total, amount) => total + amount, 0)
    const most = [...lines].reduce((total, [line, amount]) => total + amount * (flex.get(line) ?? 0), 0)
    const floor = group ? reference?.amounts[group] : undefined
    const share = floor === undefined || most === 0 ? 1 : Math.min(1, Math.max(0, spend - floor) / most)
    held.set(group, share)
    for (const [line, amount] of lines)
      if (line) room.set(line, (room.get(line) ?? 0) + amount * flex.get(line)! * share)
  }
  const capacity = sum((line) => room.get(line)!) // the most the plan can free

  const left = monthsLeft(goal, today)
  const requiredSaving = goal.targetEur && left ? goal.targetEur / left : null
  const cut =
    requiredSaving !== null
      ? Math.max(0, requiredSaving - usualSaving)
      : goal.goal === 'spend'
        ? Math.min(capacity, sum((_, amount) => amount) * SPEND_LESS_CUT) // as far as the floor allows
        : 0
  const reachable = cut <= capacity
  // Every line gives up the same fraction of its own maximum.
  const effort = capacity > 0 ? Math.min(1, cut / capacity) : 0

  const budgets = new Map(
    [...usual].map(([line, amount]) => [line, Math.round(amount - room.get(line)! * effort)]),
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

  const rows = (Object.keys(GROUPS) as Group[]).flatMap((group) => {
    const amount = reference?.amounts[group]
    if (amount === undefined) return []
    const lines = [...(byGroup.get(group) ?? [])]
    return {
      name: GROUPS[group],
      usual: lines.reduce((total, [, spend]) => total + spend, 0),
      planned: lines.reduce(
        (total, [line, spend]) => total + spend * (1 - (flex.get(line) ?? 0) * (held.get(group) ?? 1) * effort),
        0,
      ),
      reference: amount,
      floored: (held.get(group) ?? 1) < 1,
    }
  })
  const total = (f: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + f(row), 0)

  return {
    month,
    usualSaving,
    requiredSaving,
    maxSaving: usualSaving + capacity,
    reachable,
    tight: !reachable || (rows.length > 0 && total((r) => r.planned) <= total((r) => r.reference) * TIGHT_MARGIN),
    benchmark: reference && { household: reference.household, exact: reference.exact, rows },
    householdNote: householdNote(goal),
    overBudget,
    categories: [...usual]
      .map(([category, amount]) => ({
        category,
        usual: amount,
        budget: budgets.get(category)!,
        spent: spent.get(`${month}|${category}`) ?? 0,
      }))
      .sort((a, b) => b.usual - a.usual),
  }
}
