import type { Chart } from './assistant'

// A chart the assistant put in a reply (see parseReply in assistant.ts).
// Plain HTML and SVG, sized for the chat card.

// One colour per series, always in this order. The pair is checked for
// colour-blind separation and contrast on white; change it only with a re-check.
const COLORS = ['#1f5fa8', '#d97706']

const number = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 })
const value = (v: number, unit: string) => `${number.format(v)}${unit ? ` ${unit}` : ''}`
// "2026-07" -> "7/2026", as months are written elsewhere in the app.
const label = (s: string) => s.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${Number(m)}/${y}`)

// `onPick`, when given, makes each bar row or point clickable: it gets that row's label.
export function ChatChart({ chart, onPick }: { chart: Chart; onPick?: (label: string) => void }) {
  return (
    <figure className="rounded-lg bg-white p-3">
      <figcaption className="text-sm font-medium">{chart.title}</figcaption>
      {chart.series.length > 1 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {chart.series.map((name, i) => (
            <li key={name} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: COLORS[i] }} />
              {name}
            </li>
          ))}
        </ul>
      )}
      {chart.type === 'line' ? <Lines chart={chart} onPick={onPick} /> : <Bars chart={chart} onPick={onPick} />}
      {onPick && (
        <p className="mt-2 text-[11px] text-muted">
          Tap a {chart.type === 'line' ? 'point' : 'bar'} to ask Walter about it.
        </p>
      )}
    </figure>
  )
}

// Categories compared: one row each, a thin bar per series with its value at the tip.
function Bars({ chart, onPick }: { chart: Chart; onPick?: (label: string) => void }) {
  const max = Math.max(1, ...chart.data.flatMap((d) => d.values))
  return (
    <dl className="mt-2 space-y-1">
      {chart.data.map((d) => (
        <div
          key={d.label}
          {...(onPick && {
            role: 'button',
            tabIndex: 0,
            'aria-label': `Ask about ${label(d.label)}`,
            onClick: () => onPick(d.label),
            onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(d.label)),
          })}
          className={`-mx-1.5 rounded px-1.5 ${onPick ? 'py-1.5 sm:py-0.5' : 'py-0.5'} ${onPick ? 'cursor-pointer transition-colors hover:bg-paper focus-visible:bg-paper focus-visible:outline-none' : ''}`}
        >
          <dt className="truncate text-xs text-muted">{label(d.label)}</dt>
          {d.values.map((v, i) => (
            <dd
              key={i}
              title={`${chart.series[i]}: ${value(v, chart.unit)}`}
              className="mt-1 flex items-center gap-2 text-xs font-medium"
            >
              <span
                aria-hidden="true"
                className="h-2 min-w-0.5 rounded-r"
                style={{ width: `calc((100% - 5rem) * ${Math.max(0, v) / max})`, background: COLORS[i] }}
              />
              <span className="shrink-0">{value(v, chart.unit)}</span>
            </dd>
          ))}
        </div>
      ))}
    </dl>
  )
}

// Change over time: one line per series from a zero baseline, the last value written at its end.
function Lines({ chart, onPick }: { chart: Chart; onPick?: (label: string) => void }) {
  const W = 320
  const H = 150
  const pad = { top: 14, right: 58, bottom: 20, left: 4 }
  const all = chart.data.flatMap((d) => d.values)
  const min = Math.min(0, ...all)
  const max = Math.max(1, ...all)
  const n = chart.data.length
  const x = (i: number) => pad.left + (i / (n - 1)) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * (H - pad.top - pad.bottom)
  // End labels of two series that finish close together are pushed apart.
  const ends = chart.series.map((_, s) => y(chart.data[n - 1].values[s]))
  if (ends.length === 2 && Math.abs(ends[0] - ends[1]) < 11) {
    const mid = (ends[0] + ends[1]) / 2
    const first = ends[0] <= ends[1] ? 0 : 1
    ends[first] = mid - 5.5
    ends[1 - first] = mid + 5.5
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title} className="mt-2 w-full">
      {[max, min].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="#e3e6ea" />
          <text x={pad.left} y={y(v) - 3} fontSize="9" fill="#66727f">
            {value(v, chart.unit)}
          </text>
        </g>
      ))}
      {chart.series.map((name, s) => (
        <g key={name}>
          <polyline
            fill="none"
            stroke={COLORS[s]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={chart.data.map((d, i) => `${x(i)},${y(d.values[s])}`).join(' ')}
          />
          {chart.data.map((d, i) => (
            <g key={i} onClick={onPick && (() => onPick(d.label))} className={onPick ? 'group cursor-pointer' : undefined}>
              {/* a larger invisible target, so the point is easy to tap */}
              {onPick && <circle cx={x(i)} cy={y(d.values[s])} r="14" fill="transparent" />}
              <circle
                cx={x(i)}
                cy={y(d.values[s])}
                r="3"
                fill={COLORS[s]}
                stroke="#fff"
                strokeWidth="1.5"
                className="transition-[r] group-hover:[r:5px]"
              />
              <title>{`${label(d.label)} · ${name}: ${value(d.values[s], chart.unit)}`}</title>
            </g>
          ))}
          <text x={x(n - 1) + 7} y={ends[s] + 3} fontSize="10" fontWeight="600" fill="#0a2540">
            {value(chart.data[n - 1].values[s], chart.unit)}
          </text>
        </g>
      ))}
      <text x={x(0)} y={H - 5} fontSize="9" fill="#66727f">
        {label(chart.data[0].label)}
      </text>
      <text x={x(n - 1)} y={H - 5} fontSize="9" fill="#66727f" textAnchor="end">
        {label(chart.data[n - 1].label)}
      </text>
    </svg>
  )
}
