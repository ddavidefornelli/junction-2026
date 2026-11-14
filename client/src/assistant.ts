// Browser side of the assistant: the summary of the customer's finances the
// model answers from, the transactions it can look things up in, and the call
// to /api/chat (see ../chat.ts).

import type { Lookup, Row } from '../ledger'
import { spendingKey, type Mortgage, type SpendingClass, type Transaction } from './api'
import { basketOf, INCOME_TYPES, leaks, TRIM, type Baskets } from './baskets'
import { BASKET_NAMES } from './BasketsCard'
import { AREA_SOURCE, type AreaView } from './area'
import { BENCHMARK_SOURCE, gapWords, type Benchmark } from './benchmarks'
import { habitLines, makeHabits } from './habits'
import { kindOf, suggestions } from './mcc'
import { mortgageFacts, mortgageLines } from './mortgage'
import type { Wellness } from './wellness'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_MONTHS = 12 // months of money in / out
const CATEGORY_MONTHS = 3 // months of spending per category
const KIND_MONTHS = 3 // full months averaged for spending per kind of place
const SENT_MESSAGES = 12 // the model sees the end of a long conversation

const eur = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n)} €`)
const pct = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n * 100)}%`)

// Everything the app knows about the customer, as plain text. Figures are the
// ones shown on screen, so the assistant and the app never disagree.
export function buildContext(d: {
  balance: number | null
  wellness: Wellness | null
  score: { value: number | null; provisional: boolean }
  allTxs: Transaction[] | null // oldest first
  spendingClasses: Record<string, SpendingClass> | null
  mortgage: Mortgage | null
  baskets: Baskets | null
  benchmark?: Benchmark | null
  area?: AreaView | null
}): string {
  // The data may stop well before the calendar date; what counts as "now" for
  // the customer's figures is their latest transaction.
  const latest = d.allTxs?.length ? d.allTxs[d.allTxs.length - 1].tx_date : null
  const out: string[] = [latest ? `Account data up to: ${latest}` : `Today: ${new Date().toISOString().slice(0, 10)}`]
  if (d.balance !== null) out.push(`Current account balance: ${eur(d.balance)}`)

  const w = d.wellness
  if (w) {
    out.push(
      '',
      `Whole history, ${w.from} to ${w.to} (${w.days} days, ${w.accounts} account(s)):`,
      `- Money in: ${eur(w.incoming)}; money out: ${eur(w.outgoing)}; net: ${eur(w.net)}`,
      `- Savings rate (net / money in): ${pct(w.savingsRate)}`,
      `- Average balance: ${eur(w.averageBalance)}`,
      `- Days overdrawn: ${w.negativeDays}`,
      `- Housing and utilities: ${eur(w.essentials)}`,
      d.score.value === null
        ? '- Illustrative financial score unavailable: not enough account activity; do not estimate it.'
        : d.score.provisional
          ? `- Preliminary financial score: ${d.score.value} / 100 (based only on account activity: resilience scaled from 35 to 100; NOT the full financial score; questionnaire and complete months still needed)`
          : `- Full illustrative financial score: ${d.score.value} / 100 (resilience 35, perception 25, knowledge 20, behaviors 20; not a credit score)`,
    )
  }

  if (d.allTxs?.length) {
    const months = new Map<string, { in: number; out: number; spent: Map<string, number> }>()
    for (const tx of d.allTxs) {
      const key = tx.tx_date.slice(0, 7)
      const m = months.get(key) ?? { in: 0, out: 0, spent: new Map() }
      months.set(key, m)
      const amount = Number(tx.tx_amount_eur)
      if (amount > 0) m.in += amount
      else {
        m.out -= amount
        const category = tx.category ?? 'Other'
        m.spent.set(category, (m.spent.get(category) ?? 0) - amount)
      }
    }
    const sorted = [...months].sort(([a], [b]) => a.localeCompare(b))
    out.push('', 'Money in / out by month (the latest month may be incomplete):')
    for (const [month, m] of sorted.slice(-HISTORY_MONTHS))
      out.push(`- ${month}: in ${eur(m.in)}, out ${eur(m.out)}`)
    out.push('', 'Money out by category, recent months:')
    for (const [month, m] of sorted.slice(-CATEGORY_MONTHS)) {
      const spent = [...m.spent].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${eur(v)}`)
      out.push(`- ${month}: ${spent.join(', ') || 'nothing'}`)
    }
  }

  const b = d.baskets
  if (b) {
    const line = (l: { name: string; monthly: number; purchases: number }) => `${l.name} ${eur(l.monthly)} (${l.purchases.toFixed(1)} purchases)`
    const basket = (title: string, x: Baskets['baskets']['fixed']) =>
      `- ${title}: ${eur(x.monthly)} a month, ${pct(x.share)} of spending${b.income > 0 ? `, ${pct(x.monthly / b.income)} of income` : ''}; by month ${x.byMonth.map((v) => eur(v)).join(', ')}; lines: ${x.lines.map(line).join(', ')}`
    out.push(
      '',
      `Spending in three baskets (shown to the customer as "Where your money goes"), monthly averages over ${b.months.length} full month(s), ${b.months[0]} to ${b.months[b.months.length - 1]}. Income averages ${eur(b.income)} a month; spending ${eur(b.spending)}.`,
      basket('1. "Must pay every month" (rent, utilities, groceries, getting around)', b.baskets.fixed),
      basket('2. "Must pay sometimes" (health care, home and appliances)', b.baskets.irregular),
      ...(b.peak ? [`  Most expensive irregular month: ${b.peak.month}, ${eur(b.peak.amount)}. Setting aside the monthly average covers months like it.`] : []),
      basket('3. "Fun extras", the spending that slips through your fingers (eating out, fun, shopping, travel, taxis, convenience stores)', b.baskets.everyday),
      `  Bought most often: ${leaks(b).map(line).join(', ')}. Spending ${pct(TRIM)} less on fun extras would free ${eur(b.baskets.everyday.monthly * TRIM)} a month, ${eur(b.baskets.everyday.monthly * TRIM * 12)} a year.`,
    )
  }

  if (d.spendingClasses && d.allTxs?.length) {
    const months = [...new Set(d.allTxs.map((tx) => tx.tx_date.slice(0, 7)))].sort().slice(0, -1).slice(-3)
    if (months.length) {
      const window = new Set(months)
      const totals = new Map<SpendingClass, Map<string, number>>(
        (['essential', 'flexible', 'saving'] as const).map((type) => [type, new Map<string, number>()]),
      )
      for (const tx of d.allTxs) {
        if (tx.tx_amount_eur >= 0 || !window.has(tx.tx_date.slice(0, 7))) continue
        const key = spendingKey(tx)
        const type = key ? d.spendingClasses[key] : undefined
        if (!type) continue
        const categories = totals.get(type)!
        const category = tx.category ?? 'Other'
        categories.set(category, (categories.get(category) ?? 0) - tx.tx_amount_eur)
      }
      const label = (type: SpendingClass) =>
        type === 'essential' ? 'Essentials' : type === 'flexible' ? 'Flexible spending' : 'Money set aside'
      out.push('', `Laya's labels by category and transaction type over the last ${months.length} full month(s):`)
      for (const type of ['essential', 'flexible', 'saving'] as const) {
        const categories = [...totals.get(type)!.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        if (categories.length) out.push(`- ${label(type)}: ${categories.map(([name, amount]) => `${name} ${eur(amount)}`).join(', ')}`)
      }
      out.push('- These are estimates for transaction categories and types, not labels for a specific shop or item.')
    }
  }

  const bm = d.benchmark
  if (bm?.lines.length) {
    const who = bm.group === 'all' ? 'people in Finland (age unknown)' : `Finns aged ${bm.group}, the customer's age group`
    out.push(
      '',
      `Compared with ${who}, per person (shown to the customer as "How you compare"; source: ${BENCHMARK_SOURCE}; rent and bills not compared). The customer's monthly average over ${bm.months} full month(s), then the typical figure:`,
      ...bm.lines.map((l) => `- ${l.category}: you ${eur(l.you)}, typical ${eur(l.typical)} (${gapWords(l.ratio)})`),
      `- These categories together: you ${eur(bm.you)}, typical ${eur(bm.typical)} (${gapWords(bm.you / bm.typical)})`,
    )
  }

  const a = d.area
  if (a) {
    out.push(
      '',
      `Where the customer lives (shown as "Your area"; source: ${AREA_SOURCE}): ${a.name}, ${a.city}, in the rent area "${a.zoneLabel}".`,
      `- Free-market rent there: ${a.rentPerM2.toFixed(2)} €/m² on average; one-room flats ${a.rentOne.toFixed(2)} €/m², two-room flats ${a.rentTwo.toFixed(2)} €/m²`,
      `- Residents have ${a.m2PerPerson} m² of home per person, so renting for one person there typically costs about ${eur(a.typicalRent)} a month`,
      a.housing
        ? `- The customer's housing payment: ${eur(a.housing)} a month (${gapWords(a.housing / a.typicalRent)} compared with that typical rent); it would rent about ${Math.round(a.m2ForPayment!)} m² there. It may be rent or a home loan payment.`
        : '- No housing payment in the account.',
      ...(a.housingShare !== null ? [`- Housing takes ${pct(a.housingShare)} of the customer's income`] : []),
      `- Neighbours: ${pct(a.renters)} of households rent, ${pct(a.livingAlone)} live alone, ${a.householdSize} people per household; median income after tax ${eur(a.medianIncomeMonthly)} a month${a.income ? ` (the customer's: ${eur(a.income)})` : ''}`,
    )
  }

  if (d.allTxs?.length) {
    // The MCC code of a purchase tells the kind of place it was made at, which
    // is finer than its category: this is where cheaper ways to cover the same
    // need show up (convenience store or supermarket, taxi or public transport).
    const months = [...new Set(d.allTxs.map((tx) => tx.tx_date.slice(0, 7)))].sort()
    const window = new Set(months.slice(0, -1).slice(-KIND_MONTHS)) // full months only
    const byCategory = new Map<string, Map<string, number>>()
    for (const tx of d.allTxs) {
      if (tx.tx_amount_eur >= 0 || !window.has(tx.tx_date.slice(0, 7))) continue
      const kinds = byCategory.get(tx.category ?? 'Other') ?? new Map<string, number>()
      byCategory.set(tx.category ?? 'Other', kinds)
      const kind = kindOf(tx)?.name ?? 'place unknown'
      kinds.set(kind, (kinds.get(kind) ?? 0) - tx.tx_amount_eur / window.size)
    }
    if (byCategory.size) {
      out.push('', `Money out by kind of place, monthly average over the last ${window.size} full month(s):`)
      const total = (kinds: Map<string, number>) => [...kinds.values()].reduce((a, b) => a + b, 0)
      for (const [category, kinds] of [...byCategory].sort((a, b) => total(b[1]) - total(a[1]))) {
        const parts = [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${eur(v)}`)
        out.push(`- ${category} (${eur(total(kinds))}): ${parts.join(', ')}`)
      }
    }

    const habits = makeHabits(d.allTxs)
    if (habits) out.push('', ...habitLines(habits))

    // Every switch a published Finnish price comparison supports.
    const switches = suggestions(d.allTxs)
    if (switches.length) {
      out.push('', 'Cheaper ways to cover the same needs, with the estimated saving where a published Finnish price comparison gives one:')
      for (const t of switches)
        out.push(
          `- ${t.title}: ${t.text} ${t.saving !== null ? `Estimated saving: about ${eur(t.saving)} a month.` : 'No published figure for the saving.'}${t.source ? ` Source: ${t.source}.` : ''}`,
        )
    }
  }

  if (d.mortgage) out.push('', ...mortgageLines(d.mortgage, mortgageFacts(d.mortgage, d.allTxs)))
  return out.join('\n')
}

const SAVING_TYPES = new Set(['investment_deposit', 'investment_withdrawal', 'salary_sweep'])

// The transactions as the rows Walter's lookups run on (see ../ledger.ts),
// oldest first. Each is described here, with what the app already knows about
// it (the kind of place, the basket, whether it is spending at all), so a
// lookup and the rest of the app sort a payment the same way.
export function ledgerOf(txs: Transaction[]): Row[] {
  const balances = new Map<string, number>() // the latest balance of each account
  return [...txs]
    .sort((a, b) => a.tx_timestamp.localeCompare(b.tx_timestamp))
    .map((tx) => {
      balances.set(tx.bank_account_id, Number(tx.balance_after_eur))
      const basket = basketOf(tx)
      const type = tx.transaction_type ?? ''
      return [
        tx.tx_timestamp.slice(0, 16),
        Number(tx.tx_amount_eur),
        tx.category ?? 'Other',
        kindOf(tx)?.name ?? null,
        basket ? (type === 'purchase' ? 'purchase' : 'bill') : INCOME_TYPES.has(type) && tx.tx_amount_eur > 0 ? 'income' : SAVING_TYPES.has(type) ? 'savings' : 'other',
        basket ? BASKET_NAMES[basket.basket].name : null,
        Math.round([...balances.values()].reduce((a, b) => a + b, 0) * 100) / 100,
      ]
    })
}

// A chart the assistant put in a reply: <chart>{json}</chart> on a line of its own (see ../chat.ts).
export type Chart = {
  type: 'bar' | 'line'
  title: string
  unit: string
  series: string[] // one or two
  data: { label: string; values: number[] }[] // one value per series
}

function toChart(json: string): Chart | null {
  try {
    const c = JSON.parse(json)
    const series: unknown[] = Array.isArray(c.series) && c.series.length ? c.series : ['Value']
    const ok =
      (c.type === 'bar' || c.type === 'line') &&
      typeof c.title === 'string' &&
      series.length <= 2 &&
      Array.isArray(c.data) &&
      c.data.length >= 2 &&
      c.data.length <= 12 &&
      c.data.every(
        (d: { label?: unknown; values?: unknown }) =>
          typeof d?.label === 'string' &&
          Array.isArray(d.values) &&
          d.values.length === series.length &&
          d.values.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)),
      )
    if (!ok) return null
    return { type: c.type, title: c.title, unit: typeof c.unit === 'string' ? c.unit : '', series: series.map(String), data: c.data }
  } catch {
    return null
  }
}

// What a lookup found: <lookup>{json}</lookup>, written by the server each
// time the assistant looks something up in the transactions (see ../chat.ts).
export type { Lookup }

function toLookup(json: string): Lookup | null {
  try {
    const l = JSON.parse(json)
    const ok =
      typeof l.title === 'string' &&
      typeof l.from === 'string' &&
      typeof l.to === 'string' &&
      Array.isArray(l.rows) &&
      l.rows.every((r: { label?: unknown; amount?: unknown }) => typeof r?.label === 'string' && typeof r.amount === 'number')
    return ok ? l : null
  } catch {
    return null
  }
}

// A reply as the model wrote it. The lookups are the server's, not the model's:
// sent back as history they would only teach it to write its own.
const withoutLookups = (reply: string) => reply.replace(/<lookup>[\s\S]*?<\/lookup>\s*/g, '')

// The follow-up questions at the end of a reply: <suggest>["…","…"]</suggest>
// (see ../chat.ts). Empty while they are still being written or if they do not parse.
export function suggestionsOf(reply: string): string[] {
  const match = reply.match(/<suggest>([\s\S]*?)<\/suggest>/)
  if (!match) return []
  try {
    const list = JSON.parse(match[1])
    return Array.isArray(list)
      ? list.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()).slice(0, 3)
      : []
  } catch {
    return []
  }
}

// A reply as the pieces to show, in order: text, charts and lookups. A chart
// or lookup that is still being written (the reply arrives piece by piece) or
// that does not parse is left out rather than shown as raw text, and so are
// the suggestions (shown as buttons instead, see suggestionsOf).
export function parseReply(reply: string): (string | Chart | Lookup)[] {
  const parts: (string | Chart | Lookup)[] = []
  const add = (text: string) => {
    if (text.trim()) parts.push(text.trim())
  }
  const suggest = reply.indexOf('<suggest>')
  let rest = suggest < 0 ? reply : reply.slice(0, suggest)
  while (true) {
    const open = rest.match(/<(chart|lookup)>/)
    if (!open) break
    const start = open.index!
    add(rest.slice(0, start))
    const close = `</${open[1]}>`
    const end = rest.indexOf(close, start)
    if (end < 0) return parts // unfinished block: show what came before it
    const json = rest.slice(start + open[0].length, end)
    const block = open[1] === 'chart' ? toChart(json) : toLookup(json)
    if (block) parts.push(block)
    rest = rest.slice(end + close.length)
  }
  add(rest.replace(/<\/?[a-z]{0,7}$/, '')) // a tag cut mid-way
  return parts
}

// Ask Walter for personalised what-if questions, without adding a chat message.
export async function getWhatIfScenarios(context: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
    signal,
  })
  if (!res.ok) {
    const error = (await res.json().catch(() => null))?.error
    throw new Error(error ?? `Request failed (${res.status})`)
  }
  const questions: unknown = await res.json()
  if (!Array.isArray(questions) || !questions.length || !questions.every((q) => typeof q === 'string'))
    throw new Error('No scenarios available')
  return questions
}

// Asks for the reply to the last message in `messages`. It arrives piece by
// piece: `onText` gets the reply so far each time it grows. Resolves with the
// whole reply. `ledger` is what the assistant can look things up in (see
// ledgerOf); null when the transactions could not be loaded.
export async function sendChat(
  context: string,
  ledger: Row[] | null,
  messages: ChatMessage[],
  onText: (reply: string) => void,
  spoken = false,
  future = false, // the customer's future self answers (see future.ts)
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      ledger,
      spoken,
      future,
      messages: messages.slice(-SENT_MESSAGES).map((m) => (m.role === 'assistant' ? { ...m, content: withoutLookups(m.content) } : m)),
    }),
  })
  if (!res.ok || !res.body) {
    const error = (await res.json().catch(() => null))?.error
    console.error('[chat] Request failed', { status: res.status, error })
    throw new Error(error ?? `Request failed (${res.status})`)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let reply = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    reply += value
    onText(reply)
  }
  // Lookups with no answer after them: the reply was cut short.
  if (!withoutLookups(reply).trim()) throw new Error('Empty reply')
  return reply
}
