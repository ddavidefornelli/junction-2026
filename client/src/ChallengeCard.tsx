import { useMemo, useState } from 'react'
import type { Transaction } from './api'
import type { Baskets } from './baskets'
import { makeOffers, plan, progress, todayOf, type Challenge, type Offer, type Progress } from './challenges'
import type { Suggestion } from './mcc'

// A challenge, from start to finish (see challenges.ts): pick one, plan it,
// accept it, then follow how it is going. The accepted challenge is kept in
// this browser for this customer ID.

const MARK = '#00843d' // the customer's own figures
const GREEN = '#0b7a4b'
const LINE = '#e2e4ec'
const MUTED = '#5f667a'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))

const STATES: Record<Progress['state'], { label: string; mark: string; style: string }> = {
  on: { label: 'On track', mark: '✓', style: 'bg-credit/10 text-credit' },
  behind: { label: 'Behind', mark: '!', style: 'bg-amber-100 text-amber-900' },
  won: { label: 'Done', mark: '★', style: 'bg-credit/10 text-credit' },
  missed: { label: 'Not this time', mark: '×', style: 'bg-paper text-muted' },
}

// The accepted challenge, kept in this browser for this customer ID.
export function useChallenge(customerId: string): [Challenge | null, (next: Challenge | null) => void] {
  const key = `challenge-v1:${customerId}`
  const [active, setActive] = useState<Challenge | null>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
  })
  const save = (next: Challenge | null) => {
    setActive(next)
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next))
      else localStorage.removeItem(key)
    } catch { /* private browsing */ }
  }
  return [active, save]
}

export function ChallengeCard({ active, onChange: save, all, baskets, tips, onAsk }: {
  active: Challenge | null
  onChange: (next: Challenge | null) => void
  all: Transaction[]
  baskets: Baskets | null
  tips: Suggestion[]
  onAsk: (question: string) => void
}) {
  const offers = useMemo(() => makeOffers({ baskets, tips, all }), [baskets, tips, all])

  if (active) return <Tracker challenge={active} all={all} onEnd={() => save(null)} onAsk={onAsk} />
  if (offers.length === 0 || all.length === 0) return null
  return <Picker offers={offers} today={todayOf(all)} onStart={save} />
}

