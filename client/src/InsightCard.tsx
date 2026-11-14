import type { Insight, InsightChart } from './insights'

// One insight from the customer's data (see insights.ts): what it is worth, the
// chart that shows it, and the one thing to do. Charts are plain SVG and HTML.

const INK = '#0b2a1d'
const MARK = '#00843d' // the customer's own figures
const GREY = '#9aa7b4'
const GREEN = '#0b7a4b'
const RED = '#b42318'
const LINE = '#dae5dd'
const MUTED = '#586b60'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
// "2026-07" -> "7/2026", "2026-07-14" -> "14.7.2026"
const month = (s: string) => `${Number(s.slice(5, 7))}/${s.slice(0, 4)}`
const day = (s: string) => `${Number(s.slice(8, 10))}.${Number(s.slice(5, 7))}.${s.slice(0, 4)}`

export function InsightCard({ insight: x, first, onAsk }: { insight: Insight; first: boolean; onAsk: (question: string) => void }) {
  return (
    <section aria-labelledby={`insight-${x.id}`} className={`rounded-lg bg-white ${first ? 'ring-2 ring-ink' : ''}`}>
      <div className="p-6">
        {first && <p className="mb-3 inline-block rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Your biggest opportunity</p>}
        <h2 id={`insight-${x.id}`} className="text-lg leading-snug font-bold">{x.title}</h2>
        <p className={`mt-2 font-display font-extrabold tracking-tight ${first ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'} ${x.tone === 'gain' ? 'text-credit' : x.tone === 'loss' ? 'text-red-700' : ''}`}>
          {x.figure}
        </p>
        <p className="mt-2 text-sm text-muted">{x.text}</p>

        <div className="mt-6"><Chart chart={x.chart} title={x.title} /></div>

        <div className="mt-6 rounded-md bg-paper p-4">
          <p className="text-xs font-semibold text-accent">Do this</p>
          <p className="mt-1 text-sm font-medium">{x.action}</p>
          <button type="button" onClick={() => onAsk(x.ask)} className="mt-3 min-h-11 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90">
            Plan it with Walter
          </button>
        </div>
        {x.note && <p className="mt-3 text-xs text-muted">{x.note}</p>}
      </div>
    </section>
  )
}

function Chart({ chart, title }: { chart: InsightChart; title: string }) {
  if (chart.kind === 'months') return <Months chart={chart} title={title} />
  if (chart.kind === 'compare') return <Compare chart={chart} />
  if (chart.kind === 'growth') return <Growth chart={chart} title={title} />
  return <Balance chart={chart} title={title} />
}

const W = 320

// One bar a month. Months below zero are red; the latest bar carries its value.
function Months({ chart, title }: { chart: Extract<InsightChart, { kind: 'months' }>; title: string }) {
  const H = 130
  const pad = { top: 18, bottom: 18 }
  const { values, months, limit, recent } = chart
  const n = values.length
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values, limit?.value ?? 0)
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom)
  const slot = W / n
  const width = Math.min(22, slot - 2)
  const last = values[n - 1]
  return (
    <div>
      {limit && (
        <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-credit" />
          {limit.label}: <span className="font-medium text-ink">{eur(limit.value)} a month</span>
        </p>
      )}
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Month by month, ${month(months[0])} to ${month(months[n - 1])}.`} className="w-full">
      {values.map((v, i) => (
        <rect
          key={months[i]}
          x={i * slot + (slot - width) / 2}
          y={Math.min(y(v), y(0))}
          width={width}
          height={Math.max(1, Math.abs(y(v) - y(0)))}
          rx="2"
          fill={v < 0 ? RED : recent && i < n - recent ? GREY : MARK}
        >
          <title>{`${month(months[i])}: ${eur(v)}`}</title>
        </rect>
      ))}
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke={min < 0 ? MUTED : LINE} />
      {limit && <line x1="0" x2={W} y1={y(limit.value)} y2={y(limit.value)} stroke={GREEN} strokeWidth="1.5" strokeDasharray="4 3" />}
      <text x={W} y={(last < 0 ? y(0) : y(last)) - 4} fontSize="10" fontWeight="600" fill={INK} textAnchor="end" stroke="#fff" strokeWidth="3" paintOrder="stroke">
        {eur(last)}
      </text>
      <text x="0" y={H - 4} fontSize="9" fill={MUTED}>{month(months[0])}</text>
      <text x={W} y={H - 4} fontSize="9" fill={MUTED} textAnchor="end">{month(months[n - 1])}</text>
    </svg>
    </div>
  )
}

// A few amounts side by side, each with its value at the end of the bar.
function Compare({ chart }: { chart: Extract<InsightChart, { kind: 'compare' }> }) {
  const max = Math.max(1, ...chart.rows.map((r) => r.value))
  return (
    <dl className="space-y-2.5">
      {chart.rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs text-muted">{r.label}</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm font-medium tabular-nums">
            <span
              aria-hidden="true"
              className="h-3 min-w-1 rounded-r"
              style={{ width: `calc((100% - 5.5rem) * ${r.value / max})`, background: r.role === 'you' ? MARK : r.role === 'goal' ? GREEN : GREY }}
            />
            <span className="shrink-0">{eur(r.value)}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

// The same money year by year: left in the account, or invested.
function Growth({ chart, title }: { chart: Extract<InsightChart, { kind: 'growth' }>; title: string }) {
  const H = 150
  const pad = { top: 12, right: 64, bottom: 18, left: 2 }
  const n = chart.kept.length
  const max = Math.max(1, ...chart.invested, ...chart.kept)
  const x = (i: number) => pad.left + (i / (n - 1)) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)
  const series = [
    { name: 'Invested', values: chart.invested, color: GREEN },
    { name: 'Left in your account', values: chart.kept, color: GREY },
  ]
  // End labels that finish close together are pushed apart.
  const ends = series.map((s) => y(s.values[n - 1]))
  if (ends[1] - ends[0] < 12) ends[1] = ends[0] + 12
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. After ${n - 1} years: ${eur(chart.invested[n - 1])} invested, ${eur(chart.kept[n - 1])} left in your account.`}
        className="mt-1 w-full"
      >
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke={LINE} />
        {series.map((s, k) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={s.color} stroke="#fff" strokeWidth="2">
              <title>{`${s.name}, after ${n - 1} years: ${eur(s.values[n - 1])}`}</title>
            </circle>
            <text x={x(n - 1) + 8} y={ends[k] + 3.5} fontSize="10" fontWeight="600" fill={INK}>{eur(s.values[n - 1])}</text>
          </g>
        ))}
        <text x={pad.left} y={H - 4} fontSize="9" fill={MUTED}>Now</text>
        <text x={W - pad.right} y={H - 4} fontSize="9" fill={MUTED} textAnchor="end">In {n - 1} years</text>
      </svg>
    </div>
  )
}

