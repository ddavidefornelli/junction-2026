// Walter's lookups: exact answers computed from the customer's transactions, so
// the model never adds up amounts or counts days itself (chat.ts offers these to
// it as tools). Self-contained on purpose: it runs on the server next to
// chat.ts, where an import from src/ would not resolve (see api/[resource].ts).

// What a transaction is: a purchase or a bill (housing, utilities) is spending; the rest is not.
export type Flow = 'purchase' | 'bill' | 'income' | 'savings' | 'other'

// One transaction as the browser sends it, oldest first:
// [when "YYYY-MM-DDTHH:MM", euros (negative: money out), category, kind of place
//  or null, flow, basket or null, balance of the account(s) afterwards]
export type Row = [string, number, string, string | null, Flow, string | null, number]

export type Entry = {
  date: string
  time: string
  amount: number
  category: string
  kind: string | null
  flow: Flow
  basket: string | null
  balance: number
}

// What a lookup found, shown to the customer next to the reply that rests on it.
export type Lookup = {
  title: string
  from: string
  to: string
  count: number | null // transactions matched; null for a balance lookup
  total: number | null
  rows: { label: string; amount: number; date?: string }[] // groups, or the transactions themselves
  more: number // rows left out
}

const DAY = 86_400_000
const STALE_DAYS = 31 // older data than this: "today" is the day of the latest transaction
const MAX_ROWS = 20_000
const MAX_GROUPS = 62
const MAX_LIST = 25
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WHATS = ['spending', 'purchases', 'bills', 'income', 'savings', 'all']
const GROUPS = ['category', 'kind', 'basket', 'month', 'week', 'day', 'weekday']
const SORTS = ['newest', 'oldest', 'largest', 'smallest']
const FLOW_OF: Record<string, Flow> = { spending: 'purchase', purchases: 'purchase', bills: 'bill', income: 'income', savings: 'savings' }
const TOTAL_IS: Record<string, string> = {
  spending: 'euros spent',
  purchases: 'euros spent on purchases, bills left out',
  bills: 'euros paid in housing and utilities bills',
  income: 'euros received',
  savings: 'euros moved to savings and investments, net of withdrawals',
  all: 'net change in euros: money in minus money out',
}

const toDay = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (d: string, n: number) => iso(toDay(d) + n * DAY)
const daysFrom = (a: string, b: string) => Math.round((toDay(b) - toDay(a)) / DAY)
// First day of the month `n` months from the month of `d`.
const addMonths = (d: string, n: number) => iso(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1))
const monthEnd = (d: string) => addDays(addMonths(d, 1), -1)
const weekday = (d: string) => (new Date(toDay(d)).getUTCDay() + 6) % 7 // 0 = Monday
const monday = (d: string) => addDays(d, -weekday(d))
const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDay(s)) && iso(toDay(s)) === s
const cents = (n: number) => Math.round(n * 100) / 100
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// "2026-08-08" -> "8 August 2026": a date the model can copy into its reply instead of converting it.
const inWords = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

// The rows of a request, checked. Null when they are not what the browser sends.
export function parseLedger(raw: unknown): Entry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ROWS) return null
  const name = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 40
  const out: Entry[] = []
  for (const row of raw) {
    if (!Array.isArray(row)) return null
    const [when, amount, category, kind, flow, basket, balance] = row
    if (
      typeof when !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when) ||
      !isDate(when.slice(0, 10)) ||
      !Number.isFinite(amount) ||
      !Number.isFinite(balance) ||
      !name(category) ||
      !(kind === null || name(kind)) ||
      !['purchase', 'bill', 'income', 'savings', 'other'].includes(flow) ||
      !(basket === null || name(basket))
    )
      return null
    out.push({ date: when.slice(0, 10), time: when.slice(11), amount, category, kind, flow, basket, balance })
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

// The day relative periods count back from. The dataset stops well before the
// real today, so "the last two weeks" has to end on its last day to mean anything.
export function asOfDate(entries: Entry[], today: string): string {
  const last = entries[entries.length - 1].date
  return last < today && daysFrom(last, today) <= STALE_DAYS ? today : last
}

