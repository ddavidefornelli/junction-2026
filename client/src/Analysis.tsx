import { useEffect, useState } from 'react'

// A deliberately unhurried walk through the work behind an important figure, so the
// customer sees what is being checked before the result appears. Each step stays on
// screen for at least STEP_MS; the last one holds until the real data is ready.
const STEP_MS = 1300
const AFTER_HOLD_MS = 900 // steps after the one that waits for the data
const REDUCED_STEP_MS = 250

function stepDuration(ms: number) {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? REDUCED_STEP_MS : ms
  } catch {
    return ms
  }
}

// `key` restarts the walk (a new goal, a retried load). The walk waits at step
// `holdAt` (default: the last one) until `ready` is true; steps after it are
// short. `done` turns true one step after the last one.
export function useStagedProgress(
  count: number,
  ready: boolean,
  key: unknown = null,
  { stepMs = STEP_MS, holdAt = count - 1 }: { stepMs?: number; holdAt?: number } = {},
) {
  const [state, setState] = useState({ key, step: 0 })
  const step = Object.is(state.key, key) ? state.step : 0
  useEffect(() => {
    if (step >= count) return
    if (step >= holdAt && !ready) return
    const timer = setTimeout(() => setState({ key, step: step + 1 }), stepDuration(step > holdAt || (step === holdAt && step < count - 1) ? AFTER_HOLD_MS : stepMs))
    return () => clearTimeout(timer)
  }, [key, step, count, ready, stepMs, holdAt])
  return { step, done: step >= count }
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-credit" aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="currentColor" opacity=".12" />
      <path d="M4.75 8.25 7 10.5l4.25-4.75" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-[spin_1.6s_linear_infinite] rounded-full border-2 border-line border-t-ink"
    />
  )
}

function Lock() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function ProgressBar({ step, count }: { step: number; count: number }) {
  // The bar runs a little ahead of finished steps so it never looks stuck.
  const value = Math.min(100, ((step + 0.65) / count) * 100)
  return (
    <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div
        className="h-full rounded-full bg-ink transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// The full checklist, for a card or page of its own.
export function AnalysisSteps({ title, steps, step }: { title: string; steps: readonly string[]; step: number }) {
  const current = steps[Math.min(step, steps.length - 1)]
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <ProgressBar step={step} count={steps.length} />
      </div>
      <ol className="space-y-2.5 text-sm">
        {steps.map((text, i) => (
          <li
            key={text}
            className={`flex items-center gap-2.5 transition-opacity duration-700 ${
              i < step ? '' : i === step ? 'animate-fade-up' : 'opacity-35'
            }`}
          >
            {i < step ? <Check /> : i === step ? <Spinner /> : <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden="true" />}
            <span className={i <= step ? '' : 'text-muted'}>{text}</span>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Lock /> Only your figures are analysed. Your customer ID and account number are never sent.
      </p>
      <p className="sr-only" role="status" aria-live="polite">{current}</p>
    </div>
  )
}
