// How the customer's spending compares with Finns of the same age, from open
// population data (Statistics Finland), in the spirit of MyData: the customer's
// own figures next to a public reference, never a verdict.
//
// Source: Statistics Finland, Household Budget Survey 2022, table 14q4
// "Household consumption expenditure by age of reference person", monthly
// euros per consumption unit at current prices
// (https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__ktutk/statfin_ktutk_pxt_14q4.px/).
// Per consumption unit means per adult equivalent: a person living alone is one
// unit, so the figures read as "what one person spends". Grouped below by COICOP
// code into the bank's categories:
//   Groceries      01 food and non-alcoholic beverages
//   Restaurants    11.1 food and beverage serving services
//   Transportation 07.2 running a vehicle, 07.3.1/2/5 rail, road and combined transport
//   Travel         07.3.3/4 air and sea, 09.8 package holidays, 11.2 accommodation
//   Entertainment  09.4 recreational services, 09.6 cultural services
//   Lifestyle      03 clothing and footwear, 09.2 other recreational goods, 09.5 cultural goods, 09.7 books and papers
//   Home & Tech    05 furnishings and household equipment, 08.1/2 devices and software
//   Health         06 health
// Housing and utilities are left out: the survey averages renters and owners
// (owners pay no rent), so a reference for them would mislead.
//
// Prices: the survey is from 2022. Its figures are raised by the change in the
// Consumer Price Index from 2022 to 2025 (113.36 → 122.74, 2015=100, Statistics
// Finland table 11xc), so they read in today's money.
//
// The dataset's own amounts are synthetic (see docs/spending-insights.md), so on
// demo customers some gaps are large; with real S-Bank data they would not be.

import type { Transaction } from './api'

export const CPI_2022_TO_2025 = 122.74 / 113.36

export const BENCHMARK_SOURCE = 'Statistics Finland, Household Budget Survey 2022, at 2025 prices'

const CATEGORIES = ['Groceries', 'Restaurants', 'Transportation', 'Travel', 'Entertainment', 'Lifestyle', 'Home & Tech', 'Health'] as const
type Category = (typeof CATEGORIES)[number]

// Euros a month per adult equivalent, 2022 prices, by age of the household's reference person.
const SURVEY: Record<string, Record<Category, number>> = {
  all: { Groceries: 329, Restaurants: 79, Transportation: 163, Travel: 45, Entertainment: 48, Lifestyle: 143, 'Home & Tech': 130, Health: 86 },
  '17–24': { Groceries: 210, Restaurants: 67, Transportation: 88, Travel: 30, Entertainment: 30, Lifestyle: 135, 'Home & Tech': 94, Health: 45 },
  '25–34': { Groceries: 292, Restaurants: 112, Transportation: 149, Travel: 40, Entertainment: 42, Lifestyle: 177, 'Home & Tech': 152, Health: 46 },
  '35–44': { Groceries: 332, Restaurants: 110, Transportation: 158, Travel: 58, Entertainment: 51, Lifestyle: 154, 'Home & Tech': 163, Health: 59 },
  '45–54': { Groceries: 346, Restaurants: 87, Transportation: 211, Travel: 67, Entertainment: 59, Lifestyle: 168, 'Home & Tech': 141, Health: 83 },
  '55–64': { Groceries: 360, Restaurants: 86, Transportation: 208, Travel: 53, Entertainment: 60, Lifestyle: 150, 'Home & Tech': 136, Health: 100 },
  '65–74': { Groceries: 362, Restaurants: 51, Transportation: 165, Travel: 36, Entertainment: 42, Lifestyle: 115, 'Home & Tech': 111, Health: 105 },
  '75–84': { Groceries: 337, Restaurants: 38, Transportation: 123, Travel: 34, Entertainment: 43, Lifestyle: 99, 'Home & Tech': 90, Health: 146 },
  '85+': { Groceries: 276, Restaurants: 25, Transportation: 61, Travel: 5, Entertainment: 18, Lifestyle: 82, 'Home & Tech': 86, Health: 126 },
}

// The survey's age group for an age; 'all' when the age is unknown or under 17.
export function ageGroup(age: number | null): string {
  if (age == null || age < 17) return 'all'
  if (age < 25) return '17–24'
  if (age >= 85) return '85+'
  const low = Math.floor((age - 5) / 10) * 10 + 5
  return `${low}–${low + 9}`
}

export type BenchmarkLine = {
  category: Category
  you: number // the customer's average a month
  typical: number // the survey's figure for their age group, at 2025 prices
  ratio: number // you / typical
}

export type Benchmark = {
  group: string // the age group, or 'all'
  months: number // full months the customer's average is taken over
  lines: BenchmarkLine[] // biggest gap in euros first
  you: number // sum over the compared categories
  typical: number
}

// The customer's spending per category, averaged over `months` (the baskets'
// full months, "YYYY-MM"), next to the survey's figure for their age.
export function makeBenchmark(all: Transaction[], months: string[], age: number | null): Benchmark | null {
  if (months.length === 0) return null
  const window = new Set(months)
  const spent = new Map<Category, number>()
  for (const tx of all) {
    if (!window.has(tx.tx_date.slice(0, 7)) || tx.transaction_type !== 'purchase' || tx.tx_amount_eur >= 0) continue
    const category = tx.category as Category
    if (!CATEGORIES.includes(category)) continue
    spent.set(category, (spent.get(category) ?? 0) - tx.tx_amount_eur)
  }
  const group = ageGroup(age)
  const lines = CATEGORIES.map((category) => {
    const you = (spent.get(category) ?? 0) / months.length
    const typical = SURVEY[group][category] * CPI_2022_TO_2025
    return { category, you, typical, ratio: you / typical }
  })
    .filter((l) => l.you > 0 || l.typical >= 20)
    .sort((a, b) => Math.abs(b.you - b.typical) - Math.abs(a.you - a.typical))
  const sum = (k: 'you' | 'typical') => lines.reduce((s, l) => s + l[k], 0)
  return { group, months: months.length, lines, you: sum('you'), typical: sum('typical') }
}

// "About the same", "38% more", "20% less": the gap in plain words.
export function gapWords(ratio: number): string {
  if (!Number.isFinite(ratio)) return 'more'
  const pct = Math.round((ratio - 1) * 100)
  if (Math.abs(pct) < 10) return 'about the same'
  if (ratio >= 2) return `${Math.round(ratio * 10) / 10}× as much`
  return pct > 0 ? `${pct}% more` : `${-pct}% less`
}
