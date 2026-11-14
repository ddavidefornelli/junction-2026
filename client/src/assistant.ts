// Browser side of the assistant: the summary of the customer's finances the
// model answers from, and the call to /api/chat (see ../chat.ts).

import type { Mortgage, Transaction } from './api'
import { goalStatement, type GoalProfile } from './goal'
import { kindOf, suggestions } from './mcc'
import type { Plan } from './plan'
import type { Wellness } from './wellness'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_MONTHS = 12 // months of money in / out
const CATEGORY_MONTHS = 3 // months of spending per category
const KIND_MONTHS = 3 // full months averaged for spending per kind of place
const SENT_MESSAGES = 12 // the model sees the end of a long conversation

const eur = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n)} €`)
const pct = (n: number | null) => (n == null ? 'unknown' : `${Math.round(n * 100)}%`)
const words = (s: string | null) => (s ?? 'unknown').replace(/_/g, ' ')

// Everything the app knows about the customer, as plain text. Figures are the
// ones shown on screen, so the assistant and the app never disagree.
export function buildContext(d: {
  balance: number | null
  wellness: Wellness | null
  score: number | null
  allTxs: Transaction[] | null // oldest first
  goal: GoalProfile | null
  plan: Plan | null
  mortgage: Mortgage | null
}): string {
  const out: string[] = [`Today: ${new Date().toISOString().slice(0, 10)}`]
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
      d.score === null
        ? '- Illustrative financial score unavailable until account data and questionnaire answers are complete; do not estimate it.'
        : `- Illustrative financial score: ${d.score} / 100 (resilience 35, perception 25, knowledge 20, behaviors 20; not a credit score)`,
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

  out.push('', d.goal ? `Goal for ${d.goal.year}: ${goalStatement(d.goal)}` : 'The customer has not set a goal yet (they can, on the overview page).')
  const p = d.plan
  if (p) {
    out.push(
      `Plan for the goal (shown to the customer as "Your plan"):`,
      `- Usually sets aside ${eur(p.usualSaving)} a month`,
      ...(p.requiredSaving !== null ? [`- Needs to set aside ${eur(p.requiredSaving)} a month to reach the goal on time`] : []),
      `- The most they could set aside with every optional budget cut as far as sensible: ${eur(p.maxSaving)} a month`,
      `- Goal reachable at this pace: ${p.reachable ? 'yes' : 'no'}`,
    )
    if (p.categories.length) {
      out.push(`Monthly budgets under the plan, and spending so far in ${p.month}:`)
      for (const c of p.categories)
        out.push(`- ${c.category}: usually ${eur(c.usual)}, budget ${eur(c.budget)}, spent ${eur(c.spent)}`)
    }
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

    // Every switch a published Finnish price comparison supports, including the
    // ones the app's own card keeps for customers whose goal is out of reach.
    const switches = suggestions(d.allTxs, true)
    if (switches.length) {
      out.push('', 'Cheaper ways to cover the same needs, with the estimated saving where a published Finnish price comparison gives one:')
      for (const t of switches)
        out.push(
          `- ${t.title}: ${t.text} ${t.saving !== null ? `Estimated saving: about ${eur(t.saving)} a month.` : 'No published figure for the saving.'}${t.source ? ` Source: ${t.source}.` : ''}`,
        )
    }
  }

  const m = d.mortgage
  if (m) {
    out.push(
      '',
      'Mortgage application:',
      `- Decision: ${words(m.final_decision)}${m.rejection_reason ? ` (${words(m.rejection_reason)})` : ''}`,
      `- Loan ${eur(m.final_requested_loan_eur)} for a property of ${eur(m.final_property_price_eur)}; equity ${eur(m.final_equity_amount_eur)}; loan to value ${pct(m.final_loan_to_value)}`,
      `- Required monthly income: ${eur(m.required_monthly_income_eur)}`,
    )
  }
  return out.join('\n')
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

// A reply as the pieces to show, in order: text and charts. A chart that is
// still being written (the reply arrives piece by piece) or that does not
// parse is left out rather than shown as raw text, and so are the suggestions
// (shown as buttons instead, see suggestionsOf).
export function parseReply(reply: string): (string | Chart)[] {
  const parts: (string | Chart)[] = []
  const add = (text: string) => {
    if (text.trim()) parts.push(text.trim())
  }
  const suggest = reply.indexOf('<suggest>')
  let rest = suggest < 0 ? reply : reply.slice(0, suggest)
  while (true) {
    const start = rest.indexOf('<chart>')
    if (start < 0) break
    add(rest.slice(0, start))
    const end = rest.indexOf('</chart>', start)
    if (end < 0) return parts // unfinished chart: show what came before it
    const chart = toChart(rest.slice(start + 7, end))
    if (chart) parts.push(chart)
    rest = rest.slice(end + 8)
  }
  add(rest.replace(/<\/?[a-z]{0,7}$/, '')) // a tag cut mid-way
  return parts
}

// Asks for the reply to the last message in `messages`. It arrives piece by
// piece: `onText` gets the reply so far each time it grows. Resolves with the
// whole reply.
export async function sendChat(
  context: string,
  messages: ChatMessage[],
  onText: (reply: string) => void,
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages: messages.slice(-SENT_MESSAGES) }),
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
  if (!reply.trim()) throw new Error('Empty reply')
  return reply
}
