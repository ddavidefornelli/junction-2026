import { useEffect, useRef, useState } from 'react'
import { sendChat, type ChatMessage } from './assistant'
import { at, dryYear, futureContext, gap, invested, MAX_YEARS, RETURN, runsOut, type Future } from './future'
import { Talk } from './Talk'
import { WellnessApple } from './WellnessApple'
import { speak, stopSpeaking, useVoice } from './voice'

// "Call your future self": pick how far ahead, see the two futures side by side
// (future.ts works them out), then call one of them and talk. The voice on the
// line is the model playing the customer some years on (FUTURE in chat.ts),
// with a voice of its own; every figure it quotes is one shown here.

const GREY = '#9aa7b4'
const GREEN = '#0b7a4b'
const LINE = '#e2e4ec'
const MUTED = '#5f667a'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
// Where the slider starts: far enough for compounding to show, or the year the money runs out.
const startYears = (f: Future) => {
  const dry = runsOut(f)
  return f.why === 'danger' && dry !== null ? Math.min(MAX_YEARS, Math.max(1, Math.ceil(dry))) : MAX_YEARS
}
const MAX_SUMMARY = 11000 // room for the "Future call" section within the server's limit
const QUESTIONS = ['What is it like there?', 'What do you wish I had done?', 'What should I do first?']

