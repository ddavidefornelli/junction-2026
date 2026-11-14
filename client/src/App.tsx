import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  PAGE_SIZE,
  getCustomer,
  getCustomerIds,
  getMortgage,
  getTransactions,
  getWellnessTransactions,
  classify,
  spendingKey,
  type Mortgage,
  type SpendingClass,
  type Transaction,
} from './api'
import { date, eur, label, percent, signedEur } from './format'
import { calculateWellness, emptyAnswers, visibleWellnessScore, wellnessScores, type Wellness, type WellnessAnswers } from './wellness'
import { kindOf, suggestions, type Suggestion } from './mcc'
import { makeBaskets, type Baskets } from './baskets'
import { BasketsCard } from './BasketsCard'
import { BenchmarkCard } from './BenchmarkCard'
import { AreaCard } from './AreaCard'
import { makeArea, type AreaView } from './area'
import { makeBenchmark, type Benchmark } from './benchmarks'
import { Chat } from './Chat'
import { WalterAvatar } from './WalterAvatar'
import { ChatDialog } from './ChatDialog'
import { WhatIfDialog } from './WhatIfDialog'
import { WellnessApple } from './WellnessApple'
import { buildContext, ledgerOf, type ChatMessage } from './assistant'
import { AnalysisSteps, useStagedProgress } from './Analysis'
import { CipherText, ProtectedBadge, SecureLoading, SecureNote, ShieldSeal, clearSession, linkEncrypted, markSessionStart } from './Security'
import { APPROVED_COLLATERAL_COVER, APPROVED_EQUITY_SHARE, getMortgageSteps, mortgageFacts, type MortgageFacts, type MortgageStep } from './mortgage'
import { financialProfileTagline } from './profile'

const SESSION_KEY = 'customerId'

const STEPS_ANALYSIS = [
  'Reading your mortgage application',
  'Looking at where your money goes, place by place',
  'Comparing with applications that were approved',
  'Writing your next steps',
] as const

