// The customer's goal for the year plus the bit of life context (household,
// housing, commute) that makes an analysis of their spending more accurate.
// Kept in this browser per customer; the bank API is read-only.

export const GOALS = [
  ['buffer', 'Build a safety buffer'],
  ['home', 'Save for a home'],
  ['debt', 'Pay off debt'],
  ['spend', 'Spend less'],
  ['other', 'Something else'],
] as const
export const DEADLINES = [
  ['3', '3 months'],
  ['6', '6 months'],
  ['12', '1 year'],
  ['24', '2 years'],
  ['60', '5 years'],
] as const
// A way of reaching the amount: how much a month, and so how long it takes.
export type PaceId = 'easy' | 'steady' | 'fast'
export type Pace = { id: PaceId; name: string; note: string; monthly: number; months: number }

// Always-reachable choices for `target`, between what the customer already
// sets aside a month (`usual`) and the most a plan could free (`max`).
// Empty only when there is nothing at all to set aside.
export function paceOptions(target: number, usual: number, max: number): Pace[] {
  const low = Math.max(0, usual)
  const saving = low >= 1 // already setting money aside: the easy pace needs no change
  const steps: [PaceId, string, string, number][] = [
    ['easy', 'Comfortable', saving ? 'No change to your spending' : 'Light trimming of your spending', saving ? 0 : 1 / 3],
    ['steady', 'Balanced', 'Some trimming of optional spending', saving ? 0.5 : 2 / 3],
    ['fast', 'Ambitious', 'Tight budgets every month', 1],
  ]
  const paces: Pace[] = []
  for (const [id, name, note, share] of steps) {
    const monthly = Math.floor(low + share * (max - low))
    if (monthly < 1) continue
    const months = Math.ceil(target / monthly)
    // A small amount can take the same time at every pace: offer it once, at the easiest.
    if (!paces.some((p) => p.months === months)) paces.push({ id, name, note, monthly, months })
  }
  return paces
}

export const COUNTS_ADULTS = [['1', '1'], ['2', '2'], ['3+', '3+']] as const
export const COUNTS_CHILDREN = [['0', '0'], ['1', '1'], ['2', '2'], ['3+', '3+']] as const
export const HOUSING = [
  ['rent', 'Rent'],
  ['mortgage', 'Own, with a mortgage'],
  ['own', 'Own, no mortgage'],
  ['family', 'With family'],
] as const
export const COMMUTE_KM = [
  ['none', 'No commute'],
  ['<5', 'Under 5 km'],
  ['5-20', '5–20 km'],
  ['20-50', '20–50 km'],
  ['50+', 'Over 50 km'],
] as const
export const COMMUTE_MODE = [
  ['car', 'Car'],
  ['transit', 'Public transport'],
  ['active', 'Bike or walk'],
] as const

type Id<T extends readonly (readonly [string, string])[]> = T[number][0]

export type GoalProfile = {
  year: number
  goal: Id<typeof GOALS>
  goalText: string // the customer's own words, when goal is 'other'
  targetEur: number | null
  deadlineMonths?: number | null // how long the customer gave themselves…
  setAt?: string // …counted from this day (ISO date)
  pace?: PaceId | null // the pace that length came from, when it was picked as one
  adults: Id<typeof COUNTS_ADULTS> | null
  children: Id<typeof COUNTS_CHILDREN> | null
  housing: Id<typeof HOUSING> | null
  commuteKm: Id<typeof COMMUTE_KM> | null
  commuteMode: Id<typeof COMMUTE_MODE> | null
}

const key = (customerId: string) => `goalProfile:${customerId}`

export function loadGoalProfile(customerId: string): GoalProfile | null {
  try {
    const raw = localStorage.getItem(key(customerId))
    return raw ? (JSON.parse(raw) as GoalProfile) : null
  } catch {
    return null
  }
}

export function saveGoalProfile(customerId: string, profile: GoalProfile) {
  try {
    localStorage.setItem(key(customerId), JSON.stringify(profile))
  } catch {
    // Storage unavailable (private window): the goal still lives for this visit.
  }
}

const text = (options: readonly (readonly [string, string])[], id: string | null) =>
  options.find(([value]) => value === id)?.[1] ?? null

const euros = (n: number) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

// The goal in words only, e.g. "Save for a home". This is the `goal` for
// classify() in api.ts: Laya's questions were tuned on plain goal sentences,
// so the amount stays out.
export const goalLabel = (p: GoalProfile): string =>
  p.goal === 'other' ? p.goalText : text(GOALS, p.goal)!

// The month the goal should be reached, or null when no deadline was given.
export function deadline(p: GoalProfile): Date | null {
  if (!p.deadlineMonths || !p.setAt) return null
  const d = new Date(p.setAt)
  return new Date(d.getFullYear(), d.getMonth() + Number(p.deadlineMonths), 1)
}

// Whole months from today to the deadline, at least 1; null without a deadline.
export function monthsLeft(p: GoalProfile, today = new Date()): number | null {
  const d = deadline(p)
  if (!d) return null
  return Math.max(1, (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth())
}

// "11/2028"
export const monthYear = (d: Date) => `${d.getMonth() + 1}/${d.getFullYear()}`

// The goal as shown to the customer, e.g. "Save for a home (20 000 € by 11/2028)".
export function goalStatement(p: GoalProfile): string {
  if (!p.targetEur) return goalLabel(p)
  const d = deadline(p)
  return `${goalLabel(p)} (${euros(p.targetEur)}${d ? ` by ${monthYear(d)}` : ''})`
}

// Everything the customer told us, as plain sentences for an AI prompt.
export function profileSummary(p: GoalProfile): string {
  const parts = [`Goal for ${p.year}: ${goalStatement(p)}.`]
  if (p.adults || p.children) {
    const household = [
      p.adults && `${p.adults} adult${p.adults === '1' ? '' : 's'}`,
      p.children && `${p.children} child${p.children === '1' ? '' : 'ren'}`,
    ].filter(Boolean)
    parts.push(`Household: ${household.join(', ')}.`)
  }
  if (p.housing) parts.push(`Housing: ${text(HOUSING, p.housing)!.toLowerCase()}.`)
  if (p.commuteKm === 'none') parts.push('No commute to work.')
  else if (p.commuteKm) {
    const mode = text(COMMUTE_MODE, p.commuteMode)?.toLowerCase()
    parts.push(
      `Commute: ${text(COMMUTE_KM, p.commuteKm)!.toLowerCase()} each way${mode ? ` by ${mode}` : ''}.`,
    )
  }
  return parts.join(' ')
}
