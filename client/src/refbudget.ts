// The "reasonable minimum" reference budgets of the Consumer Research Centre,
// University of Helsinki (Kohtuullisen minimin viitebudjetit, tables 1 and 2,
// published 19.11.2025): what a household needs a month for a modest life it
// can take part in society on. The plan compares the customer's spending with
// the budget of their kind of household, and calls a plan tight when it would
// take them close to it.
//
// Source table: https://www.sttinfo.fi/files/3747/71619537/296749/fi

import type { Transaction } from './api'
import type { GoalProfile } from './goal'

// Euros a month in 2025, in the order of the published rows:
// food; clothing; telecoms and electronics; home durables; home consumables;
// hygiene; health care; leisure; getting around in the capital region
// (public transport; every customer in the data lives there).
// Housing, electricity and insurance are left out: the plan never budgets them.
type Row = [number, number, number, number, number, number, number, number, number]
const TABLE = {
  manUnder45: [312, 58, 93, 32, 22, 40, 22, 48, 96],
  womanUnder45: [256, 53, 93, 32, 22, 52, 30, 48, 96],
  couple: [567, 111, 132, 39, 32, 82, 47, 97, 184], // both 50
  parentChild3: [349, 119, 93, 40, 31, 56, 35, 54, 103],
  parentChild14: [459, 125, 132, 41, 33, 74, 36, 100, 139],
  parentChildren10and13: [635, 194, 172, 57, 44, 91, 42, 165, 179],
  parentsChildren2and6: [807, 236, 138, 63, 48, 99, 55, 118, 194],
  parentsChildren4and10: [844, 245, 172, 64, 48, 104, 55, 159, 231],
  parentsTeens2: [1020, 268, 207, 64, 48, 129, 57, 195, 269],
  parentsTeens3: [1210, 339, 242, 68, 55, 144, 63, 260, 309],
} satisfies Record<string, Row>

// How the published rows line up with the bank's categories.
export const GROUPS = {
  food: 'Food, including eating out',
  clothing: 'Clothing',
  leisure: 'Leisure, hobbies and travel',
  health: 'Health and hygiene',
  home: 'Home, tech and telecoms',
  transport: 'Getting around',
} as const
export type Group = keyof typeof GROUPS

const BY_CATEGORY: Record<string, Group> = {
  Groceries: 'food',
  Restaurants: 'food',
  Entertainment: 'leisure',
  Travel: 'leisure',
  Lifestyle: 'leisure',
  Health: 'health',
  'Home & Tech': 'home',
  Transportation: 'transport',
}
const CLOTHING_MCC = new Set(['5651', '5691']) // the part of Lifestyle that is clothes

export const groupOf = (tx: Pick<Transaction, 'category' | 'mcc_code'>): Group | undefined =>
  CLOTHING_MCC.has(tx.mcc_code ?? '') ? 'clothing' : BY_CATEGORY[tx.category ?? '']

export type Reference = {
  household: string // the published household the figures are for
  exact: boolean // false when the customer's household is not published and this is the closest
  amounts: Partial<Record<Group, number>> // euros a month
}

const amounts = ([food, clothing, telecoms, durables, consumables, hygiene, health, leisure, transport]: number[]) => ({
  food,
  clothing,
  leisure,
  health: health + hygiene,
  home: telecoms + durables + consumables,
  transport,
})

// The reference budget for the customer's household, or null when they did not
// describe it or nothing published is close (three or more adults).
// The customer gives head counts only, so where the published budgets differ
// by age or sex the choice errs on the generous side: a reference that is too
// low would call comfortable spending excessive.
export function referenceFor(goal: GoalProfile): Reference | null {
  if (!goal.adults || goal.adults === '3+') return null
  const key = `${goal.adults}+${goal.children ?? '0'}`
  const single = TABLE.manUnder45.map((n, i) => (n + TABLE.womanUnder45[i]) / 2) // sex unknown
  const pick: Record<string, [string, number[], boolean]> = {
    '1+0': ['one adult under 45', single, true],
    '2+0': ['a couple', TABLE.couple, true],
    '1+1': ['one parent and a teenager', TABLE.parentChild14, true],
    '1+2': ['one parent and two school-age children', TABLE.parentChildren10and13, true],
    '1+3+': ['one parent and two school-age children', TABLE.parentChildren10and13, false],
    '2+1': ['two parents and two small children', TABLE.parentsChildren2and6, false],
    '2+2': ['two parents and two children', TABLE.parentsChildren4and10, true],
    '2+3+': ['two parents and three teenagers', TABLE.parentsTeens3, true],
  }
  const [household, row, exact] = pick[key]
  const result: Reference = { household, exact, amounts: amounts(row) }
  // The published figure assumes public transport; it says nothing about a car commute.
  if (goal.commuteMode === 'car') delete result.amounts.transport
  return result
}
