import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  PAGE_SIZE,
  classify,
  getCustomer,
  getMortgage,
  getTransactions,
  type Mortgage,
  type Transaction,
  type Verdict,
  verdictKey,
} from './api'
import { date, eur, label, percent, signedEur } from './format'

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
    } catch {
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

type View = 'overview' | 'transactions' | 'loan'
type Verdicts = Record<string, Verdict>

function Bank({ customerId, onLogout }: { customerId: string; onLogout: () => void }) {
  const [view, setView] = useState<View>('overview')
  const [txs, setTxs] = useState<Transaction[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mortgage, setMortgage] = useState<Mortgage | null>(null)
  const [error, setError] = useState('')
  const goalKey = `goal:${customerId}`
  const [goal, setGoal] = useState(() => localStorage.getItem(goalKey) ?? '')
  // Verdicts for the current goal, by purchase kind (see verdictKey).
  const [verdicts, setVerdicts] = useState<Verdicts>({})
  const [classifyFailed, setClassifyFailed] = useState(false)

  function saveGoal(value: string) {
    if (value === goal) return
    localStorage.setItem(goalKey, value)
    setGoal(value)
    setVerdicts({})
    setClassifyFailed(false)
  }

  // Classify the purchase kinds that don't have a verdict for this goal yet.
  useEffect(() => {
    if (!goal || !txs || classifyFailed) return
    const todo = txs.filter((tx) => {
      const key = verdictKey(tx)
      return key && !(key in verdicts)
    })
    if (todo.length === 0) return
    let stale = false
    classify(goal, todo)
      .then((found) => !stale && setVerdicts((v) => ({ ...v, ...found })))
      .catch(() => !stale && setClassifyFailed(true))
    return () => {
      stale = true
    }
  }, [goal, txs, verdicts, classifyFailed])

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

      <nav className="mb-6 flex gap-6 border-b border-line text-sm">
        {tabs.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-current={view === id ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-3 ${
              view === id ? 'border-ink font-medium' : 'border-transparent text-muted'
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
          txs={txs}
          verdicts={verdicts}
          goal={goal}
          onGoal={saveGoal}
          classifyFailed={classifyFailed}
          onShowAll={() => setView('transactions')}
        />
      ) : view === 'transactions' ? (
        <Transactions
          txs={txs}
          verdicts={verdicts}
          hasMore={hasMore}
          loading={loadingMore}
          onMore={loadMore}
        />
      ) : (
        mortgage && <Loan mortgage={mortgage} />
      )}
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-line bg-white">{children}</section>
}

function Goal({
  goal,
  onGoal,
  failed,
}: {
  goal: string
  onGoal: (goal: string) => void
  failed: boolean
}) {
  const [draft, setDraft] = useState(goal)
  return (
    <Card>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault()
          onGoal(draft.trim())
        }}
      >
        <label htmlFor="goal" className="mb-1.5 block text-sm text-muted">
          Your goal
        </label>
        <div className="flex gap-2">
          <input
            id="goal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={300}
            placeholder="e.g. Save 20 000 € for a flat"
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-ink"
          />
          <button
            disabled={draft.trim() === goal}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <p className={`mt-2 text-sm ${failed ? 'text-red-700' : 'text-muted'}`}>
          {failed
            ? 'Could not rate your purchases right now.'
            : goal
              ? 'Purchases are marked as good or bad for this goal, or neutral.'
              : 'Set a goal to see which purchases help it and which work against it.'}
        </p>
      </form>
    </Card>
  )
}

const VERDICT_STYLE: Record<Verdict, string> = {
  good: 'bg-credit/10 text-credit',
  bad: 'bg-red-700/10 text-red-700',
  neutral: 'bg-paper text-muted',
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_STYLE[verdict]}`}>
      {label(verdict)}
    </span>
  )
}

function Overview({
  txs,
  verdicts,
  goal,
  onGoal,
  classifyFailed,
  onShowAll,
}: {
  txs: Transaction[]
  verdicts: Verdicts
  goal: string
  onGoal: (goal: string) => void
  classifyFailed: boolean
  onShowAll: () => void
}) {
  const latest = txs[0]
  if (!latest) return <p className="text-sm text-muted">No account activity.</p>

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

      <Goal goal={goal} onGoal={onGoal} failed={classifyFailed} />

      <Card>
        <div className="flex items-baseline justify-between px-5 pt-4 pb-1">
          <h2 className="font-medium">Latest transactions</h2>
          <button onClick={onShowAll} className="text-sm underline underline-offset-4">
            Show all
          </button>
        </div>
        <ul className="divide-y divide-line px-5">
          {txs.slice(0, 5).map((tx, i) => (
            <TxRow key={i} tx={tx} verdicts={verdicts} showDate />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function TxRow({
  tx,
  verdicts,
  showDate,
}: {
  tx: Transaction
  verdicts: Verdicts
  showDate?: boolean
}) {
  const verdict = verdicts[verdictKey(tx) ?? '']
  const type = label(tx.transaction_type)
  const title = tx.category ?? type
  const detail = [showDate && date(tx.tx_date), type !== title && type].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="truncate">{title}</span>
          {verdict && <VerdictBadge verdict={verdict} />}
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
  verdicts,
  hasMore,
  loading,
  onMore,
}: {
  txs: Transaction[]
  verdicts: Verdicts
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
                <TxRow key={i} tx={tx} verdicts={verdicts} />
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