// The card on the overview that opens the call.
export function FutureCard({ future, context, age }: { future: Future; context: string | null; age: number | null }) {
  const [open, setOpen] = useState(false)
  const years = startYears(future)
  const then = at(future, years, false).year
  const dry = runsOut(future)
  return (
    <section aria-labelledby="future-title" className="rounded-lg bg-ink p-6 text-white">
      <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Time machine</p>
      <h2 id="future-title" className="mt-2 text-2xl leading-tight font-extrabold">Call your future self</h2>
      <p className="mt-2 text-sm text-white/75">
        {future.why === 'danger'
          ? dry !== null && dry <= MAX_YEARS
            ? `At today’s pace your account runs dry in ${dryYear(future)}. Two of you pick up in ${then}: the one who lives there, and the one who turned it round.`
            : `At today’s pace your money keeps shrinking. Two of you pick up in ${then}: the one who let it, and the one who turned it round.`
          : `Two of you pick up in ${then}: one who changed nothing, and one who invested ${eur(invested(future))} a month and is ${eur(gap(future, years))} ahead. Hear what each has to say.`}
      </p>
      <button onClick={() => setOpen(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white px-3 py-3 text-sm font-semibold text-ink hover:bg-paper">
        <PhoneIcon /> Make the call
      </button>
      {open && <FutureDialog future={future} context={context} age={age} onClose={() => setOpen(false)} />}
    </section>
  )
}

function FutureDialog({ future: f, context, age, onClose }: { future: Future; context: string | null; age: number | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const voice = useVoice()
  const [years, setYears] = useState(() => startYears(f))
  // Which future is on the line; null while choosing.
  const [changed, setChanged] = useState<boolean | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [greeted, setGreeted] = useState(false)
  const [error, setError] = useState(false)
  const messages = useRef<ChatMessage[]>([])
  const call = useRef(0) // replies to an earlier call are dropped

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])
  // Hanging up by closing the dialog.
  useEffect(() => () => {
    call.current++
    stopSpeaking()
  }, [])

  // The future self's answer to `text`, once it has been said out loud (null when there is none).
  async function say(text: string, which: boolean, shown = true): Promise<string | null> {
    if (context === null) return null
    const id = call.current
    const sent: ChatMessage[] = [...messages.current, { role: 'user', content: text }]
    setAsked(shown ? text : null)
    setSaid('')
    setError(false)
    setBusy(true)
    try {
      const summary = `${context.slice(0, MAX_SUMMARY)}\n\n${futureContext(f, years, which, age)}`
      const reply = await sendChat(summary, null, sent, (part) => id === call.current && setSaid(part), true, true)
      if (id !== call.current) return null
      messages.current = [...sent, { role: 'assistant', content: reply }]
      setBusy(false)
      await speak(reply, 'future')
      return id === call.current ? reply : null
    } catch (e) {
      if (id !== call.current) return null
      console.error('[future] No answer', e)
      setBusy(false)
      setError(true)
      return null
    }
  }

  function dial(which: boolean) {
    call.current++
    messages.current = []
    setChanged(which)
    setGreeted(false)
    void say('(The call connects.)', which, false).then(() => setGreeted(true))
  }

  function hangUp() {
    call.current++
    stopSpeaking()
    setChanged(null)
    setBusy(false)
    setSaid('')
    setAsked(null)
    setError(false)
  }

  const same = at(f, years, false)
  const other = at(f, years, true)
  const talking = voice.speaking || voice.loading

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="future-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-white p-0 text-ink shadow-xl backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[90vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 id="future-dialog-title" className="font-semibold">Call your future self</h2>
            <p className="text-xs text-muted">An illustration, not a forecast. Invested money is assumed to grow {Math.round(RETURN * 100)}% a year; markets can fall.</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-paper">×</button>
        </div>

        {changed === null ? (
          <>
            <div className="mt-5 rounded-2xl bg-ink p-5 text-white">
              <div className="flex items-end justify-between gap-4">
                <p className="font-display text-6xl leading-none font-extrabold tracking-tight tabular-nums sm:text-7xl">{same.year}</p>
                <p className="pb-1 text-right text-sm text-white/75">
                  {years} {years === 1 ? 'year' : 'years'} from now
                  {age !== null && <span className="block">You are {age + years}</span>}
                </p>
              </div>
              <input
                type="range" min={1} max={MAX_YEARS} step={1} value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                aria-label="Years from now" aria-valuetext={`${years} years from now, ${same.year}`}
                className="mt-5 block w-full accent-white"
              />
            </div>

            <Lines future={f} years={years} />

            <div className="mt-4 space-y-3">
              {[{ which: false, point: same, name: 'Same habits', note: 'You change nothing' }, { which: true, point: other, name: f.label, note: invested(f) > 0 ? `${eur(invested(f))} invested a month` : `${eur(f.extra)} more kept a month` }].map(({ which, point, name, note }) => (
                <div key={name} className={`rounded-2xl p-4 ${which ? 'bg-credit/10' : 'bg-paper'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs text-muted">{note}</p>
                    </div>
                    <WellnessApple stage={point.stage} className="apple-morph size-12 shrink-0" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                  <div>
                  <p className={`font-display text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl ${point.balance < 0 ? 'text-red-700' : which ? 'text-credit' : ''}`}>{eur(point.balance)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {point.balance < 0 ? 'Below zero' : `Pays for ${Math.floor(point.cover)} ${Math.floor(point.cover) === 1 ? 'month' : 'months'} of spending`}
                    {point.growth > 0 && <span className="block font-medium text-credit">{eur(point.growth)} of it is growth</span>}
                  </p>
                  </div>
                  <button
                    onClick={() => dial(which)}
                    disabled={context === null}
                    className={`flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm whitespace-nowrap font-semibold text-white disabled:opacity-40 ${which ? 'bg-credit hover:bg-credit/90' : 'bg-ink hover:bg-ink/90'}`}
                  >
                    <PhoneIcon /> Call this you
                  </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              The gap by {same.year}: <strong>{eur(gap(f, years))}</strong>, if you {f.change}.
            </p>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-2xl bg-ink p-5 text-white">
              <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">On the line</p>
              <p className="mt-1 font-display text-3xl font-extrabold tracking-tight">You, in {(changed ? other : same).year}</p>
              <p className="mt-1 text-sm text-white/75">
                {changed ? f.label : 'Same habits'} · {eur((changed ? other : same).balance)}
              </p>
              {asked && <p className="mt-4 text-xs text-white/60">You: {asked}</p>}
              <p className="mt-3 min-h-20 text-sm leading-relaxed whitespace-pre-wrap" aria-live="polite">
                {error ? 'The line dropped. Try again.' : said || (busy ? `Ringing ${(changed ? other : same).year}…` : '')}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {QUESTIONS.map((q) => (
                <button key={q} onClick={() => void say(q, changed)} disabled={busy || talking}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink disabled:opacity-40">
                  {q}
                </button>
              ))}
            </div>

            <Talk
              who="Future you"
              ask={(text) => say(text, changed)}
              disabled={!greeted || busy || talking}
              avatar={
                <span className={`relative rounded-full bg-paper p-2 ${voice.speaking ? 'walter-talking' : ''}`}>
                  <WellnessApple stage={(changed ? other : same).stage} className="size-16" />
                </span>
              }
            />
            <div className="mt-2 flex justify-center gap-3">
              <button onClick={hangUp} className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Hang up</button>
              <button onClick={() => dial(!changed)} className="rounded-full bg-paper px-5 py-2.5 text-sm font-semibold hover:bg-line">Call the other you</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

// The two futures as lines from today to MAX_YEARS, with the chosen year marked.
function Lines({ future: f, years }: { future: Future; years: number }) {
  const W = 320, H = 110, PAD = 8
  const all = [0, 1].map((c) => Array.from({ length: MAX_YEARS + 1 }, (_, n) => at(f, n, c === 1).balance))
  const ends = all.flat()
  const lo = Math.min(0, ...ends)
  const hi = Math.max(1, ...ends)
  const x = (y: number) => PAD + (y / MAX_YEARS) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img"
      aria-label={`By ${at(f, years, false).year}: ${eur(at(f, years, false).balance)} with the same habits, ${eur(at(f, years, true).balance)} with the change.`}>
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke={LINE} strokeWidth="1" />
      <line x1={x(years)} x2={x(years)} y1={PAD} y2={H - PAD} stroke={MUTED} strokeWidth="1" strokeDasharray="2 3" />
      {[false, true].map((changed) => (
        <g key={String(changed)}>
          <polyline points={all[changed ? 1 : 0].map((v, n) => `${x(n)},${y(v)}`).join(' ')} fill="none" stroke={changed ? GREEN : GREY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={x(years)} cy={y(at(f, years, changed).balance)} r="5" fill={changed ? GREEN : GREY} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
      <circle cx={x(0)} cy={y(f.balance)} r="3" fill={MUTED} />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  )
}