// The dates the model needs, worked out for it: it picks a period, it does not compute one.
export function calendar(entries: Entry[], today: string): string {
  const first = entries[0].date
  const asOf = asOfDate(entries, today)
  const month = addMonths(asOf, 0)
  const year = `${asOf.slice(0, 4)}-01-01`
  const lastYear = `${Number(asOf.slice(0, 4)) - 1}`
  const span = (from: string, to: string) => `${from} to ${to}`
  return [
    asOf === today
      ? `- Today is ${today} (${WEEKDAYS[weekday(today)]}).`
      : `- The account data ends on ${asOf} (${WEEKDAYS[weekday(asOf)]}), the day of the latest transaction. Treat that day as today: "this month" is ${asOf.slice(0, 7)}, "last month" is ${addMonths(asOf, -1).slice(0, 7)}, and every recent period counts back from it, exactly as listed below. Mention that the data ends on that day only once in a conversation, and only when it changes the answer.`,
    `- The earliest transaction is from ${first}.`,
    '- Ready-made periods, first and last day included:',
    `  yesterday: ${addDays(asOf, -1)}`,
    `  last 7 days: ${span(addDays(asOf, -6), asOf)}`,
    `  last 14 days (two weeks): ${span(addDays(asOf, -13), asOf)}`,
    `  last 30 days: ${span(addDays(asOf, -29), asOf)}`,
    `  last 90 days: ${span(addDays(asOf, -89), asOf)}`,
    `  this week (from Monday): ${span(monday(asOf), asOf)}`,
    `  last week: ${span(addDays(monday(asOf), -7), addDays(monday(asOf), -1))}`,
    `  this month: ${span(month, asOf)}`,
    `  last month: ${span(addMonths(asOf, -1), addDays(month, -1))}`,
    `  the 3 full months before this one: ${span(addMonths(asOf, -3), addDays(month, -1))}`,
    `  the 6 full months before this one: ${span(addMonths(asOf, -6), addDays(month, -1))}`,
    `  the 12 full months before this one: ${span(addMonths(asOf, -12), addDays(month, -1))}`,
    `  this year: ${span(year, asOf)}`,
    `  last year: ${span(`${lastYear}-01-01`, `${lastYear}-12-31`)}`,
  ].join('\n')
}

const distinct = (entries: Entry[], field: (e: Entry) => string | null) =>
  [...new Set(entries.map(field).filter((v): v is string => v !== null))].sort()