// Pick a challenge, then set how long and how hard before accepting it.
function Picker({ offers, today, onStart }: { offers: Offer[]; today: string; onStart: (c: Challenge) => void }) {
  const [picked, setPicked] = useState<Offer | null>(null)
  const [days, setDays] = useState(0)
  const [effort, setEffort] = useState(0)

  if (!picked)
    return (
      <section aria-labelledby="challenge-title" className="rounded-lg bg-white">
        <div className="p-6">
          <h2 id="challenge-title" className="text-lg font-bold">Take a challenge</h2>
          <p className="mt-1 text-sm text-muted">One simple goal with an end date. Pick one, set it up, and follow it here.</p>
          <ul className="mt-3">
            {offers.map((o) => (
              <li key={o.kind} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    setPicked(o)
                    setDays(o.lengths[o.lengths.length - 1])
                    setEffort(0)
                  }}
                  className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{o.name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{o.pitch}</span>
                  </span>
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper">→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )

  const share = picked.efforts[effort]?.share ?? 1
  const c = plan(picked, days, share, today)
  return (
    <section aria-labelledby="challenge-title" className="rounded-lg bg-white ring-2 ring-accent">
      <div className="p-6">
        <button type="button" onClick={() => setPicked(null)} className="tap text-sm underline underline-offset-4">← Other challenges</button>
        <p className="mt-4 text-sm font-semibold text-accent">{picked.name}</p>
        <h2 id="challenge-title" className="mt-1 text-4xl font-extrabold tracking-tight">{c.title}</h2>
        <p className="mt-1 text-sm text-muted">{picked.pitch}</p>

        <Choice
          label="How long"
          options={picked.lengths.map((n) => ({ value: n, label: `${n} days` }))}
          value={days}
          onChange={setDays}
        />
        {picked.efforts.length > 0 && (
          <Choice
            label="How hard"
            options={picked.efforts.map((e, i) => ({ value: i, label: e.label }))}
            value={effort}
            onChange={setEffort}
          />
        )}

        <div className="mt-4 rounded-md bg-paper p-4">
          <p className="text-xs font-semibold text-accent">Your rule</p>
          <p className="mt-1 text-sm font-medium">{c.rule}</p>
        </div>

        <button type="button" onClick={() => onStart(c)} className="mt-4 w-full rounded-full bg-accent py-3 font-semibold text-white hover:bg-accent/90">
          I'm in. Start today
        </button>
        <p className="mt-2 text-center text-xs text-muted">Nothing is moved or blocked. This only tracks how you are doing.</p>
      </div>
    </section>
  )
}

function Choice<T extends number>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm text-muted">{label}</legend>
      <div className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-full px-2 py-2.5 text-sm ${value === o.value ? 'bg-ink font-semibold text-white' : 'bg-paper hover:bg-line'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// How the accepted challenge is going.
function Tracker({ challenge: c, all, onEnd, onAsk }: { challenge: Challenge; all: Transaction[]; onEnd: () => void; onAsk: (question: string) => void }) {
  const [stopping, setStopping] = useState(false)
  const p = useMemo(() => progress(c, all), [c, all])
  const state = STATES[p.state]
  const finished = p.state === 'won' || p.state === 'missed'
  const done = p.unit === 'eur' ? eur(p.done) : String(p.done)
  const target = p.unit === 'eur' ? eur(p.target) : `${p.target} days`

  return (
    <section aria-labelledby="challenge-title" className="rounded-lg bg-white ring-2 ring-accent">
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-accent">Your challenge, day {p.day} of {p.days}</p>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${state.style}`}>
            <span aria-hidden="true">{state.mark}</span>{state.label}
          </span>
        </div>
        <h2 id="challenge-title" className="mt-2 text-lg font-bold">{c.title}</h2>
        <p className="mt-2 font-display text-5xl font-extrabold tracking-tight">
          {done} <span className="font-sans text-base font-normal tracking-normal text-muted">of {target}{p.unit === 'eur' ? ' saved' : ''}</span>
        </p>

        <div
          role="progressbar"
          aria-label="Progress towards the goal"
          aria-valuemin={0}
          aria-valuemax={p.target}
          aria-valuenow={Math.round(Math.min(p.done, p.target))}
          className="mt-3 h-3 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(1, p.done / p.target) * 100}%` }} />
        </div>

        <div className="mt-4">
          {p.spent ? <Spent spent={p.spent} days={p.days} title={c.title} /> : <Marks marks={p.marks!} days={p.days} kind={c.kind} />}
        </div>

        <div className="mt-4 rounded-md bg-paper p-4">
          <p className="text-xs font-semibold text-accent">{finished ? 'Result' : 'Do this'}</p>
          <p className="mt-1 text-sm font-medium">{p.next}</p>
          {!finished && <p className="mt-1 text-sm text-muted">{c.rule}</p>}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          {finished ? (
            <button type="button" onClick={onEnd} className="w-full rounded-full bg-accent py-3 font-semibold text-white hover:bg-accent/90">Pick a new challenge</button>
          ) : stopping ? (
            <p role="alert" className="flex flex-wrap items-center gap-3">
              Stop this challenge? Your progress is cleared.
              <button type="button" onClick={onEnd} className="tap font-medium text-red-700 underline underline-offset-4">Yes, stop</button>
              <button type="button" onClick={() => setStopping(false)} className="tap underline underline-offset-4">Keep going</button>
            </p>
          ) : (
            <>
              <button type="button" onClick={() => onAsk(`I am on day ${p.day} of my challenge "${c.title}". ${c.rule} How do I stick to it?`)} className="tap underline underline-offset-4">
                Ask Walter for help <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={() => setStopping(true)} className="tap text-muted underline underline-offset-4">Stop the challenge</button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// What was spent so far, day by day, under the line of the most the challenge allows.
function Spent({ spent, days, title }: { spent: NonNullable<Progress['spent']>; days: number; title: string }) {
  const W = 320
  const H = 120
  const pad = { top: 14, right: 6, bottom: 18, left: 2 }
  let sum = 0
  const total = [0, ...spent.byDay.map((v) => (sum += v))]
  const max = Math.max(1, spent.allowed, sum)
  const x = (d: number) => pad.left + (d / days) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)
  const last = total.length - 1
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent" />You spent: <span className="font-medium text-ink">{eur(sum)}</span></li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-4 border-t-2 border-dashed border-credit" />Your limit: <span className="font-medium text-ink">{eur(spent.allowed)} in all</span></li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. You spent ${eur(sum)} so far; the limit for the whole challenge is ${eur(spent.allowed)}.`} className="mt-1 w-full">
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke={LINE} />
        <line x1={x(0)} y1={y(0)} x2={x(days)} y2={y(spent.allowed)} stroke={GREEN} strokeWidth="1.5" strokeDasharray="4 3" />
        <polyline fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={total.map((v, d) => `${x(d)},${y(v)}`).join(' ')} />
        <circle cx={x(last)} cy={y(sum)} r="4" fill={MARK} stroke="#fff" strokeWidth="2">
          <title>{`Day ${last}: ${eur(sum)} spent`}</title>
        </circle>
        <text x={pad.left} y={H - 4} fontSize="9" fill={MUTED}>Day 1</text>
        <text x={W - pad.right} y={H - 4} fontSize="9" fill={MUTED} textAnchor="end">Day {days}</text>
      </svg>
    </div>
  )
}

// One square a day: reached, not reached, or still to come.
function Marks({ marks, days, kind }: { marks: boolean[]; days: number; kind: Challenge['kind'] }) {
  const good = kind === 'zero' ? 'Above zero' : 'Zero-euro day'
  const bad = kind === 'zero' ? 'Below zero' : 'Spent on fun extras'
  return (
    <div>
      <ol className="flex flex-wrap gap-1" aria-label={`${marks.filter(Boolean).length} of ${marks.length} days so far: ${good.toLowerCase()}`}>
        {Array.from({ length: days }, (_, i) => (
          <li
            key={i}
            title={`Day ${i + 1}: ${i >= marks.length ? 'to come' : marks[i] ? good : bad}`}
            className={`flex size-5 items-center justify-center rounded text-[10px] font-semibold ${
              i >= marks.length ? 'border border-line' : marks[i] ? 'bg-credit text-white' : 'bg-slate-300 text-ink'
            }`}
          >
            <span aria-hidden="true">{i >= marks.length ? '' : marks[i] ? '✓' : '×'}</span>
          </li>
        ))}
      </ol>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-credit" />{good}</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-slate-300" />{bad}</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border border-line" />To come</li>
      </ul>
    </div>
  )
}
