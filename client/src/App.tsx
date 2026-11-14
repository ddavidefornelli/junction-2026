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
import { calculateWellness, emptyAnswers, visibleWellnessScore, wellnessScores, type Wellness, type WellnessAnswers } from './wellness'
import { GoalForm } from './GoalForm'
import { deadline, goalLabel, goalStatement, loadGoalProfile, monthYear, saveGoalProfile, type GoalProfile } from './goal'
import { makePlan, txId, type Plan } from './plan'
import { kindOf, suggestions, type Suggestion } from './mcc'
import { makeBaskets, type Baskets } from './baskets'
import { BASKET_NAMES, BasketsCard } from './BasketsCard'
import { Chat } from './Chat'
import { WalterAvatar } from './WalterAvatar'
import { ChatDialog } from './ChatDialog'
import { WhatIfDialog } from './WhatIfDialog'
import { WellnessApple } from './WellnessApple'
import { buildContext, ledgerOf, type ChatMessage } from './assistant'
import { AnalysisSteps, useStagedProgress } from './Analysis'
import { APPROVED_COLLATERAL_COVER, APPROVED_EQUITY_SHARE, getMortgageSteps, mortgageFacts, type MortgageFacts, type MortgageStep } from './mortgage'
import { financialProfileTagline } from './profile'

const PLAN_STEPS = [
  'Grouping your spending into categories',
  'Asking Laya which purchases help your goal',
  'Setting a monthly budget for each category',
  'Checking the plan is within reach',
] as const

const SESSION_KEY = 'customerId'