export default function App() {
  const [customerId, setCustomerId] = useState(() => sessionStorage.getItem(SESSION_KEY))
  const [loggedOut, setLoggedOut] = useState(false)

  if (!customerId) {
    return (
      <Login
        loggedOut={loggedOut}
        onLogin={(id) => {
          sessionStorage.setItem(SESSION_KEY, id)
          markSessionStart()
          setLoggedOut(false)
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
        clearSession() // nothing of the session stays in this tab
        setLoggedOut(true)
        setCustomerId(null)
      }}
    />
  )
}

// How long the "secure session started" moment stays before the account opens.
const SEAL_MS = 1500

function Login({ onLogin, loggedOut }: { onLogin: (id: string) => void; loggedOut: boolean }) {
  const [id, setId] = useState('')
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [loadingCustomerIds, setLoadingCustomerIds] = useState(true)
  const [loadingMoreCustomerIds, setLoadingMoreCustomerIds] = useState(false)
  const [customerIdsError, setCustomerIdsError] = useState('')
  const [hasMoreCustomerIds, setHasMoreCustomerIds] = useState(false)
  // The customer whose session has just been secured; the account opens a beat later.
  const [sealed, setSealed] = useState<string | null>(null)
  useEffect(() => {
    if (!sealed) return
    let reduced = false
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* keep the default */ }
    const timer = setTimeout(() => onLogin(sealed), reduced ? 400 : SEAL_MS)
    return () => clearTimeout(timer)
  }, [sealed, onLogin])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    getCustomerIds(0)
      .then((ids) => {
        if (stale) return
        setCustomerIds(ids)
        setHasMoreCustomerIds(ids.length === 100)
        setCustomerIdsError('')
      })
      .catch(() => {
        if (!stale) setCustomerIdsError('Could not load customer IDs. You can still enter one below.')
      })
      .finally(() => {
        if (!stale) setLoadingCustomerIds(false)
      })
    return () => {
      stale = true
    }
  }, [])

  async function loadMoreCustomerIds() {
    if (loadingMoreCustomerIds || !hasMoreCustomerIds) return
    setLoadingMoreCustomerIds(true)
    setCustomerIdsError('')
    try {
      const more = await getCustomerIds(customerIds.length)
      setCustomerIds((current) => [...current, ...more])
      setHasMoreCustomerIds(more.length === 100)
    } catch {
      setCustomerIdsError('Could not load more customer IDs. Try again.')
    } finally {
      setLoadingMoreCustomerIds(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = id.trim().toUpperCase()
    if (!value) return
    setBusy(true)
    setError('')
    try {
      const customer = await getCustomer(value)
      if (customer) setSealed(customer.customer_id)
      else setError('Unknown customer ID')
    } catch (error) {
      console.error('[login] Could not look up customer', error)
      setError('Could not reach the bank')
    } finally {
      setBusy(false)
    }
  }

  if (sealed) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div role="status" className="animate-fade-up text-center">
          <ShieldSeal className="mx-auto size-16" />
          <p className="mt-4 font-medium">Secure session started</p>
          <p className="mt-1 text-sm text-muted">Opening your account…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Pankki</h1>
        {loggedOut && (
          <p role="status" className="mb-5 rounded-md border border-credit/30 bg-credit/5 px-3 py-2 text-sm text-credit">
            You are logged out. Your session was cleared from this tab.
          </p>
        )}
        <div className="mb-4">
          <label htmlFor="customer-picker" className="mb-1.5 block text-sm text-muted">
            Choose a customer ID from the list
          </label>
          <select
            id="customer-picker"
            value={customerIds.includes(id.trim().toUpperCase()) ? id.trim().toUpperCase() : ''}
            onChange={(e) => setId(e.target.value)}
            disabled={loadingCustomerIds || customerIds.length === 0}
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-ink disabled:bg-paper disabled:text-muted"
          >
            <option value="">
              {loadingCustomerIds ? 'Loading customer IDs…' : customerIds.length ? 'Select a customer ID' : 'No IDs loaded'}
            </option>
            {customerIds.map((customerId) => (
              <option key={customerId} value={customerId}>{customerId}</option>
            ))}
          </select>
          {hasMoreCustomerIds && (
            <button
              type="button"
              onClick={loadMoreCustomerIds}
              disabled={loadingMoreCustomerIds}
              className="mt-2 text-sm underline underline-offset-4 disabled:opacity-50"
            >
              {loadingMoreCustomerIds ? 'Loading…' : `Load next 100 (${customerIds.length} loaded)`}
            </button>
          )}
          {customerIdsError && <p role="status" className="mt-2 text-sm text-red-700">{customerIdsError}</p>}
        </div>
        <label htmlFor="customer-id" className="mb-1.5 block text-sm text-muted">
          Or enter a customer ID
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
          {busy ? 'Checking…' : 'Log in'}
        </button>
        <div className="mt-6 border-t border-line pt-4">
          <SecureNote>
            {linkEncrypted()
              ? 'Your connection to Pankki is encrypted. What you type here cannot be read on the way.'
              : 'Local development build. On the live site this connection is encrypted.'}
          </SecureNote>
        </div>
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
  const [age, setAge] = useState<number | null>(null) // for the population benchmark
  const [postalCode, setPostalCode] = useState<string | null>(null) // for the area card
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
  // Every transaction, oldest first: Laya classifies purchase kinds from this history.
  const [allTxs, setAllTxs] = useState<Transaction[] | null>(null)
  const [spendingClasses, setSpendingClasses] = useState<Record<string, SpendingClass> | null>(null)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [classifyAttempt, setClassifyAttempt] = useState(0)
  const classified = useRef<Promise<Record<string, SpendingClass>> | null>(null)
  const classifyOnce = useCallback((rows: Transaction[]) => {
    if (!classified.current) {
      const request = classify(rows)
      classified.current = request
      request.catch(() => {
        if (classified.current === request) classified.current = null
      })
    }
    return classified.current
  }, [])

  // Laya labels spending on its own; no personal goal is needed.
  useEffect(() => {
    if (!allTxs || spendingClasses || classifyError) return
    let stale = false
    classifyOnce(allTxs)
      .then((classes) => !stale && setSpendingClasses(classes))
      .catch((e) => !stale && setClassifyError(e instanceof Error ? e.message : 'Unknown error'))
    return () => {
      stale = true
    }
  }, [allTxs, spendingClasses, classifyError, classifyAttempt, classifyOnce])
  const tips = useMemo(() => (allTxs ? suggestions(allTxs) : []), [allTxs])
  const baskets = useMemo(() => (allTxs ? makeBaskets(allTxs) : null), [allTxs])
  const area = useMemo(
    () =>
      baskets
        ? makeArea(postalCode, baskets.baskets.fixed.lines.find((l) => l.name === 'Housing')?.monthly ?? null, baskets.income)
        : null,
    [postalCode, baskets],
  )
  const benchmark = useMemo(() => (allTxs && baskets ? makeBenchmark(allTxs, baskets.months, age) : null), [allTxs, baskets, age])
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
        ? buildContext({ balance: txs?.[0]?.balance_after_eur ?? null, wellness, score: wellness ? visibleWellnessScore(wellness, answers) : { value: null, provisional: false }, allTxs, spendingClasses, mortgage, baskets, benchmark, area })
        : null,
    [txs, wellness, answers, wellnessError, allTxs, spendingClasses, mortgage, baskets, benchmark, area],
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
      if (!spendingClasses) return undefined
      const key = spendingKey(tx)
      return key ? spendingClasses[key] : undefined
    },
    [spendingClasses],
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
    getCustomer(customerId)
      .then((c) => {
        if (stale) return
        setAge(c?.customer_age ?? null)
        setPostalCode(c?.customer_postal_code ?? null)
      })
      .catch(() => {}) // without an age, the benchmark uses all of Finland; without a postal code, no area card
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
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pb-28">
      <header className="flex items-center justify-between py-5">
        <span className="text-lg font-semibold tracking-tight">Pankki</span>
        <div className="flex items-center gap-3 text-sm sm:gap-4">
          <ProtectedBadge />
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
        !error && <SecureLoading />
      ) : view === 'overview' ? (
        <Overview
          tips={tips}
          baskets={baskets}
          benchmark={benchmark}
          area={area}
          tagOf={tagOf}
          txs={txs}
          wellness={wellness}
          answers={answers}
          wellnessLoading={wellnessLoading}
          wellnessError={wellnessError}
          classificationLoading={!spendingClasses && classifyError === null}
          classificationError={classifyError}
          onRetryClassification={() => {
            setClassifyError(null)
            setClassifyAttempt((n) => n + 1)
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
      <WalterBar
        chat={(question, onAsked) => (
          <Chat
            question={question}
            onAsked={onAsked}
            messages={chatMessages}
            onMessages={setChatMessages}
            context={chatContext}
            ledger={chatLedger}
            starters={['How am I doing?', 'Where could I cut back?', 'What did I spend in the last two weeks?', 'What should I focus on first?']}
          />
        )}
      />
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
            starters={['How am I doing?', 'Where could I cut back?', 'What did I spend in the last two weeks?', 'What should I focus on first?']}
            prompt={chatPrompt}
            onPromptHandled={() => setChatPrompt(null)}
          />
        </ChatDialog>
      )}
    </div>
  )
}

