import { useState } from 'react'
import { BENCHMARK_SOURCE, gapWords, type Benchmark } from './benchmarks'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))

const SHOWN = 4 // rows before "Show all"

// The customer's spending next to what Finns of the same age spend, from
// Statistics Finland (see benchmarks.ts). A reference, not a verdict: no
// red or green, just the two figures and the gap in words.
export function BenchmarkCard({ data }: { data: Benchmark }) {
  const [all, setAll] = useState(false)
  const lines = all ? data.lines : data.lines.slice(0, SHOWN)
  const max = Math.max(...data.lines.flatMap((l) => [l.you, l.typical]), 1)
  const who = data.group === 'all' ? 'people in Finland' : `Finns aged ${data.group}`

  return (
    <section aria-labelledby="benchmark-title" className="rounded-lg border border-line bg-white">
      <div className="p-5">
        <h2 id="benchmark-title" className="font-medium">How you compare</h2>
        <p className="mt-1 text-sm text-muted">
          Your month next to what {who} spend, per person.
        </p>

        <div className="mt-3 flex gap-4 text-xs text-muted" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-ink" />You</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-slate-300" />Typical</span>
        </div>

        <ul className="mt-3 space-y-3.5">
          {lines.map((l) => (
            <li key={l.category}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{l.category}</span>
                <span className="shrink-0 text-muted">{gapWords(l.ratio)}</span>
              </div>
              <div className="mt-1.5 space-y-1" aria-hidden="true">
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-ink" style={{ width: `${(l.you / max) * 80}%` }} />
                  <span className="text-xs tabular-nums">{eur(l.you)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-slate-300" style={{ width: `${(l.typical / max) * 80}%` }} />
                  <span className="text-xs tabular-nums text-muted">{eur(l.typical)}</span>
                </div>
              </div>
              <p className="sr-only">You spend {eur(l.you)} a month, typical is {eur(l.typical)}: {gapWords(l.ratio)}.</p>
            </li>
          ))}
        </ul>

        {data.lines.length > SHOWN && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
            className="mt-4 text-sm font-medium underline-offset-2 hover:underline"
          >
            {all ? 'Show less' : `Show all ${data.lines.length}`}
          </button>
        )}

        <p className="mt-4 text-xs text-muted">
          Monthly average over your last {data.months} full month{data.months === 1 ? '' : 's'}. Typical: {BENCHMARK_SOURCE}. Rent and bills are left out.
        </p>
      </div>
    </section>
  )
}
