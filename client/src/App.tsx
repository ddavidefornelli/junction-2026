import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  PAGE_SIZE,
  getCustomer,
  getMortgage,
  getTransactions,
  getWellnessTransactions,
  classify,
  verdictKey,
  type Mortgage,
  type Transaction,
  type Verdict,
} from './api'
import { date, eur, label, percent, signedEur } from './format'
import { calculateWellness, emptyAnswers, wellnessScores, type Wellness, type WellnessAnswers } from './wellness'
import { GoalForm } from './GoalForm'
import { deadline, goalLabel, goalStatement, loadGoalProfile, monthYear, saveGoalProfile, type GoalProfile } from './goal'
import { makePlan, txId, type Plan } from './plan'
import { kindOf, suggestions, type Suggestion } from './mcc'
import { Chat } from './Chat'
import { WalterAvatar } from './WalterAvatar'
import { buildContext, type ChatMessage } from './assistant'

const SESSION_KEY = 'customerId'

export default function App() {
  const [customerId, setCustomerId] = useState(() => sessionStorage.getItem(SESSION_KEY))

  if (!customerId) {
    return (
      <Login
        onLogin={(id) => {
          sessionStorage.setItem(SESSION_KEY, id)
          setCustomerId(id)
        }}
      />
    )
  }
  return (
    <Bank
      key={customerId}
      customerId={customerId}
      onLogout={() => {
        sessionStorage.removeItem(SESSION_KEY)
        setCustomerId(null)
      }}
    />
  )
}

function Login({ onLogin }: { onLogin: (id: string) => void }) {
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = id.trim().toUpperCase()
    if (!value) return
    setBusy(true)
    setError('')
    try {
      const customer = await getCustomer(value)
      if (customer) onLogin(customer.customer_id)
      else setError('Unknown customer ID')
    } catch (error) {
      console.error('[login] Could not look up customer', error)
      setError('Could not reach the bank')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Pankki</h1>
        <label htmlFor="customer-id" className="mb-1.5 block text-sm text-muted">
          Customer ID
        </label>
        <input
          id="customer-id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoFocus
          autoComplete="username"
          className="w-full rounded-md border border-line bg-white px-3 py-2.5 uppercase outline-none focus:border-ink"
        />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="mt-4 w-full rounded-md bg-ink py-2.5 font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </main>
  )
}