// Walter, on every page: a bar fixed to the bottom of the screen to type a
// question in, which opens the chat and asks it.
function WalterBar({ chat }: { chat: (question: string | null, onAsked: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  return (
    <>
      <div className="fixed inset-x-0 bottom-4 z-10 px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) setQuestion(draft.trim())
            setDraft('')
            setOpen(true)
          }}
          className="mx-auto flex max-w-2xl items-center gap-3 rounded-full border border-line bg-white p-2 shadow-lg"
        >
          <WalterAvatar className="h-10 w-10 shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            aria-label="Ask Walter"
            placeholder="Talk with Walter, your personal agent…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <button
            aria-label="Send to Walter"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90"
          >
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>
      {open && <ChatDialog onClose={() => setOpen(false)}>{chat(question, () => setQuestion(null))}</ChatDialog>}
    </>
  )
}

// Laya's category-level reading of a transaction.
type Tag = SpendingClass | undefined

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
  tips,
  baskets,
  benchmark,
  area,
  tagOf,
  txs,
  wellness,
  answers,
  wellnessLoading,
  wellnessError,
  classificationLoading,
  classificationError,
  onRetryClassification,
  onShowWellness,
  onShowAll,
}: {
  tips: Suggestion[]
  baskets: Baskets | null
  benchmark: Benchmark | null
  area: AreaView | null
  tagOf: (tx: Transaction) => Tag
  txs: Transaction[]
  wellness: Wellness | null
  answers: WellnessAnswers
  wellnessLoading: boolean
  wellnessError: boolean
  classificationLoading: boolean
  classificationError: string | null
  onRetryClassification: () => void
  onShowWellness: () => void
  onShowAll: () => void
}) {
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
            <CipherText id="balance" text={eur(latest.balance_after_eur)} />
          </p>
          <div className="mt-3">
            <SecureNote>Read-only view. Nothing in this app can move your money.</SecureNote>
          </div>
        </div>
      </Card>

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
                {displayScore.provisional
                  ? 'Preliminary · account activity only.'
                  : score !== null
                    ? `${financialProfileTagline(score)} ${scoreDescription(score)}`
                    : wellnessError
                      ? 'Profile unavailable'
                      : wellnessLoading
                        ? 'Calculating…'
                        : 'Not enough account activity yet.'}
              </p>
            </div>
            <WellnessApple stage={score === null ? null : Math.min(4, Math.floor(score / 20))} golden={score === 100 && !displayScore.provisional} className="size-16 shrink-0" />
          </div>
          <button onClick={onShowWellness} className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2.5 text-sm font-medium hover:bg-paper">
            See details <span aria-hidden="true">→</span>
          </button>
        </div>
      </Card>

      {baskets && <BasketsCard data={baskets} />}

      {benchmark && <BenchmarkCard data={benchmark} />}

      {area && <AreaCard data={area} />}

      {tips.length > 0 && <TipsCard tips={tips} />}

      <Card>
        <div className="flex items-baseline justify-between px-5 pt-4 pb-1">
          <h2 className="font-medium">Latest transactions</h2>
          <button onClick={onShowAll} className="text-sm underline underline-offset-4">
            Show all
          </button>
        </div>
        <div className="px-5 pb-2">
          {classificationLoading ? (
            <p role="status" className="text-xs text-muted">Laya is classifying your spending as essential, flexible, or money set aside…</p>
          ) : classificationError ? (
            <p role="alert" className="text-xs text-red-700">
              Laya could not classify your spending.{' '}
              <button onClick={onRetryClassification} className="underline underline-offset-2">Try again</button>
            </p>
          ) : (
            <p className="text-xs text-muted">Laya’s labels are estimates based on each transaction category and type.</p>
          )}
        </div>
        <ul className="divide-y divide-line px-5">
          {txs.slice(0, 5).map((tx, i) => (
            <TxRow key={i} tx={tx} tag={tagOf(tx)} showDate />
          ))}
        </ul>
      </Card>

    </div>
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
    { title: 'Review one regular cost', summary: 'Small checks can free up money.', detail: 'Look at one bill or subscription and see whether it still suits your needs.' },
    { title: 'Check in regularly', summary: 'Keep your money picture current.', detail: 'Revisit your spending and savings as your circumstances change. These are general ideas, not financial advice.' },
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
            <WellnessApple stage={stage} golden={score === 100 && !displayScore.provisional} className="size-40 sm:size-44" />
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
          {tag && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              tag === 'essential'
                ? 'bg-slate-100 text-slate-700'
                : tag === 'flexible'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-credit/10 text-credit'
            }`}>
              {tag === 'essential' ? 'Essential' : tag === 'flexible' ? 'Flexible' : 'Money set aside'}
            </span>
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
