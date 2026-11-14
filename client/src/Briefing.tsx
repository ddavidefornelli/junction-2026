import { useEffect, useRef, useState } from 'react'
import { WalterAvatar } from './WalterAvatar'
import { speak, stopSpeaking, useVoice } from './voice'

// The morning briefing: one minute, once a day. Where the customer's money
// stands today, what to do and what to avoid, read aloud by Walter.
// A big button at the top of the page opens it; it is written once per
// customer per day (chat.ts, morningBriefing) and kept for that day.

export type Briefing = { headline: string; situation: string; todo: string[]; avoid: string[]; spoken: string }

const LENGTH_S = 60

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null // private browsing
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private browsing: kept for this visit only
  }
}

async function fetchBriefing(context: string, mode: string): Promise<Briefing> {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const res = await fetch('/api/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, today, mode }),
  })
  if (!res.ok) {
    const error = (await res.json().catch(() => null))?.error
    throw new Error(error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function MorningBriefing({ customerId, context, mode }: { customerId: string; context: string | null; mode: string }) {
  const key = `briefing:v2:${customerId}:${todayKey()}`
  const seenKey = `${key}:seen`
  const [briefing, setBriefing] = useState<Briefing | null>(() => read<Briefing>(key))
  const [error, setError] = useState<string | null>(null)
  const [seen, setSeen] = useState(() => read<boolean>(seenKey) === true)
  const [open, setOpen] = useState(false)
  const pending = useRef<Promise<Briefing> | null>(null)

  // Written ahead as soon as the figures are in, so the button plays at once.
  const load = () => {
    if (!context) return null
    if (!pending.current) {
      pending.current = fetchBriefing(context, mode)
      pending.current
        .then((b) => {
          setBriefing(b)
          write(key, b)
        })
        .catch((e) => {
          pending.current = null
          setError(e instanceof Error ? e.message : 'Unknown error')
        })
    }
    return pending.current
  }
  useEffect(() => {
    if (!briefing && context && !error) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context])

  const start = () => {
    setError(null)
    setOpen(true)
    setSeen(true)
    write(seenKey, true)
    if (!briefing) load()
  }

  const ready = context !== null

  return (
    <>
      <button
        onClick={start}
        disabled={!ready}
        aria-label="Play your one-minute morning briefing"
        className="mb-5 flex w-full items-center gap-3 rounded-full bg-white py-2 pl-2 pr-5 text-left transition hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep disabled:cursor-wait"
      >
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-deep text-white ${ready && !seen ? 'briefing-pulse' : ''}`}>
          {ready ? (
            <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor" aria-hidden>
              <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z" />
            </svg>
          ) : (
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
        </span>
        <span className="flex-1 font-semibold">{ready ? 'Morning briefing' : 'Preparing your briefing…'}</span>
        <span className="text-sm text-muted">1 min</span>
      </button>

      {open && <BriefingDialog briefing={briefing} error={error} onRetry={() => { setError(null); load() }} onClose={() => setOpen(false)} />}
    </>
  )
}

function BriefingDialog({ briefing, error, onRetry, onClose }: { briefing: Briefing | null; error: string | null; onRetry: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const voice = useVoice()
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])
  useEffect(() => stopSpeaking, [])

  // Walter starts reading as soon as the briefing is there.
  const play = (b: Briefing) => {
    setElapsed(0)
    setPlaying(true)
    speak(b.spoken).finally(() => setPlaying(false))
  }
  useEffect(() => {
    if (briefing) play(briefing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing])

  // The minute ticks while Walter talks (or, without sound, while the card is open).
  useEffect(() => {
    if (!briefing) return
    const t = setInterval(() => setElapsed((s) => Math.min(LENGTH_S, s + 1)), 1000)
    return () => clearInterval(t)
  }, [briefing])

  const talking = voice.speaking || voice.loading
  const left = LENGTH_S - elapsed

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="briefing-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[85vh] overflow-y-auto px-6 pb-7 pt-5 sm:px-8">
        <div className="flex items-center gap-3">
          <WalterAvatar talking={voice.speaking} />
          <p className="flex-1 text-sm text-muted">
            Morning briefing{' '}
            <span className="tabular-nums">· {briefing ? `0:${String(left).padStart(2, '0')}` : '1 min'}</span>
          </p>
          {briefing && (
            <button
              onClick={() => (talking || playing ? stopSpeaking() : play(briefing))}
              className="text-sm font-medium text-accent-deep underline-offset-4 hover:underline"
            >
              {talking ? 'Pause' : 'Listen'}
            </button>
          )}
          <button onClick={() => dialog.current?.close()} aria-label="Close briefing" className="-mr-2 rounded-full p-2 text-muted hover:bg-paper hover:text-ink">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={LENGTH_S} aria-valuenow={elapsed}>
          <div className="h-full bg-accent-deep transition-[width] duration-1000 ease-linear" style={{ width: `${(elapsed / LENGTH_S) * 100}%` }} />
        </div>

        {error ? (
          <div className="mt-6 text-sm text-red-700">
            <p>Walter could not write today's briefing. {error}</p>
            <button className="mt-2 underline" onClick={onRetry}>Try again</button>
          </div>
        ) : !briefing ? (
          <div className="mt-6 space-y-3" aria-busy>
            {[70, 95, 85, 60].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded-full bg-paper" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="animate-fade-up">
            <h2 id="briefing-title" className="mt-6 font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-[28px]">
              {briefing.headline}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{briefing.situation}</p>
            <List title="Today" items={briefing.todo} />
            <List title="Skip" items={briefing.avoid} />
          </div>
        )}
      </div>
    </dialog>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 font-display text-base font-bold">{title}</h3>
      <ol className="space-y-2.5">
        {items.map((t, i) => (
          <li key={t} className="flex gap-3 text-[15px] leading-snug">
            <span className="w-4 shrink-0 tabular-nums text-muted">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