type View = 'overview' | 'transactions' | 'wellness' | 'score-details' | 'loan'
function Bank({ customerId, onLogout }: { customerId: string; onLogout: () => void }) {
  const [view, setView] = useState<View>('overview')
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mortgage, setMortgage] = useState<Mortgage | null>(null)
  const [wellness, setWellness] = useState<Wellness | null>(null)
  const [answers, setAnswers] = useState<WellnessAnswers>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`wellness-v1:${customerId}`) ?? 'null')
      return stored && typeof stored === 'object' ? { ...emptyAnswers(), ...stored } : emptyAnswers()
    } catch { return emptyAnswers() }
  })
  const saveAnswers = (next: WellnessAnswers) => {
    setAnswers(next)
    try { localStorage.setItem(`wellness-v1:${customerId}`, JSON.stringify(next)) } catch { /* private browsing */ }
  }
  const [wellnessLoading, setWellnessLoading] = useState(false)
  const [wellnessError, setWellnessError] = useState(false)
  const [wellnessAttempt, setWellnessAttempt] = useState(0)
  const [error, setError] = useState('')
  const year = new Date().getFullYear()
  const [goal, setGoal] = useState(() => {
    const saved = loadGoalProfile(customerId)
    return saved?.year === year ? saved : null
  })
  // Every transaction, oldest first: what budgets and verdicts are worked out from.
  const [allTxs, setAllTxs] = useState<Transaction[] | null>(null)
  // Verdicts per purchase kind, for the goal they were classified against.
  const [verdicts, setVerdicts] = useState<{ goal: string; map: Record<string, Verdict> } | null>(null)
  const [classifyError, setClassifyError] = useState<{ goal: string; message: string } | null>(null)
  const goalText = goal ? goalLabel(goal) : null
  const currentVerdicts = verdicts && verdicts.goal === goalText ? verdicts.map : null

  // Laya's answers per goal wording, asked once each (the goal form asks about drafts too).
  const classified = useRef(new Map<string, Promise<Record<string, Verdict>>>())
  const classifyFor = useCallback((text: string, rows: Transaction[]) => {
    let answer = classified.current.get(text)
    if (!answer) {
      answer = classify(text, rows)
      classified.current.set(text, answer)
      answer.catch(() => classified.current.delete(text)) // let a failed round be retried
    }
    return answer
  }, [])

  // One round of Laya questions per goal: which kinds of purchase help it, and which are optional.
  useEffect(() => {
    if (!goalText || !allTxs || currentVerdicts || classifyError?.goal === goalText) return
    let stale = false
    classifyFor(goalText, allTxs)
      .then((map) => !stale && setVerdicts({ goal: goalText, map }))
      .catch((e) => !stale && setClassifyError({ goal: goalText, message: e instanceof Error ? e.message : 'Unknown error' }))
    return () => {
      stale = true
    }
  }, [goalText, allTxs, currentVerdicts, classifyFor, classifyError])

  // For the goal form: what a draft goal would allow, before it is saved.
  const savingRange = useCallback(
    async (draft: GoalProfile) => {
      if (!allTxs) return null
      const draftPlan = makePlan(draft, allTxs, await classifyFor(goalLabel(draft), allTxs))
      return draftPlan && { usual: draftPlan.usualSaving, max: draftPlan.maxSaving }
    },
    [allTxs, classifyFor],
  )

  const plan = useMemo(
    () => (goal && allTxs && currentVerdicts ? makePlan(goal, allTxs, currentVerdicts) : null),
    [goal, allTxs, currentVerdicts],
  )
  const tips = useMemo(() => (allTxs ? suggestions(allTxs, plan ? !plan.reachable : false) : []), [allTxs, plan])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  // What the assistant knows: the figures on screen. Null until the full history has loaded (or failed to).
  const chatContext = useMemo(
    () =>
      allTxs || wellnessError
        ? buildContext({ balance: txs?.[0]?.balance_after_eur ?? null, wellness, score: wellness ? wellnessScores(wellness, answers).total : null, allTxs, goal, plan, mortgage })
        : null,
    [txs, wellness, answers, wellnessError, allTxs, goal, plan, mortgage],
  )
  const tagOf = useCallback(
    (tx: Transaction): Tag => {
      if (!currentVerdicts) return undefined
      if (currentVerdicts[verdictKey(tx) ?? ''] === 'good') return 'helps'
      return plan?.overBudget.has(txId(tx)) ? 'over' : undefined
    },
    [currentVerdicts, plan],
  )

  useEffect(() => {
    let stale = false
    getTransactions(customerId, 0)
      .then((rows) => {
        if (stale) return
        setTxs(rows)
        setHasMore(rows.length === PAGE_SIZE)
      })
      .catch(() => !stale && setError('Could not load account'))
    getMortgage(customerId)
      .then((m) => !stale && setMortgage(m))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [customerId])

  useEffect(() => {
    if ((view !== 'wellness' && view !== 'overview' && view !== 'score-details') || wellness || wellnessError) return
    let stale = false
    getWellnessTransactions(customerId)
      .then((rows) => {
        if (stale) return
        setAllTxs(rows)
        setWellness(calculateWellness(rows))
      })
      .catch(() => !stale && setWellnessError(true))
      .finally(() => !stale && setWellnessLoading(false))
    // The request starts only on entry or retry, not whenever loading changes.
    setWellnessLoading(true)
    return () => { stale = true }
  }, [view, customerId, wellnessAttempt, wellnessError, wellness])

  const loadMore = useCallback(async () => {
    if (!txs) return
    setLoadingMore(true)
    try {
      const rows = await getTransactions(customerId, txs.length)
      setTxs([...txs, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
    } catch {
      setError('Could not load transactions')
    } finally {
      setLoadingMore(false)
    }
  }, [customerId, txs])

  const tabs: [View, string][] = [
    ['overview', 'Overview'],
    ['transactions', 'Transactions'],
    ...(mortgage ? ([['loan', 'Loan']] as [View, string][]) : []),
  ]

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-12">
      <header className="flex items-center justify-between py-5">
        <span className="text-lg font-semibold tracking-tight">Pankki</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">{customerId}</span>
          <button onClick={onLogout} className="underline underline-offset-4">
            Log out
          </button>
        </div>
      </header>

      <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-line text-sm">
        {tabs.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-current={view === id || ((view === 'wellness' || view === 'score-details') && id === 'overview') ? 'page' : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 ${
              view === id || ((view === 'wellness' || view === 'score-details') && id === 'overview')
                ? 'border-ink font-medium' : 'border-transparent text-muted'
            }`}
          >
            {name}
          </button>
        ))}
      </nav>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {classifyError?.goal === goalText && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          Could not classify purchases: {classifyError.message}.{' '}
          <button className="underline" onClick={() => setClassifyError(null)}>Retry</button>
        </p>
      )}

      {txs === null ? (
        !error && <p className="text-sm text-muted">Loading…</p>
      ) : view === 'overview' ? (
        <Overview
          year={year}
          goal={goal}
          onSaveGoal={(profile) => {
            saveGoalProfile(customerId, profile)
            setGoal(profile)
          }}
          plan={plan}
          tips={tips}
          savingRange={savingRange}
          chat={
            <Chat
              messages={chatMessages}
              onMessages={setChatMessages}
              context={chatContext}
              starters={['How am I doing?', 'Where could I cut back?', goal ? 'Am I on track for my goal?' : 'What should I focus on first?']}
            />
          }
          tagOf={tagOf}
          txs={txs}
          wellness={wellness}
          answers={answers}
          wellnessLoading={wellnessLoading}
          wellnessError={wellnessError}
          onShowWellness={() => setView('score-details')}
          onShowAll={() => setView('transactions')}
        />
      ) : view === 'score-details' ? (
        <ScoreDetails
          wellness={wellness}
          answers={answers}
          loading={wellnessLoading}
          error={wellnessError}
          onBack={() => setView('overview')}
          onShowWellness={() => setView('wellness')}
        />
      ) : view === 'transactions' ? (
        <Transactions
          txs={txs}
          tagOf={tagOf}
          hasMore={hasMore}
          loading={loadingMore}
          onMore={loadMore}
        />
      ) : view === 'wellness' ? (
        wellnessError ? (
          <div className="text-sm text-red-700">
            <p>Could not load financial data.</p>
            <button className="mt-2 underline" onClick={() => {
              setWellnessError(false)
              setWellnessAttempt((n) => n + 1)
            }}>Retry</button>
          </div>
        ) : wellnessLoading || !wellness ? (
          <p className="text-sm text-muted">{wellnessLoading ? 'Calculating across all transactions…' : 'No transactions available.'}</p>
        ) : (
          <FinancialWellness data={wellness} answers={answers} onAnswers={saveAnswers} />
        )
      ) : (
        mortgage && <Loan mortgage={mortgage} />
      )}
    </div>
  )
}

// What a transaction row says about the goal, if anything.
type Tag = 'helps' | 'over' | undefined

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-line bg-white">{children}</section>
}

const SCORE_DESCRIPTIONS = [
  'Your cash flow and buffer may need attention.',
  'A few adjustments could help strengthen your finances.',
  'Your finances show some stability, with room to grow.',
  'You are building a solid financial foundation.',
  'Your finances look strong across these indicators.',
] as const

function scoreDescription(score: number): string {
  if (score === 100) return 'Excellent balance: every score indicator is at its maximum.'
  return SCORE_DESCRIPTIONS[Math.min(4, Math.max(0, Math.floor(score / 20)))]
}

function Overview({
  year,
  goal,
  onSaveGoal,
  plan,
  tips,
  savingRange,
  chat,
  tagOf,
  txs,
  wellness,
  answers,
  wellnessLoading,
  wellnessError,
  onShowWellness,
  onShowAll,
}: {
  year: number
  goal: GoalProfile | null
  onSaveGoal: (profile: GoalProfile) => void
  plan: Plan | null
  tips: Suggestion[]
  savingRange: (draft: GoalProfile) => Promise<{ usual: number; max: number } | null>
  chat: ReactNode
  tagOf: (tx: Transaction) => Tag
  txs: Transaction[]
  wellness: Wellness | null
  answers: WellnessAnswers
  wellnessLoading: boolean
  wellnessError: boolean
  onShowWellness: () => void
  onShowAll: () => void
}) {
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const latest = txs[0]
  if (!latest) return <p className="text-sm text-muted">No account activity.</p>
  const score = wellness ? wellnessScores(wellness, answers).total : null

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5">
          <p className="text-sm text-muted">Current account · {latest.bank_account_id}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {eur(latest.balance_after_eur)}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex h-full min-h-40 flex-col justify-between p-5">
            <div>
              <h2 className="font-medium">Financial score</h2>
              <p className="mt-3 text-3xl font-semibold">
                {score === null ? '—' : `${score} / 100`}
              </p>
              <p className="mt-2 text-sm text-muted">
                {score !== null ? scoreDescription(score) : wellnessError ? 'Score unavailable' : wellnessLoading ? 'Calculating…' : 'Complete the questionnaire to see your score.'}
              </p>
            </div>
            <button onClick={onShowWellness} className="mt-4 self-start text-sm font-medium underline underline-offset-4">
              Details <span aria-hidden="true">↗</span>
            </button>
          </div>
        </Card>
        <Card>
          <div className="flex h-full min-h-40 flex-col p-5">
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <WalterAvatar />
              <div>
                <h2 className="text-sm font-medium">Walter</h2>
                <p className="text-xs text-muted">Your Pankki assistant</p>
              </div>
            </div>
            <div className="my-4 rounded-lg bg-paper p-3 text-sm">
              {goal ? (
                <>
                  <span className="text-muted">Your goal for {year}</span>
                  <span className="mt-0.5 block font-medium">{goalStatement(goal)}</span>
                </>
              ) : (
                "Hi, I'm Walter. Ask me how your finances are doing, or what to do next."
              )}
            </div>
            <button
              onClick={() => setGoalFormOpen(true)}
              className={`mb-4 ${goal ? 'self-start text-sm underline underline-offset-4' : 'rounded-md bg-ink px-3 py-2 text-sm font-medium text-white'}`}
            >
              {goal ? 'Edit goal' : `Set your financial goal for ${year}`}
            </button>
            {chat}
          </div>
        </Card>
      </div>

      {goal && plan && <PlanCard goal={goal} plan={plan} />}

      {tips.length > 0 && <TipsCard tips={tips} />}

      <Card>
        <div className="flex items-baseline justify-between px-5 pt-4 pb-1">
          <h2 className="font-medium">Latest transactions</h2>
          <button onClick={onShowAll} className="text-sm underline underline-offset-4">
            Show all
          </button>
        </div>
        <ul className="divide-y divide-line px-5">
          {txs.slice(0, 5).map((tx, i) => (
            <TxRow key={i} tx={tx} tag={tagOf(tx)} showDate />
          ))}
        </ul>
      </Card>

      {goalFormOpen && (
        <GoalForm
          year={year}
          initial={goal}
          savingRange={savingRange}
          onClose={() => setGoalFormOpen(false)}
          onSave={(profile) => {
            onSaveGoal(profile)
            setGoalFormOpen(false)
          }}
        />
      )}
    </div>
  )
}

function PlanCard({ goal, plan }: { goal: GoalProfile; plan: Plan }) {
  const by = deadline(goal)
  const [year, month] = plan.month.split('-')
  return (
    <Card>
      <div className="p-5">
        <h2 className="font-medium">Your plan</h2>
        <p className="mt-2 text-sm">
          {plan.requiredSaving !== null && by
            ? `To reach ${eur(goal.targetEur)} by ${monthYear(by)}, set aside ${eur(plan.requiredSaving)} a month. You usually set aside ${eur(plan.usualSaving)}.`
            : goal.goal === 'spend'
              ? 'These budgets add up to 10% less than you usually spend.'
              : 'These budgets are what you usually spend. Add an amount and a date to your goal for a plan that gets you there.'}
        </p>
        {!plan.reachable && (
          <p className="mt-2 text-sm text-amber-900">
            Even with every budget cut as far as is sensible, this pace is out of reach. A later date or a
            smaller amount would make the plan workable.
          </p>
        )}
        {plan.categories.length > 0 && (
          <>
            <p className="mt-4 text-sm text-muted">Monthly budgets · spent in {Number(month)}/{year}</p>
            <ul className="mt-1">
              {plan.categories.map((c) => {
                const over = c.spent > c.budget
                return (
                  <li key={c.category} className="border-b border-line py-3 last:border-0 last:pb-0">
                    <div className="flex justify-between gap-4 text-sm">
                      <span>{c.category}</span>
                      <span className={over ? 'font-medium text-amber-900' : ''}>
                        {eur(c.spent)} <span className="text-muted">of {eur(c.budget)}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${over ? 'bg-amber-600' : 'bg-ink'}`}
                        style={{ width: `${c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 100}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}

function TipsCard({ tips }: { tips: Suggestion[] }) {
  return (
    <Card>
      <div className="p-5">
        <h2 className="font-medium">Where you could pay less</h2>
        <p className="mt-1 text-sm text-muted">Cheaper ways to cover the same needs, from your last three months.</p>
        <ul className="mt-2">
          {tips.map((tip) => (
            <li key={tip.title} className="flex justify-between gap-4 border-b border-line py-3 last:border-0">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{tip.title}</p>
                <p className="mt-1 text-muted">{tip.text}</p>
                {tip.source && <p className="mt-1 text-xs text-muted">Source: {tip.source}</p>}
              </div>
              {tip.saving !== null && (
                <p className="shrink-0 text-right text-sm font-medium text-credit">
                  −{eur(tip.saving)}
                  <span className="block font-normal text-muted">a month</span>
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Savings are estimates: published Finnish price differences applied to your own spending.</p>
      </div>
    </Card>
  )
}

function ScoreDetails({ wellness: w, answers, loading, error, onBack, onShowWellness }: {
  wellness: Wellness | null
  answers: WellnessAnswers
  loading: boolean
  error: boolean
  onBack: () => void
  onShowWellness: () => void
}) {
  const score = w ? wellnessScores(w, answers).total : null
  const levels = [
    { range: '0–19', name: 'Needs attention', caption: 'Start with the basics.' },
    { range: '20–39', name: 'Building resilience', caption: 'Small changes can add up.' },
    { range: '40–59', name: 'Finding balance', caption: 'Some stability, room to grow.' },
    { range: '60–79', name: 'On solid ground', caption: 'Keep up the momentum.' },
    { range: '80–100', name: 'Thriving', caption: 'Strong across these indicators.' },
  ]
  const activeLevel = score === null ? -1 : Math.min(4, Math.floor(score / 20))
  const tips = [
    ...(w && w.negativeDays > 0 ? [{ title: 'Prepare for unexpected costs', preview: 'An emergency cushion may help you avoid days in overdraft.' }] : []),
    ...(w && w.savingsRate !== null && w.savingsRate < 0.2 ? [{ title: 'Make saving a habit', preview: 'Consider putting aside a regular share of your income.' }] : []),
    ...(w && w.outgoing > 0 && w.averageBalance < w.outgoing / w.days * 90 ? [{ title: 'Strengthen your cash buffer', preview: 'Build a reserve for essential expenses and surprises.' }] : []),
    ...(score === null ? [{ title: 'Complete your picture', preview: 'Finish the questionnaire to see every dimension of your score.' }] : []),
    { title: 'Check your spending', preview: 'Review your outgoings regularly to spot opportunities.' },
    { title: 'Plan your next milestone', preview: 'Think ahead about upcoming costs and longer-term goals.' },
  ]
  const factors = [
    {
      number: '01', title: 'Your spending', measure: w ? eur(w.outgoing / w.days * 30) : '—', unit: 'Estimated monthly outflow',
      detail: 'Account withdrawals and payments show how much goes out. Monthly outflow is used to compare your cash buffer with three months of spending (up to 15 score points).',
    },
    {
      number: '02', title: 'Your ability to save', measure: w ? percent(w.savingsRate) : '—', unit: 'Net cash flow / money in',
      detail: 'Inflows minus outflows, divided by inflows, estimates your savings rate (up to 15 points). Your average balance also contributes to the cash-buffer measure (up to 15 points).',
    },
    {
      number: '03', title: 'Planning for your future', measure: w && w.observedMonths >= 2 ? `${w.savingMonths} / ${w.observedMonths}` : '—', unit: 'Full months with positive net flow',
      detail: 'Repeated positive monthly cash flow can signal room to prepare for future needs (up to 10 points for consistency). It does not prove you have a financial plan: the separate planning question contributes up to 5 points.',
    },
  ]

  return (
    <div className="space-y-8 pb-8">
      <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← Back to overview</button>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#123c57] to-[#147b79] p-6 text-white shadow-xl sm:p-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full border-[45px] border-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-20 h-72 w-72 rounded-full border-[35px] border-white/5" />
        <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-200">Your financial picture</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Financial well-being,<br />made clearer.</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/75">
              {error ? 'Your account data could not be loaded.' : loading ? 'Analyzing your account activity…' : score === null ? 'Your score is waiting for complete account data and questionnaire answers.' : scoreDescription(score)}
            </p>
            <button onClick={onShowWellness} className="mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-teal-100">
              View data &amp; questionnaire <span aria-hidden="true" className="ml-2">↗</span>
            </button>
          </div>
          <div className="flex justify-center">
            <div className="grid size-48 place-items-center rounded-full p-3 shadow-2xl sm:size-52" style={{ background: `conic-gradient(#5eead4 ${score ?? 0}%, #ffffff30 0)` }}>
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-[#123c57]">
                <span className="text-6xl font-semibold tracking-tighter">{score ?? '—'}</span>
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-teal-200">out of 100</span>
              </div>
            </div>
          </div>
        </div>
        <p className="relative mt-8 border-t border-white/20 pt-4 text-xs leading-relaxed text-white/70">Illustrative score, not an official bank index, credit assessment, or prediction.</p>
      </section>

      <section aria-labelledby="levels-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-credit">01 / Understand your score</p>
        <h2 id="levels-title" className="mt-2 text-2xl font-semibold tracking-tight">Levels of financial well-being</h2>
        <p className="mt-2 text-sm text-muted">Indicative ranges. {score === null ? 'Finish your assessment to see your level.' : 'Your current level is highlighted below.'}</p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-5">
          {levels.map((level, index) => (
            <li key={level.range} className={`rounded-2xl border p-4 ${index === activeLevel ? 'border-ink bg-ink text-white shadow-lg' : 'border-line bg-white'}`}>
              <span className={`text-xs font-semibold tracking-widest ${index === activeLevel ? 'text-teal-200' : 'text-credit'}`}>{level.range}</span>
              <h3 className="mt-3 text-sm font-semibold">{level.name}</h3>
              <p className={`mt-1 text-xs leading-relaxed ${index === activeLevel ? 'text-white/70' : 'text-muted'}`}>{level.caption}</p>
              {index === activeLevel && <span className="mt-3 inline-block rounded-full bg-teal-300/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-100">Your level</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">These thresholds are illustrative, not official bank classifications.</p>
      </section>

      <section aria-labelledby="tips-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-credit">02 / Next steps</p>
        <h2 id="tips-title" className="mt-2 text-2xl font-semibold tracking-tight">Financial suggestions</h2>
        <p className="mt-2 text-sm text-muted">A few ideas to explore. Swipe or scroll to see more →</p>
        <ul aria-label="Financial suggestions, scroll horizontally" tabIndex={0} className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          {tips.map((tip, index) => (
            <li key={tip.title} className="flex min-h-56 basis-[78%] shrink-0 snap-start flex-col rounded-2xl border border-line bg-white p-5 shadow-sm sm:basis-[46%]">
              <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-sm font-bold text-credit">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-4 text-lg font-semibold">{tip.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{tip.preview}</p>
              <button type="button" disabled title="Details coming soon" className="mt-auto self-start pt-5 text-sm font-medium text-muted opacity-60" aria-label={`Details for ${tip.title} (coming soon)`}>Details ↗</button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Details are coming soon. General ideas, not personalized financial advice.</p>
      </section>

      <section aria-labelledby="factors-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-credit">03 / Behind the number</p>
        <h2 id="factors-title" className="mt-2 text-2xl font-semibold tracking-tight">What shapes your financial well-being?</h2>
        <p className="mt-2 text-sm text-muted">Your account movements reveal spending patterns, saving capacity, and room to prepare for the future.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {factors.map((factor) => (
            <article key={factor.number} className="flex flex-col rounded-2xl border border-line bg-white p-5">
              <span className="text-3xl font-light text-credit/50">{factor.number}</span>
              <h3 className="mt-4 text-lg font-semibold">{factor.title}</h3>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{factor.measure}</p>
              <p className="mt-1 text-xs text-muted">{factor.unit}</p>
              <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-muted">{factor.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">Monthly outflow is estimated from the observed period; saving consistency uses only complete calendar months (at least two). Account activity alone cannot establish your intentions. The full score also considers overdraft days, your answers about budgeting and planning, perception (25 points), and financial knowledge (20 points). Missing data is never scored as zero.</p>
      </section>
    </div>
  )
}

function FinancialWellness({ data: w, answers, onAnswers }: {
  data: Wellness
  answers: WellnessAnswers
  onAnswers: (answers: WellnessAnswers) => void
}) {
  const [openInfo, setOpenInfo] = useState<string | null>(null)
  const scores = wellnessScores(w, answers)
  const update = (key: keyof WellnessAnswers, value: number | boolean | null) =>
    onAnswers({ ...answers, [key]: value })
  const figures: [string, string, string][] = [
    ['Money in', eur(w.incoming), 'Total deposits during the period.'],
    ['Money out', eur(w.outgoing), 'Total withdrawals and payments, shown as a positive amount.'],
    ['Net cash flow', signedEur(w.net), 'Money in minus money out during the period.'],
    ['Average balance', eur(w.averageBalance), 'Average end-of-day balance, including days without transactions.'],
    ['Savings rate', percent(w.savingsRate), 'Net cash flow divided by money in; it may be negative.'],
    ['Housing and utilities', eur(w.essentials), 'Payments in the Housing and Utilities categories.'],
    ['Days overdrawn', `${w.negativeDays} / ${w.days}`, 'Days when the combined end-of-day balance was negative.'],
  ]
  const infoButton = (id: string, name: string) => (
    <button
      type="button"
      aria-label={`About ${name}`}
      aria-expanded={openInfo === id}
      onClick={() => setOpenInfo(openInfo === id ? null : id)}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs font-semibold text-muted hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      i
    </button>
  )
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Financial well-being</h1>
          {infoButton('method', 'these calculations')}
        </div>
        {openInfo === 'method' && (
          <p id="wellness-info-method" className="mt-2 text-sm text-muted">
            Illustrative model, not the bank's official index. Based on all available transactions and
            your answers. Each account balance is tracked from its first recorded transaction and
            carried forward on days without activity. Debts outside these accounts, insurance and
            investments are not available. This is not a credit assessment or a forecast.
          </p>
        )}
        <p className="mt-1 text-sm text-muted">
          {date(w.from)} – {date(w.to)} · {w.accounts} {w.accounts === 1 ? 'account' : 'accounts'} · {w.days} days
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-h-40 rounded-lg border border-line bg-white p-5">
            <p className="flex items-center gap-2 text-sm text-muted">
              Financial score {infoButton('impact', 'the financial score')}
            </p>
            <p className="mt-4 text-5xl font-semibold tracking-tight">
              {scores.total ?? '—'} <span className="text-lg font-normal text-muted">/ 100</span>
            </p>
            {openInfo === 'impact' && (
              <p className="mt-3 text-sm text-muted">
                Indicative score: resilience 35, perception 25, knowledge 20, behaviors 20.
                No total is shown until every dimension can be measured. Not a credit score.
              </p>
            )}
          </div>
          <div className="min-h-40 rounded-lg border border-line bg-white p-5">
            <h2 className="text-sm text-muted">Four dimensions</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {([['Resilience', scores.resilience, 35], ['Perception', scores.perception, 25],
                ['Knowledge', scores.knowledge, 20], ['Behaviors', scores.behaviors, 20]] as const).map(([name, value, max]) => (
                <li key={name} className="flex justify-between gap-3"><span>{name}</span><span>{value ?? '—'} / {max}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <Card>
        <div className="space-y-5 p-5">
          <h2 className="font-medium">Your perspective and habits</h2>
          <p className="text-sm text-muted">Answers are stored only in this browser for this customer ID. Leave a question unanswered if you don't know.</p>
          {([
            ['control', 'How much control do you feel you have over your finances?'],
            ['worry', 'How often do financial worries cause you stress?'],
            ['confidence', 'How confident are you about achieving your financial goals?'],
          ] as const).map(([key, question]) => (
            <label key={key} className="block text-sm">{question}
              <select className="mt-1 block w-full rounded border border-line bg-white p-2" value={answers[key] ?? ''}
                onChange={(e) => update(key, e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Not answered</option>
                {(key === 'worry'
                  ? ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']
                  : ['Not at all', 'A little', 'Somewhat', 'Mostly', 'Completely']).map((text, i) => (
                  <option key={i} value={i}>{i} — {text}</option>
                ))}
              </select>
            </label>
          ))}
          {([
            ['inflation', 'If prices rise faster than your savings interest, can you buy less with your savings?'],
            ['compoundInterest', 'Does compound interest earn interest on past interest?'],
            ['diversification', 'Does spreading investments across different assets usually reduce concentration risk?'],
            ['budget', 'Do you regularly track your spending against a budget?'],
            ['plan', 'Do you have a medium- or long-term financial plan?'],
          ] as const).map(([key, question]) => (
            <label key={key} className="block text-sm">{question}
              <select className="mt-1 block w-full rounded border border-line bg-white p-2" value={answers[key] === null ? '' : String(answers[key])}
                onChange={(e) => update(key, e.target.value === '' ? null : e.target.value === 'true')}>
                <option value="">Not answered</option><option value="true">Yes</option><option value="false">No</option>
              </select>
            </label>
          ))}
          <p className="text-xs text-muted">Resilience: savings rate (15), cash buffer (15), days without overdraft (5). Behaviors: months with positive net flow (10), budgeting (5), planning (5). At least two complete calendar months of transactions are needed for behaviors. Missing data means no total.</p>
        </div>
      </Card>
      <Card>
        <dl className="grid gap-x-6 px-5 sm:grid-cols-2">
          {figures.map(([name, value, description], index) => {
            const id = `metric-${index}`
            return (
              <div key={name} className="border-b border-line py-4">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  {name} {infoButton(id, name)}
                </dt>
                <dd className="mt-1 text-xl font-semibold">{value}</dd>
                {openInfo === id && (
                  <p id={`wellness-info-${id}`} className="mt-2 text-sm text-muted">{description}</p>
                )}
              </div>
            )
          })}
        </dl>
      </Card>
      {w.categories.length > 0 && (
        <Card>
          <h2 className="px-5 pt-4 font-medium">Top spending categories</h2>
          <dl className="px-5 pb-2">
            {w.categories.map(([name, amount]) => (
              <div key={name} className="flex justify-between gap-4 border-b border-line py-3 last:border-0">
                <dt>{name}</dt><dd className="font-medium">{eur(amount)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  )
}

function TxRow({
  tx,
  tag,
  showDate,
}: {
  tx: Transaction
  tag?: Tag
  showDate?: boolean
}) {
  const type = label(tx.transaction_type)
  const title = tx.category ?? type
  // The kind of place it was bought at (from the MCC); otherwise the kind of transaction.
  const where = kindOf(tx)?.name ?? (type !== title && type)
  const detail = [showDate && date(tx.tx_date), where].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="truncate">{title}</span>
          {tag === 'helps' && (
            <span className="shrink-0 rounded-full bg-credit/10 px-2 py-0.5 text-xs font-medium text-credit">Helps your goal</span>
          )}
          {tag === 'over' && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Over budget</span>
          )}
        </p>
        {detail && <p className="truncate text-sm text-muted">{detail}</p>}
      </div>
      <p className={`shrink-0 font-medium ${tx.tx_amount_eur > 0 ? 'text-credit' : ''}`}>
        {signedEur(tx.tx_amount_eur)}
      </p>
    </li>
  )
}

function Transactions({
  txs,
  tagOf,
  hasMore,
  loading,
  onMore,
}: {
  txs: Transaction[]
  tagOf: (tx: Transaction) => Tag
  hasMore: boolean
  loading: boolean
  onMore: () => void
}) {
  if (txs.length === 0) return <p className="text-sm text-muted">No transactions.</p>

  const days: [string, Transaction[]][] = []
  for (const tx of txs) {
    const last = days[days.length - 1]
    if (last && last[0] === tx.tx_date) last[1].push(tx)
    else days.push([tx.tx_date, [tx]])
  }

  return (
    <div>
      <Card>
        {days.map(([day, rows]) => (
          <div key={day}>
            <h3 className="border-b border-line bg-paper/60 px-5 py-2 text-sm text-muted">
              {date(day)}
            </h3>
            <ul className="divide-y divide-line border-b border-line px-5 last:border-b-0">
              {rows.map((tx, i) => (
                <TxRow key={i} tx={tx} tag={tagOf(tx)} />
              ))}
            </ul>
          </div>
        ))}
      </Card>
      {hasMore && (
        <button
          onClick={onMore}
          disabled={loading}
          className="mt-4 w-full rounded-md border border-line bg-white py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Show more
        </button>
      )}
    </div>
  )
}

function Loan({ mortgage: m }: { mortgage: Mortgage }) {
  const figures: [string, string][] = [
    ['Loan amount', eur(m.final_requested_loan_eur)],
    ['Property price', eur(m.final_property_price_eur)],
    ['Equity', eur(m.final_equity_amount_eur)],
    ['Collateral value', eur(m.final_collateral_value_eur)],
    ['Loan to value', percent(m.final_loan_to_value)],
    ['Required monthly income', eur(m.required_monthly_income_eur)],
  ]

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5">
          <p className="text-sm text-muted">Mortgage application · {m.mortgage_customer_id}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{label(m.final_decision)}</p>
          {m.rejection_reason && (
            <p className="mt-1 text-sm text-muted">{label(m.rejection_reason)}</p>
          )}
        </div>
        <dl className="grid grid-cols-1 border-t border-line px-5 sm:grid-cols-2 sm:gap-x-8">
          {figures.map(([name, value]) => (
            <div key={name} className="flex justify-between gap-4 border-b border-line py-3 last:border-b-0 sm:nth-last-2:border-b-0">
              <dt className="text-muted">{name}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {m.mortgage_events.length > 0 && (
        <Card>
          <h2 className="px-5 pt-4 pb-1 font-medium">Events</h2>
          <ul className="divide-y divide-line px-5">
            {m.mortgage_events.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex justify-between gap-4">
                  <p>{label(e.event_type)}</p>
                  <p className="shrink-0 text-sm text-muted">{date(e.event_timestamp)}</p>
                </div>
                {e.note && <p className="mt-1 text-sm text-muted">{e.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