const STEPS_ANALYSIS = [
  'Reading your mortgage application',
  'Looking at where your money goes, place by place',
  'Comparing with applications that were approved',
  'Writing your next steps',
] as const

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
  // The plan is revealed only after a short, visible analysis; a retry runs it again.
  const [planAttempt, setPlanAttempt] = useState(0)
  const planError = classifyError?.goal === goalText ? classifyError.message : null
  const planAnalysis = useStagedProgress(
    PLAN_STEPS.length,
    Boolean(allTxs && currentVerdicts) || planError !== null || wellnessError,
    `${goalText}|${planAttempt}`,
  )
  const planStep = goal && !planAnalysis.done ? planAnalysis.step : null
  const tips = useMemo(() => (allTxs ? suggestions(allTxs, plan ? !plan.reachable : false) : []), [allTxs, plan])
  const baskets = useMemo(() => (allTxs ? makeBaskets(allTxs) : null), [allTxs])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [scenariosOpen, setScenariosOpen] = useState(false)
  const [chatPrompt, setChatPrompt] = useState<{ id: number; text: string } | null>(null)
  const nextChatPrompt = useRef(0)
  const askScenario = (question: string) => {
    setScenariosOpen(false)
    setChatPrompt({ id: ++nextChatPrompt.current, text: question })
    setChatOpen(true)
  }
  // What the assistant knows: the figures on screen. Null until the full history has loaded (or failed to).
  const chatContext = useMemo(
    () =>
      allTxs || wellnessError
        ? buildContext({ balance: txs?.[0]?.balance_after_eur ?? null, wellness, score: wellness ? visibleWellnessScore(wellness, answers) : { value: null, provisional: false }, allTxs, goal, plan, mortgage, baskets })
        : null,
    [txs, wellness, answers, wellnessError, allTxs, goal, plan, mortgage, baskets],
  )
  // What the assistant can look things up in: every transaction, described as the app shows it.
  const chatLedger = useMemo(() => (allTxs ? ledgerOf(allTxs) : null), [allTxs])
  // AI-written next steps on the Loan tab: asked once per customer, kept for the session.
  const stepsKey = `mortgage-steps:${customerId}`
  const [steps, setSteps] = useState<MortgageStep[] | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(stepsKey) ?? 'null') } catch { return null }
  })
  const [stepsError, setStepsError] = useState<string | null>(null)
  const [stepsAttempt, setStepsAttempt] = useState(0)
  useEffect(() => {
    if (view !== 'loan' || !mortgage || !chatContext || steps || stepsError) return
    let stale = false
    getMortgageSteps(chatContext)
      .then((list) => {
        if (stale) return
        setSteps(list)
        try { sessionStorage.setItem(stepsKey, JSON.stringify(list)) } catch { /* private browsing */ }
      })
      .catch((e) => !stale && setStepsError(e instanceof Error ? e.message : 'Unknown error'))
    return () => { stale = true }
  }, [view, mortgage, chatContext, steps, stepsError, stepsKey, stepsAttempt])
  // The checking steps take the time the answer needs; writing is a short last beat.
  const stepsAnalysis = useStagedProgress(STEPS_ANALYSIS.length, steps !== null || stepsError !== null, stepsAttempt, {
    stepMs: 4500,
    holdAt: STEPS_ANALYSIS.length - 2,
  })
  const mortgageInfo = useMemo(() => (mortgage && allTxs ? mortgageFacts(mortgage, allTxs) : null), [mortgage, allTxs])
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
    if ((view !== 'wellness' && view !== 'overview' && view !== 'score-details' && view !== 'loan') || wellness || wellnessError) return
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
          baskets={baskets}
          savingRange={savingRange}
          onOpenChat={() => setChatOpen(true)}
          tagOf={tagOf}
          txs={txs}
          wellness={wellness}
          answers={answers}
          wellnessLoading={wellnessLoading}
          wellnessError={wellnessError}
          planStep={planStep}
          planError={planError}
          onRetryPlan={() => {
            setClassifyError(null)
            setPlanAttempt((n) => n + 1)
          }}
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
          onWhatIf={() => setScenariosOpen(true)}
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
        mortgage && (
          <Loan
            mortgage={mortgage}
            nextSteps={
              <NextSteps
                facts={mortgageInfo}
                steps={stepsAnalysis.done ? steps : null}
                step={stepsAnalysis.step}
                error={stepsAnalysis.done ? stepsError : null}
                loadError={wellnessError}
                onRetry={() => {
                  try { sessionStorage.removeItem(stepsKey) } catch { /* private browsing */ }
                  setSteps(null)
                  setStepsError(null)
                  setStepsAttempt((n) => n + 1)
                }}
              />
            }
          />
        )
      )}
      {scenariosOpen && (
        <WhatIfDialog
          context={chatContext}
          onPick={askScenario}
          onClose={() => setScenariosOpen(false)}
        />
      )}
      {chatOpen && (
        <ChatDialog onClose={() => {
          setChatOpen(false)
          setChatPrompt(null)
        }}>
          <Chat
            messages={chatMessages}
            onMessages={setChatMessages}
            context={chatContext}
            ledger={chatLedger}
            starters={['How am I doing?', 'Where could I cut back?', 'What did I spend in the last two weeks?', goal ? 'Am I on track for my goal?' : 'What should I focus on first?']}
            prompt={chatPrompt}
            onPromptHandled={() => setChatPrompt(null)}
          />
        </ChatDialog>
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
  baskets,
  savingRange,
  onOpenChat,
  tagOf,
  txs,
  wellness,
  answers,
  wellnessLoading,
  wellnessError,
  planStep,
  planError,
  onRetryPlan,
  onShowWellness,
  onShowAll,
}: {
  year: number
  goal: GoalProfile | null
  onSaveGoal: (profile: GoalProfile) => void
  plan: Plan | null
  tips: Suggestion[]
  baskets: Baskets | null
  savingRange: (draft: GoalProfile) => Promise<{ usual: number; max: number } | null>
  onOpenChat: () => void
  tagOf: (tx: Transaction) => Tag
  txs: Transaction[]
  wellness: Wellness | null
  answers: WellnessAnswers
  wellnessLoading: boolean
  wellnessError: boolean
  planStep: number | null
  planError: string | null
  onRetryPlan: () => void
  onShowWellness: () => void
  onShowAll: () => void
}) {
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const latest = txs[0]
  if (!latest) return <p className="text-sm text-muted">No account activity.</p>
  const displayScore = wellness ? visibleWellnessScore(wellness, answers) : { value: null, provisional: false }
  const score = displayScore.value

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

      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted">Your goal for {year}</p>
            <p className="mt-1 font-medium">
              {goal ? goalStatement(goal) : 'Set a goal and Walter will build a monthly plan to get you there.'}
            </p>
          </div>
          <button
            onClick={() => setGoalFormOpen(true)}
            className={
              goal
                ? 'shrink-0 self-start rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-paper sm:self-auto'
                : 'shrink-0 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-ink/90'
            }
          >
            {goal ? 'Edit goal' : `Set your financial goal for ${year}`}
          </button>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex h-full min-h-40 flex-col p-5">
            <h2 className="border-b border-line pb-3 font-medium">Your financial profile</h2>
            <div className="my-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-3xl font-semibold leading-none text-emerald-900">
                  {score === null ? '—' : `${score} / 100`}
                </p>
                {displayScore.provisional && <p className="mt-1 text-xs text-muted">Preliminary · account activity only</p>}
                <p className="mt-2 text-sm text-muted">
                  {score !== null ? financialProfileTagline(score) : wellnessError ? 'Profile unavailable' : wellnessLoading ? 'Calculating…' : 'Not enough account activity yet.'}
                </p>
              </div>
              <WellnessApple stage={score === null ? null : Math.min(4, Math.floor(score / 20))} className="size-16 shrink-0" />
            </div>
            <button onClick={onShowWellness} className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2.5 text-sm font-medium hover:bg-paper">
              See details <span aria-hidden="true">→</span>
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
              Hi, I'm Walter. Ask me how your finances are doing, or what to do next.
            </div>
            <button
              onClick={onOpenChat}
              className="mt-auto flex w-full items-center justify-center gap-2 rounded-md bg-ink px-3 py-2.5 text-sm font-medium text-white hover:bg-ink/90"
            >
              Talk with our AI assistant
            </button>
          </div>
        </Card>
      </div>

      {baskets && <BasketsCard data={baskets} />}

      {goal && planStep !== null ? (
        <Card>
          <div className="p-5">
            <AnalysisSteps title="Building your plan" steps={PLAN_STEPS} step={planStep} />
          </div>
        </Card>
      ) : (
        goal && (
          <div className="animate-fade-up">
            {plan ? (
              <PlanCard goal={goal} plan={plan} baskets={baskets} />
            ) : (
              <Card>
                <div className="p-5">
                  <h2 className="font-medium">Your plan</h2>
                  {planError ? (
                    <>
                      <p role="alert" className="mt-2 text-sm">Walter could not build your plan right now.</p>
                      <p className="mt-1 text-xs text-muted">{planError}</p>
                      <button onClick={onRetryPlan} className="mt-3 rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-paper">
                        Try again
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      {wellnessError
                        ? 'Your transactions could not be loaded, so there is no plan yet.'
                        : 'A plan needs at least one full month of account history before this one. Check back next month.'}
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>
        )
      )}

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

function PlanCard({ goal, plan, baskets }: { goal: GoalProfile; plan: Plan; baskets: Baskets | null }) {
  const by = deadline(goal)
  const [year, month] = plan.month.split('-')
  // Rounded to cents, so float leftovers never show as "0,00 €" instead of "Used up".
  const safe = Math.round(plan.safeThisWeek * 100) / 100
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
            <div className="mt-4 rounded-md bg-paper p-4">
              <p className="text-sm text-muted">Safe to spend this week</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight ${safe > 0 ? '' : 'text-amber-900'}`}>
                {safe > 0 ? eur(safe) : 'Used up'}
              </p>
              <p className="mt-1 text-sm text-muted">On {BASKET_NAMES.everyday.name.toLowerCase()}: {BASKET_NAMES.everyday.examples.toLowerCase()}.</p>
              <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                {baskets && (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt>{BASKET_NAMES.fixed.name} <span className="text-muted">· already counted</span></dt>
                      <dd className="shrink-0">{eur(baskets.baskets.fixed.monthly)} <span className="text-muted">a month</span></dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>{BASKET_NAMES.irregular.name} <span className="text-muted">· put aside</span></dt>
                      <dd className="shrink-0">{eur(baskets.baskets.irregular.monthly)} <span className="text-muted">a month</span></dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-4">
                  <dt>{BASKET_NAMES.everyday.name} <span className="text-muted">· your budgets</span></dt>
                  <dd className="shrink-0">{eur(plan.budgetTotal)} <span className="text-muted">a month</span></dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted">
                {safe > 0
                  ? `A week's share of your budgets below${plan.capped ? `, capped at the ${eur(plan.remaining)} left of them in ${Number(month)}/${year}` : ''}. Rent, bills, food and surprise costs are paid from the rest of your income first.`
                  : `This month's budgets are used up. Must-pay costs are still covered; the budgets start again next month.`}
              </p>
            </div>
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

function ScoreDetails({ wellness: w, answers, loading, error, onBack, onShowWellness, onWhatIf }: {
  wellness: Wellness | null
  answers: WellnessAnswers
  loading: boolean
  error: boolean
  onBack: () => void
  onShowWellness: () => void
  onWhatIf: () => void
}) {
  const [openDetails, setOpenDetails] = useState<string | null>(null)
  const [activeTip, setActiveTip] = useState(0)
  const tipsList = useRef<HTMLUListElement>(null)
  const displayScore = w ? visibleWellnessScore(w, answers) : { value: null, provisional: false }
  const score = displayScore.value
  const stage = score === null ? null : Math.min(4, Math.floor(score / 20))
  const levels = [
    { name: 'Rotten', range: '0–19' },
    { name: 'Healing', range: '20–39' },
    { name: 'Growing', range: '40–59' },
    { name: 'Healthy', range: '60–79' },
    { name: 'Fresh', range: '80–100' },
  ]
  const tips = [
    ...(w && w.negativeDays > 0 ? [{ title: 'Build a safety cushion', summary: 'Be ready for unexpected costs.', detail: 'Putting a little aside regularly can help you cover surprises without dipping into an overdraft.' }] : []),
    ...(w && w.savingsRate !== null && w.savingsRate < 0.2 ? [{ title: 'Save a little each month', summary: 'Small amounts can add up.', detail: 'Choose an amount you can afford and set it aside after each payday. Review it as your income or expenses change.' }] : []),
    ...(w && w.outgoing > 0 && w.averageBalance < w.outgoing / w.days * 90 ? [{ title: 'Grow your cash buffer', summary: 'Give your budget more breathing room.', detail: 'A cash buffer can help with essential expenses and surprises. Start with a target that works for you.' }] : []),
    ...(displayScore.provisional ? [{ title: 'Complete your picture', summary: 'See more than your account activity.', detail: 'Answer the questionnaire to add perception, knowledge and habits to your score. The full score also needs two complete months of transactions.' }] : []),
    { title: 'Review your spending', summary: 'Spot patterns in where your money goes.', detail: 'Look through recent outgoings and see if any recurring costs could be reduced.' },
    { title: 'Choose a small goal', summary: 'Make your next milestone feel achievable.', detail: 'Pick a specific target and a realistic monthly amount, then track your progress over time.' },
    { title: 'Check in regularly', summary: 'Keep your plan in step with your life.', detail: 'Revisit your spending and savings as your circumstances change. These are general ideas, not financial advice.' },
  ].slice(0, 5)
  const showTip = (index: number) => {
    const next = Math.max(0, Math.min(tips.length - 1, index))
    tipsList.current?.scrollTo({ left: next * tipsList.current.clientWidth, behavior: 'smooth' })
    setActiveTip(next)
    setOpenDetails(null)
  }
  const wholeEur = (n: number) => eur(Math.round(n)).replace(/,00(?=\s)/, '')
  const kept = w?.savingsRate ?? null
  const factors = [
    {
      title: 'You spend',
      measure: w ? wholeEur(w.outgoing / w.days * 30) : '—',
      note: 'each month',
    },
    {
      title: kept !== null && kept < 0 ? 'You spend more than you get' : 'You keep',
      measure: kept === null ? '—' : percent(Math.abs(kept)),
      note: kept === null ? 'of the money you get'
        : kept < 0 ? `about ${Math.round(-kept * 100)} € extra for every 100 € in`
        : Math.round(kept * 100) < 1 ? 'less than 1 € of every 100 € you get' : `about ${Math.round(kept * 100)} € of every 100 € you get`,
    },
    {
      title: 'Good months',
      measure: w && w.observedMonths >= 2 ? `${w.savingMonths} of ${w.observedMonths}` : '—',
      note: 'more money came in than went out',
    },
  ]
  const toggleDetails = (id: string) => setOpenDetails((current) => current === id ? null : id)
  const seeDetails = (id: string, subject: string) => (
    <button type="button" onClick={() => toggleDetails(id)} aria-expanded={openDetails === id} aria-controls={openDetails === id ? `score-${id}` : undefined}
      aria-label={`${openDetails === id ? 'Hide details' : 'See details'} about ${subject}`}
      className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
      {openDetails === id ? 'Hide details' : 'See details'} <span aria-hidden="true">{openDetails === id ? '↑' : '↓'}</span>
    </button>
  )

  return (
    <div className="space-y-6 rounded-3xl bg-[#f3faf3] p-4 pb-8 text-emerald-950 sm:p-6">
      <button onClick={onBack} className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline">← Back to overview</button>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Your financial profile</h1>
        <p className="mt-1 text-sm text-emerald-800">Your financial well-being at a glance.</p>
      </header>
      <section aria-label="Your financial profile score" className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="grid items-center gap-4 sm:grid-cols-[1fr_200px]">
          <div>
            <p className="text-sm font-semibold text-emerald-700">Your score {displayScore.provisional && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-1 text-xs">Preliminary</span>}</p>
            <p className="mt-2 text-6xl font-bold tracking-tight text-emerald-900" aria-label={score === null ? 'Score unavailable' : `${score} out of 100${displayScore.provisional ? ', preliminary' : ''}`}>
              {score ?? '—'} <span aria-hidden="true" className="text-xl font-medium text-emerald-700">/ 100</span>
            </p>
            <p className="mt-3 text-sm font-medium text-emerald-800">
              {error ? 'Could not load your account data.' : loading ? 'Calculating…' : score === null ? 'Not enough account activity yet.' : displayScore.provisional ? 'A first look from your account activity.' : scoreDescription(score)}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onShowWellness} className="rounded-full bg-emerald-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                {displayScore.provisional ? 'Complete your assessment' : 'View your answers'} ↗
              </button>
              {seeDetails('score', 'the score')}
            </div>
          </div>
          <div className="mx-auto grid size-44 place-items-center rounded-full bg-emerald-50 sm:size-48">
            <WellnessApple stage={stage} className="size-40 sm:size-44" />
          </div>
        </div>
        {openDetails === 'score' && (
          <div id="score-score" className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
            {displayScore.provisional ? 'This preliminary number uses account activity only (resilience scaled to 100). Complete your answers and two full months of transactions for the four-part score.' : 'The full score combines resilience (35), perception (25), knowledge (20) and behaviors (20).'}{' '}
            This is an illustrative estimate, not a bank index or credit score.
          </div>
        )}
      </section>

      <section aria-labelledby="household-comparison-title" className="rounded-3xl border border-emerald-100 bg-white p-5 sm:p-6">
        <h2 id="household-comparison-title" className="text-xl font-bold">Customers like you… can plan for surprises</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-4 sm:gap-5">
          <strong className="text-3xl font-bold text-emerald-900">1 in 10</strong>
          <p className="text-sm text-emerald-900">Finnish households said they struggled to make ends meet in 2023.</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700">
          <span>National figure, not a comparison with similar customers.</span>
          <a href="https://www.bofbulletin.fi/article/analysis/2026/rise-in-cost-of-living-and-higher-interest-rates-have-increased-the-pressure-on-many-indebted-households/"
            target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Bank of Finland ↗</a>
        </div>
      </section>

      <section aria-labelledby="levels-title" className="rounded-3xl border border-emerald-100 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="levels-title" className="text-xl font-bold">From recovery to thriving</h2>
          {seeDetails('levels', 'the apple stages')}
        </div>
        <ol className="mt-5 grid grid-cols-5 gap-1 sm:gap-3">
          {levels.map((level, index) => (
            <li key={level.range} className={`min-w-0 rounded-2xl p-1 text-center sm:p-2 ${stage === index ? 'bg-emerald-100 ring-2 ring-emerald-700' : 'bg-emerald-50'}`}>
              <WellnessApple stage={index} className="mx-auto w-full max-w-20" />
              <p className="text-[10px] font-semibold leading-tight text-emerald-900 sm:text-sm">{level.name}</p>
              <p className="text-[10px] text-emerald-700 sm:text-xs">{level.range}</p>
            </li>
          ))}
        </ol>
        <button type="button" onClick={onWhatIf} className="mt-4 rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          What if scenarios
        </button>
        {openDetails === 'levels' && (
          <p id="score-levels" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">
            The apple gradually becomes healthier as the score rises. Ranges are illustrative, not official bank classifications. {displayScore.provisional ? 'The highlighted stage is only a preview based on account activity; your full score may differ.' : score === null ? 'Your stage will appear once there is enough account activity.' : `Your full score places you in the ${levels[stage!].name.toLowerCase()} stage.`}
          </p>
        )}
      </section>

      <section aria-labelledby="tips-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="tips-title" className="text-xl font-bold">Small steps, big difference</h2>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => showTip(activeTip - 1)} disabled={activeTip === 0} aria-label="Previous suggestion"
              className="grid size-9 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40">←</button>
            <button type="button" onClick={() => showTip(activeTip + 1)} disabled={activeTip === tips.length - 1} aria-label="Next suggestion"
              className="grid size-9 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40">→</button>
          </div>
        </div>
        <ul ref={tipsList} aria-label="Financial suggestions; swipe or scroll to explore" tabIndex={0}
          onScroll={(event) => {
            const list = event.currentTarget
            if (list.clientWidth) setActiveTip(Math.max(0, Math.min(tips.length - 1, Math.round(list.scrollLeft / list.clientWidth))))
          }}
          className="mt-3 flex snap-x snap-mandatory overflow-x-auto rounded-3xl scroll-smooth focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          {tips.map((tip, index) => (
            <li key={tip.title} className="w-full shrink-0 snap-start">
              <article className="flex min-h-56 flex-col rounded-3xl border border-emerald-100 bg-white p-6 sm:min-h-52">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step {index + 1} of {tips.length}</span>
                <h3 className="mt-4 text-xl font-bold">{tip.title}</h3>
                <p className="mt-2 text-sm text-emerald-800">{tip.summary}</p>
                <div className="mt-auto pt-5">{seeDetails(`tip-${index}`, tip.title)}</div>
                {openDetails === `tip-${index}` && <p id={`score-tip-${index}`} className="mt-4 border-t border-emerald-100 pt-4 text-sm leading-relaxed text-emerald-900">{tip.detail} General idea, not personalized financial advice.</p>}
              </article>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-center gap-2" aria-label="Choose a suggestion">
          {tips.map((tip, index) => (
            <button key={tip.title} type="button" onClick={() => showTip(index)} aria-label={`Go to suggestion ${index + 1}: ${tip.title}`}
              aria-current={activeTip === index ? 'step' : undefined}
              className={`size-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${activeTip === index ? 'bg-emerald-800' : 'bg-emerald-200 hover:bg-emerald-500'}`} />
          ))}
        </div>
      </section>

      <section aria-labelledby="factors-title">
        <h2 id="factors-title" className="text-xl font-bold">Your money</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {factors.map((factor) => (
            <article key={factor.title} className="rounded-3xl border border-emerald-100 bg-white p-5">
              <h3 className="text-sm font-semibold text-emerald-800">{factor.title}</h3>
              <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-950">{factor.measure}</p>
              <p className="mt-1 text-sm text-emerald-800">{factor.note}</p>
            </article>
          ))}
        </div>
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
  const displayScore = visibleWellnessScore(w, answers)
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
              Your financial profile {infoButton('impact', 'the financial score')}
            </p>
            <p className="mt-4 text-5xl font-semibold tracking-tight">
              {displayScore.value ?? '—'} <span className="text-lg font-normal text-muted">/ 100</span>
            </p>
            {displayScore.provisional && <p className="mt-2 text-sm text-muted">Preliminary · based on account activity only. The full score also needs your answers and two complete months of transactions.</p>}
            {openInfo === 'impact' && (
              <p className="mt-3 text-sm text-muted">
                The preliminary score scales resilience (up to 35 points) to 100; it does not treat missing answers as zero.
                The full score uses resilience 35, perception 25, knowledge 20 and behaviors 20, and needs two complete months of transactions. Not a credit score.
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
          <p className="text-xs text-muted">Resilience: savings rate (15), cash buffer (15), days without overdraft (5). Behaviors: months with positive net flow (10), budgeting (5), planning (5). At least two complete calendar months of transactions are needed for the full score. Until then, the preliminary score uses account activity only; missing data is never scored as zero.</p>
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

// The way to the mortgage: for a rejected application, how far it is from the
// approved ones; then the AI-written steps, from the customer's own spending.
function NextSteps({ facts: f, steps, step, error, loadError, onRetry }: {
  facts: MortgageFacts | null
  steps: MortgageStep[] | null
  step: number
  error: string | null
  loadError: boolean
  onRetry: () => void
}) {
  const figures: [string, string][] = f
    ? [
        ...(f.rejected
          ? ([
              ['More equity needed', f.equityGap ? eur(f.equityGap) : 'None'],
              ['More collateral needed', f.collateralGap ? eur(f.collateralGap) : 'None'],
            ] as [string, string][])
          : ([['One-off costs to cover', eur(f.oneOffCosts.reduce((a, c) => a + c.amount, 0))]] as [string, string][])),
        ['Saved and invested so far', eur(f.savedTotal)],
        ['Usually left over a month', eur(f.monthlySaving)],
      ]
    : []

  return (
    <Card>
      <div className="p-5">
        <h2 className="font-medium">{f?.rejected === false ? 'Your next steps to buying' : 'What it would take to get the loan'}</h2>
        <p className="mt-1 text-sm text-muted">Written by Walter from your application and where your money goes.</p>

        {figures.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {figures.map(([name, value]) => (
              <div key={name} className="rounded-md bg-paper px-3 py-2">
                <dt className="text-xs text-muted">{name}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5">
          {loadError ? (
            <p className="text-sm text-red-700">Could not load your transactions, so there is nothing to base the steps on.</p>
          ) : error ? (
            <div className="text-sm text-red-700">
              <p>Could not write your next steps: {error}</p>
              <button className="mt-2 underline" onClick={onRetry}>Retry</button>
            </div>
          ) : steps ? (
            <ol>
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3 border-b border-line py-3 last:border-0">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="mt-1 text-muted">{s.text}</p>
                  </div>
                  {s.figure && <p className="shrink-0 text-right text-sm font-medium">{s.figure}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <AnalysisSteps title="Working out your next steps" steps={STEPS_ANALYSIS} step={step} />
          )}
        </div>

        {f?.rejected && (
          <p className="mt-3 text-xs text-muted">
            Gaps are measured against typical approved applications ({percent(APPROVED_EQUITY_SHARE)} equity, collateral worth {percent(APPROVED_COLLATERAL_COVER)} of the loan), not a fixed bank rule. Suggestions are AI-generated; talk to a Pankki advisor before deciding.
          </p>
        )}
        {f && !f.rejected && <p className="mt-3 text-xs text-muted">Suggestions are AI-generated; talk to a Pankki advisor before deciding.</p>}
      </div>
    </Card>
  )
}

function Loan({ mortgage: m, nextSteps }: { mortgage: Mortgage; nextSteps: ReactNode }) {
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

      {nextSteps}

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
