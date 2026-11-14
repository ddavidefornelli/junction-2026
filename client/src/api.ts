export type Customer = {
  customer_id: string
  customer_postal_code: string | null
  customer_age: number | null
}

export type Transaction = {
  bank_account_id: string
  tx_date: string
  tx_timestamp: string
  category: string | null
  tx_amount_eur: number
  balance_after_eur: number
  transaction_type: string | null
  merchant_id: string | null
  mcc_code: string | null
}

export type MortgageEvent = {
  id: number
  event_timestamp: string
  event_type: string
  note: string | null
  expense_type: string | null
  expense_amount: number | null
  collateral_type: string | null
  collateral_value: number | null
  collateral_status: string | null
}

export type Mortgage = {
  mortgage_customer_id: string
  final_decision: string | null
  rejection_reason: string | null
  final_property_price_eur: number | null
  final_requested_loan_eur: number | null
  final_equity_amount_eur: number | null
  final_collateral_value_eur: number | null
  required_monthly_income_eur: number | null
  final_loan_to_value: number | null
  mortgage_events: MortgageEvent[]
}

export const PAGE_SIZE = 50

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const endpoint = `/api/${path}`
  console.info('[bank api] GET', endpoint)
  let res: Response
  try {
    res = await fetch(`${endpoint}?${new URLSearchParams(params)}`)
  } catch (error) {
    console.error('[bank api] Network request failed', { endpoint, error })
    throw error
  }
  console.info('[bank api] Response', { endpoint, status: res.status, ok: res.ok })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[bank api] Server returned an error', {
      endpoint,
      status: res.status,
      detail: detail.slice(0, 500),
    })
    throw new Error(`Request failed (${res.status})`)
  }
  return res.json()
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const rows = await get<Customer[]>('customers', { customer_id: `eq.${id}` })
  return rows[0] ?? null
}

export async function getCustomerIds(offset: number, limit = 100): Promise<string[]> {
  const rows = await get<Pick<Customer, 'customer_id'>[]>('customers', {
    select: 'customer_id',
    order: 'customer_id.asc',
    offset: String(offset),
    limit: String(limit),
  })
  return rows.map((row) => row.customer_id)
}

export function getTransactions(customerId: string, offset: number): Promise<Transaction[]> {
  return get('transactions', {
    customer_id: `eq.${customerId}`,
    select:
      'bank_account_id,tx_date,tx_timestamp,category,tx_amount_eur,balance_after_eur,transaction_type,merchant_id,mcc_code',
    order: 'tx_timestamp.desc',
    offset: String(offset),
    limit: String(PAGE_SIZE),
  })
}

// Fetch every transaction for the selected customer; the account feed is only paginated 50 at a time.
// Use 1000-row pages (Supabase's default maximum) so wellness never reports partial totals.
export async function getWellnessTransactions(customerId: string): Promise<Transaction[]> {
  const result: Transaction[] = []
  const batchSize = 1000
  while (true) {
    const rows = await get<Transaction[]>('transactions', {
      customer_id: `eq.${customerId}`,
      select: 'bank_account_id,tx_date,tx_timestamp,category,tx_amount_eur,balance_after_eur,transaction_type,merchant_id,mcc_code',
      order: 'tx_timestamp.asc',
      offset: String(result.length),
      limit: String(batchSize),
    })
    result.push(...rows)
    if (rows.length < batchSize) return result
  }
}

export async function getMortgage(customerId: string): Promise<Mortgage | null> {
  const rows = await get<Mortgage[]>('mortgage_applications', {
    customer_id: `eq.${customerId}`,
    select: '*,mortgage_events(id,event_timestamp,event_type,note,expense_type,expense_amount,collateral_type,collateral_value,collateral_status)',
    'mortgage_events.order': 'event_timestamp.desc',
  })
  return rows[0] ?? null
}

export type SpendingClass = 'essential' | 'flexible' | 'saving'

// Matching category and transaction type share one Laya label.
export const spendingKey = (tx: Transaction) =>
  tx.tx_amount_eur < 0 ? `${tx.category}|${tx.transaction_type}` : null

export async function classify(txs: Transaction[]): Promise<Record<string, SpendingClass>> {
  const kinds = new Map<string, Pick<Transaction, 'category' | 'transaction_type'>>()
  for (const tx of txs) {
    const key = spendingKey(tx)
    if (key) kinds.set(key, { category: tx.category, transaction_type: tx.transaction_type })
  }
  if (kinds.size === 0) return {}
  const res = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchases: [...kinds.values()] }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(typeof detail?.error === 'string' ? detail.error : `Request failed (${res.status})`)
  }
  const classes: SpendingClass[] = await res.json()
  return Object.fromEntries([...kinds.keys()].map((key, i) => [key, classes[i]]))
}