// The balance day by day, with the buffer to reach as a dashed line.
function Balance({ chart, title }: { chart: Extract<InsightChart, { kind: 'balance' }>; title: string }) {
  const H = 140
  const pad = { top: 16, right: 6, bottom: 18, left: 2 }
  const { values, target } = chart
  const n = values.length
  const min = Math.min(0, ...values)
  const max = Math.max(1, target, ...values)
  const x = (i: number) => pad.left + (i / Math.max(1, n - 1)) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${title}. Your balance from ${day(chart.from)} to ${day(chart.to)}, now ${eur(values[n - 1])}; three months of spending is ${eur(target)}.`}
      className="w-full"
    >
      <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke={min < 0 ? RED : LINE} />
      {min < 0 && <text x={pad.left} y={y(0) - 3} fontSize="9" fill={MUTED} stroke="#fff" strokeWidth="3" paintOrder="stroke">Zero</text>}
      <line x1={pad.left} x2={W - pad.right} y1={y(target)} y2={y(target)} stroke={GREEN} strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={pad.left} y={y(target) - 4} fontSize="10" fontWeight="600" fill={INK}>Three months of spending: {eur(target)}</text>
      <polyline fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="4" fill={MARK} stroke="#fff" strokeWidth="2">
        <title>{`${day(chart.to)}: ${eur(values[n - 1])}`}</title>
      </circle>
      <text x={pad.left} y={H - 4} fontSize="9" fill={MUTED}>{day(chart.from)}</text>
      <text x={W - pad.right} y={H - 4} fontSize="9" fill={MUTED} textAnchor="end">{day(chart.to)}</text>
    </svg>
  )
}
