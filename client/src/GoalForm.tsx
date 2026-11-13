import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { eur } from './format'
import {
  COMMUTE_KM,
  COMMUTE_MODE,
  COUNTS_ADULTS,
  COUNTS_CHILDREN,
  DEADLINES,
  GOALS,
  HOUSING,
  monthYear,
  paceOptions,
  type GoalProfile,
} from './goal'

// One-tap answers: real radio buttons styled as pills, so keyboard and screen
// readers work as usual.
function Chips<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: readonly (readonly [T, string])[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <label
            key={id}
            className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === id}
              onChange={() => onChange(id)}
            />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function GoalForm({
  year,
  initial,
  savingRange,
  onSave,
  onClose,
}: {
  year: number
  initial: GoalProfile | null
  // What this customer sets aside a month today, and the most a plan for the draft goal could free; null if unknown.
  savingRange: (draft: GoalProfile) => Promise<{ usual: number; max: number } | null>
  onSave: (profile: GoalProfile) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [p, setP] = useState<Omit<GoalProfile, 'goal'> & { goal: GoalProfile['goal'] | null }>(
    initial ?? {
      year,
      goal: null,
      goalText: '',
      targetEur: null,
      deadlineMonths: null,
      pace: null,
      adults: null,
      children: null,
      housing: null,
      commuteKm: null,
      commuteMode: null,
    },
  )
  const set = (patch: Partial<GoalProfile>) => setP((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    // No close() on cleanup: it would fire onClose when StrictMode re-runs the effect.
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  // What is realistic depends on the goal, the household and the commute, so it
  // is looked up again when those change (after a pause, while a goal is typed).
  const [range, setRange] = useState<{ usual: number; max: number } | null>(null)
  const { goal, goalText, adults, children, commuteKm, commuteMode } = p
  useEffect(() => {
    if (!goal || (goal === 'other' && !goalText.trim())) return
    let stale = false
    const timer = setTimeout(() => {
      savingRange({ ...p, goal, goalText: goalText.trim() })
        .then((value) => !stale && setRange(value))
        .catch(() => !stale && setRange(null))
    }, goal === 'other' ? 500 : 0)
    return () => {
      stale = true
      clearTimeout(timer)
    }
    // Only the answers that change the range; the amount and the pace do not.
  }, [goal, goalText, adults, children, commuteKm, commuteMode, savingRange])

  // Instead of asking for a date that may be out of reach, offer paces that all
  // work for this customer; each one implies its own date.
  const paces = useMemo(
    () => (range && p.targetEur ? paceOptions(p.targetEur, range.usual, range.max) : []),
    [range, p.targetEur],
  )
  const pace = paces.find((option) => option.id === p.pace) ?? null
  const finish = (months: number) => {
    const now = new Date()
    return monthYear(new Date(now.getFullYear(), now.getMonth() + months, 1))
  }

  const ready = p.goal !== null && (p.goal !== 'other' || p.goalText.trim() !== '')
  const hasAmount = p.goal === 'buffer' || p.goal === 'home' || p.goal === 'debt'
  const commutes = p.commuteKm !== null && p.commuteKm !== 'none'

  // With the range unknown (classifier offline) the plain lengths below are offered instead.
  const months = !hasAmount || !p.targetEur ? null : range ? (pace?.months ?? null) : Number(p.deadlineMonths) || null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || !p.goal) return
    onSave({
      ...p,
      year,
      goal: p.goal,
      goalText: p.goal === 'other' ? p.goalText.trim() : '',
      targetEur: hasAmount ? p.targetEur : null,
      deadlineMonths: months,
      pace: pace?.id ?? null,
      // Editing other answers must not restart the clock on an unchanged deadline.
      setAt:
        initial?.setAt && Number(initial.deadlineMonths) === months
          ? initial.setAt
          : new Date().toISOString().slice(0, 10),
      commuteMode: commutes ? p.commuteMode : null,
    })
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="goal-form-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-white p-0 text-ink backdrop:bg-ink/40"
    >
      <form onSubmit={submit} className="space-y-5 p-5">
        <div>
          <h2 id="goal-form-title" className="text-lg font-semibold tracking-tight">
            Your financial goal for {year}
          </h2>
          <p className="mt-1 text-sm text-muted">
            A few taps. Only the goal is required; the rest makes your analysis more accurate.
          </p>
        </div>

        <Chips legend="What do you want to achieve?" name="goal" options={GOALS} value={p.goal} onChange={(goal) => set({ goal })} />

        {p.goal === 'other' && (
          <input
            value={p.goalText}
            onChange={(e) => set({ goalText: e.target.value })}
            autoFocus
            maxLength={80}
            aria-label="Your goal"
            placeholder="e.g. Afford a family holiday"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-ink"
          />
        )}
        {hasAmount && (
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted">How much? (optional)</span>
            <span className="flex min-w-0 flex-1 items-center rounded-md border border-line px-3 focus-within:border-ink">
              <span className="text-muted">€</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={p.targetEur ?? ''}
                onChange={(e) => set({ targetEur: e.target.value ? Math.max(1, Math.round(+e.target.value)) : null })}
                placeholder="5000"
                className="min-w-0 flex-1 py-2 pl-2 outline-none placeholder:text-muted"
              />
            </span>
          </label>
        )}
        {hasAmount && !p.targetEur && (
          <p className="-mt-2 text-sm text-muted">Add an amount to see how fast you could get there.</p>
        )}
        {hasAmount && p.targetEur !== null && range && paces.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How fast?</legend>
            <div className="space-y-2">
              {paces.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
                >
                  <input
                    type="radio"
                    name="pace"
                    className="sr-only"
                    checked={pace?.id === option.id}
                    onChange={() => set({ pace: option.id })}
                  />
                  <span>
                    <span className="block font-medium">{option.name}</span>
                    <span className="block opacity-70">{option.note}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium">{eur(option.monthly)} a month</span>
                    <span className="block opacity-70">done by {finish(option.months)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {hasAmount && p.targetEur !== null && range && paces.length === 0 && (
          <p className="-mt-2 text-sm text-muted">
            Right now your spending uses all of your income, so there is no monthly amount to plan
            with yet. You can still save this goal, or start with "Spend less".
          </p>
        )}
        {hasAmount && p.targetEur !== null && !range && (
          <Chips
            legend="By when?"
            name="deadline"
            options={DEADLINES}
            value={p.deadlineMonths ? (String(p.deadlineMonths) as (typeof DEADLINES)[number][0]) : null}
            onChange={(length) => set({ deadlineMonths: Number(length) })}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Chips legend="Adults at home" name="adults" options={COUNTS_ADULTS} value={p.adults} onChange={(adults) => set({ adults })} />
          <Chips legend="Children" name="children" options={COUNTS_CHILDREN} value={p.children} onChange={(children) => set({ children })} />
        </div>

        <Chips legend="Your home" name="housing" options={HOUSING} value={p.housing} onChange={(housing) => set({ housing })} />

        <Chips legend="Distance to work, one way" name="commuteKm" options={COMMUTE_KM} value={p.commuteKm} onChange={(commuteKm) => set({ commuteKm })} />
        {commutes && (
          <Chips legend="How do you get there?" name="commuteMode" options={COMMUTE_MODE} value={p.commuteMode} onChange={(commuteMode) => set({ commuteMode })} />
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm underline underline-offset-4">
            Cancel
          </button>
          <button disabled={!ready} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Save goal
          </button>
        </div>
      </form>
    </dialog>
  )
}
