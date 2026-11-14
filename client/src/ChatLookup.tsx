import type { Lookup } from './assistant'
import { date, eur } from './format'

// "2026-07" -> "7/2026", as months are written elsewhere in the app.
const month = (s: string) => s.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${Number(m)}/${y}`)
const dayMonth = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric' })
// "17.9.–30.9.2026": the year once, unless the period crosses one.
const period = (from: string, to: string) =>
  from === to ? date(to) : `${from.slice(0, 4) === to.slice(0, 4) ? dayMonth.format(new Date(from)) : date(from)}–${date(to)}`

// What Walter looked up before answering (see runTool in ../ledger.ts): the
// figures his reply rests on, straight from the transactions, so the customer
// can check them. One line, opening onto the rows behind it.
export function ChatLookup({ lookup }: { lookup: Lookup }) {
  const { title, from, to, count, total, rows, more } = lookup
  return (
    <details className="group max-w-[90%] rounded-lg bg-white text-xs">
      <summary className="flex cursor-pointer list-none items-baseline gap-x-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">›</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{title}</span>
          <span className="text-muted">
            {' · '}
            {period(from, to)}
            {count !== null && ` · ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
          </span>
        </span>
        {total !== null && <span className="font-medium tabular-nums">{eur(total)}</span>}
      </summary>
      {rows.length === 0 ? (
        <p className="border-t border-line px-3 py-2 text-muted">Nothing in this period.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line px-3">
          {rows.map((row, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5">
              <span className="truncate text-muted">{[row.date && date(row.date), month(row.label)].filter(Boolean).join(' · ')}</span>
              <span className="tabular-nums">{eur(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="border-t border-line px-3 py-1.5 text-muted">and {more} more</p>}
    </details>
  )
}