// The tools, in OpenAI's format. The values a filter accepts are the ones that
// occur in this customer's transactions, so the model cannot ask for a category that is not there.
export function toolsFor(entries: Entry[]) {
  const list = (values: string[], description: string) => ({ type: 'array', items: { type: 'string', enum: values }, description })
  const dates = {
    from: { type: 'string', description: 'First day, YYYY-MM-DD. Default: the earliest transaction.' },
    to: { type: 'string', description: 'Last day, included, YYYY-MM-DD. Default: the latest day of data.' },
  }
  const title = {
    type: 'string',
    description: 'What this lookup is, in 2 to 5 words in the customer\'s language, for example "Taxis, last two weeks". Shown to the customer.',
  }
  return [
    {
      type: 'function',
      function: {
        name: 'query_transactions',
        description:
          'Exact totals, counts and averages over the customer\'s transactions, filtered and optionally grouped, and the individual transactions if asked for. Use it for every question about a specific period, category, kind of place, number of purchases, biggest or latest purchases, or a particular day. Call it several times at once to compare periods or categories.',
        parameters: {
          type: 'object',
          required: ['title', 'what'],
          properties: {
            title,
            what: {
              type: 'string',
              enum: WHATS,
              description:
                'Which transactions. spending: everything paid for, purchases and bills together; for "spent", "expenses", "costs". purchases: only what was bought (shops, restaurants, transport, travel, health), no bills; for "purchases", "bought", "shopping". bills: only housing and utilities payments. income: salary and other income. savings: money moved to savings and investments. all: every transaction, as a net figure.',
            },
            ...dates,
            categories: list(distinct(entries, (e) => e.category), 'Only these categories.'),
            kinds: list(
              distinct(entries, (e) => e.kind),
              'Only these kinds of place, which are finer than categories: "Taxi" within Transportation, "Bar" within Restaurants.',
            ),
            baskets: list(distinct(entries, (e) => e.basket), 'Only these baskets of spending.'),
            weekdays: list(WEEKDAYS, 'Only these days of the week.'),
            min_amount: { type: 'number', description: 'Only transactions of at least this many euros.' },
            max_amount: { type: 'number', description: 'Only transactions of at most this many euros.' },
            group_by: {
              type: 'string',
              enum: GROUPS,
              description:
                'Split the total. month, week (labelled by its Monday), day and weekday include the periods with nothing in them. kind puts a payment with no known kind under its category.',
            },
            list: { type: 'integer', description: `How many individual transactions to return, 0 to ${MAX_LIST}. Default 0.` },
            sort: { type: 'string', enum: SORTS, description: 'Which transactions "list" returns first. Default: newest.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'balance_history',
        description:
          'The account balance over a period: at its start and end, its lowest and highest point with their dates, the days spent below zero, and the balance at the end of each month. Use it for any question about the balance on a date or how it changed.',
        parameters: { type: 'object', required: ['title'], properties: { title, ...dates } },
      },
    },
  ]
}

type Args = Record<string, unknown>
type Outcome = { result: unknown; lookup: Lookup | null }

const fail = (error: string): Outcome => ({ result: { error }, lookup: null })
const titleOf = (a: Args, fallback: string) =>
  (typeof a.title === 'string' ? a.title.replace(/[<>]/g, '').trim().slice(0, 60) : '') || fallback

// The days a lookup covers, kept within the data. A string is what is wrong with the request.
function periodOf(a: Args, first: string, asOf: string): { from: string; to: string } | string {
  for (const key of ['from', 'to']) if (a[key] != null && !isDate(a[key])) return `"${key}" must be a date such as ${asOf}.`
  if (a.from && a.to && a.from > a.to) return '"from" is after "to".'
  const from = a.from && (a.from as string) > first ? (a.from as string) : first
  const to = a.to && (a.to as string) < asOf ? (a.to as string) : asOf
  if (from > to) return `There is no data for that period: the transactions run from ${first} to ${asOf}.`
  return { from, to }
}

// The values of a filter, matched without regard to case. Null: no filter. A string: what is wrong.
function chosen(a: Args, key: string, valid: string[]): Set<string> | null | string {
  const asked = a[key]
  if (asked == null || (Array.isArray(asked) && asked.length === 0)) return null
  const out = new Set<string>()
  for (const value of Array.isArray(asked) ? asked : [asked]) {
    const match = valid.find((v) => v.toLowerCase() === String(value).toLowerCase())
    if (!match) return `Unknown value "${value}" for "${key}". Use one of: ${valid.join(', ')}.`
    out.add(match)
  }
  return out
}

// The same length of time just before a period: whole months before whole months, else as many days.
function previous(from: string, to: string): { from: string; to: string } {
  if (from.endsWith('-01') && to === monthEnd(to)) {
    const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1
    return { from: addMonths(from, -months), to: addDays(from, -1) }
  }
  return { from: addDays(from, -daysFrom(from, to) - 1), to: addDays(from, -1) }
}

function query(entries: Entry[], asOf: string, a: Args): Outcome {
  const first = entries[0].date
  const what = a.what == null ? 'spending' : String(a.what)
  if (!WHATS.includes(what)) return fail(`"what" must be one of: ${WHATS.join(', ')}.`)
  const group = a.group_by == null ? null : String(a.group_by)
  if (group && !GROUPS.includes(group)) return fail(`"group_by" must be one of: ${GROUPS.join(', ')}.`)
  const period = periodOf(a, first, asOf)
  if (typeof period === 'string') return fail(period)

  const categories = chosen(a, 'categories', distinct(entries, (e) => e.category))
  const kinds = chosen(a, 'kinds', distinct(entries, (e) => e.kind))
  const baskets = chosen(a, 'baskets', distinct(entries, (e) => e.basket))
  const days = chosen(a, 'weekdays', WEEKDAYS)
  for (const filter of [categories, kinds, baskets, days]) if (typeof filter === 'string') return fail(filter)
  const has = (filter: typeof categories, value: string | null) => filter === null || (value !== null && (filter as Set<string>).has(value))
  const min = Number.isFinite(a.min_amount) ? (a.min_amount as number) : 0
  const max = Number.isFinite(a.max_amount) ? (a.max_amount as number) : Infinity
  const matches = (e: Entry) =>
    (what === 'all' || e.flow === FLOW_OF[what] || (what === 'spending' && e.flow === 'bill')) &&
    has(categories, e.category) &&
    has(kinds, e.kind) &&
    has(baskets, e.basket) &&
    has(days, WEEKDAYS[weekday(e.date)]) &&
    Math.abs(e.amount) >= min &&
    Math.abs(e.amount) <= max
  const within = (from: string, to: string) => entries.filter((e) => e.date >= from && e.date <= to && matches(e))

  // Money out counts as positive when the question is about money going out.
  const sign = what === 'income' || what === 'all' ? 1 : -1
  const sum = (list: Entry[]) => cents(list.reduce((total, e) => total + sign * e.amount, 0))
  const found = within(period.from, period.to)
  // A filter that only matches another sort of transaction (investments asked for
  // as spending, say): tell the model which, instead of answering "nothing".
  if (found.length === 0 && what !== 'all' && (categories || kinds)) {
    const other = entries.find(
      (e) => e.date >= period.from && e.date <= period.to && has(categories, e.category) && has(kinds, e.kind),
    )
    const right = other && { purchase: 'purchases', bill: 'bills', income: 'income', savings: 'savings', other: 'all' }[other.flow]
    if (right) return fail(`Those transactions are not "${what}". Call again with "what" set to "${right}".`)
  }
  const total = sum(found)
  const sizes = found.map((e) => Math.abs(e.amount))

  const result: Record<string, unknown> = {
    period: { ...period, days: daysFrom(period.from, period.to) + 1 },
    total,
    total_is: TOTAL_IS[what],
    count: found.length,
  }
  if (found.length) Object.assign(result, { average: cents(total / found.length), largest: Math.max(...sizes), smallest: Math.min(...sizes) })
  if (what === 'all') {
    result.money_in = cents(found.reduce((t, e) => t + Math.max(0, e.amount), 0))
    result.money_out = cents(found.reduce((t, e) => t - Math.min(0, e.amount), 0))
  }
  if (a.from != null) {
    const before = previous(period.from, period.to)
    if (before.from >= first) {
      const earlier = within(before.from, before.to)
      result.previous_period = { ...before, total: sum(earlier), count: earlier.length }
    }
  }

  let groups: { label: string; total: number; count: number; share?: number }[] | null = null
  if (group) {
    const timed = group === 'month' || group === 'week' || group === 'day'
    const key = (e: Entry) =>
      group === 'month' ? e.date.slice(0, 7)
      : group === 'week' ? monday(e.date)
      : group === 'day' ? e.date
      : group === 'weekday' ? WEEKDAYS[weekday(e.date)]
      : group === 'kind' ? (e.kind ?? e.category)
      : group === 'basket' ? (e.basket ?? 'Not spending')
      : e.category
    const sums = new Map<string, { total: number; count: number }>()
    if (group === 'weekday') for (const day of WEEKDAYS) sums.set(day, { total: 0, count: 0 })
    if (timed)
      for (let d = period.from; d <= period.to; d = addDays(d, 1))
        sums.set(group === 'month' ? d.slice(0, 7) : group === 'week' ? monday(d) : d, { total: 0, count: 0 })
    if (sums.size > MAX_GROUPS) return fail(`That makes ${sums.size} groups. Use a coarser "group_by" or a shorter period.`)
    for (const e of found) {
      const g = sums.get(key(e)) ?? { total: 0, count: 0 }
      sums.set(key(e), g)
      g.total += sign * e.amount
      g.count++
    }
    groups = [...sums].map(([label, g]) => ({
      label,
      total: cents(g.total),
      count: g.count,
      ...(total > 0 ? { share: Math.round((g.total / total) * 1000) / 1000 } : {}),
    }))
    if (timed) result.average_per_group = cents(total / groups.length)
    else if (group !== 'weekday') groups.sort((x, y) => y.total - x.total)
    result.groups = groups
  }

  const sort = SORTS.includes(String(a.sort)) ? String(a.sort) : 'newest'
  const ordered =
    sort === 'oldest' ? found
    : sort === 'newest' ? [...found].reverse()
    : [...found].sort((x, y) => (sort === 'largest' ? 1 : -1) * (Math.abs(y.amount) - Math.abs(x.amount)))
  const wanted = Math.max(0, Math.min(MAX_LIST, Math.floor(Number(a.list) || 0)))
  if (wanted)
    result.transactions = ordered
      .slice(0, wanted)
      .map((e) => ({ day: inWords(e.date), date: e.date, time: e.time, amount: e.amount, category: e.category, ...(e.kind ? { kind: e.kind } : {}) }))

  // On the card every amount points the way the total does: a taxi is 45 € spent, not -45 €.
  const rows = groups
    ? groups.map((g) =>
        group === 'week' ? { label: 'Week of', amount: g.total, date: g.label }
        : group === 'day' ? { label: '', amount: g.total, date: g.label }
        : { label: g.label, amount: g.total },
      )
    : ordered.map((e) => ({ label: e.kind ?? e.category, amount: cents(sign * e.amount), date: e.date }))
  const shown = rows.slice(0, groups ? 12 : Math.max(wanted, 5))
  return {
    result,
    lookup: { title: titleOf(a, 'Transactions'), ...period, count: found.length, total, rows: shown, more: rows.length - shown.length },
  }
}

function balances(entries: Entry[], asOf: string, a: Args): Outcome {
  const period = periodOf(a, entries[0].date, asOf)
  if (typeof period === 'string') return fail(period)
  let balance = entries[0].balance - entries[0].amount // before the first transaction
  let i = 0
  while (i < entries.length && entries[i].date < period.from) balance = entries[i++].balance
  const start = cents(balance)
  let lowest = { balance: start, date: period.from }
  let highest = lowest
  let overdrawn = 0
  const monthEnds: { month: string; balance: number }[] = []
  for (let d = period.from; d <= period.to; d = addDays(d, 1)) {
    while (i < entries.length && entries[i].date === d) {
      balance = entries[i++].balance
      if (balance < lowest.balance) lowest = { balance: cents(balance), date: d }
      if (balance > highest.balance) highest = { balance: cents(balance), date: d }
    }
    if (balance < 0) overdrawn++
    if (d === monthEnd(d) || d === period.to) monthEnds.push({ month: d.slice(0, 7), balance: cents(balance) })
  }
  const end = cents(balance)
  return {
    result: {
      period: { ...period, days: daysFrom(period.from, period.to) + 1 },
      start_balance: start,
      end_balance: end,
      change: cents(end - start),
      lowest,
      highest,
      days_below_zero: overdrawn,
      ...(monthEnds.length > 1 ? { month_end_balances: monthEnds.slice(-24) } : {}),
    },
    lookup: {
      title: titleOf(a, 'Balance'),
      ...period,
      count: null,
      total: null,
      rows: [
        { label: 'Start', amount: start, date: period.from },
        // A single day has no lowest and highest worth showing apart from its two ends.
        ...(period.from === period.to
          ? []
          : [
              { label: 'Lowest', amount: lowest.balance, date: lowest.date },
              { label: 'Highest', amount: highest.balance, date: highest.date },
            ]),
        { label: 'End', amount: end, date: period.to },
      ],
      more: 0,
    },
  }
}

// Runs one tool call. `args` is what the model sent, so nothing in it is trusted:
// a bad request comes back as { error } for the model to correct.
export function runTool(entries: Entry[], today: string, name: string, args: unknown): Outcome {
  if (entries.length === 0) return fail('The customer has no transactions.')
  const a = (args && typeof args === 'object' ? args : {}) as Args
  const asOf = asOfDate(entries, today)
  if (name === 'query_transactions') return query(entries, asOf, a)
  if (name === 'balance_history') return balances(entries, asOf, a)
  return fail(`Unknown tool "${name}".`)
}
