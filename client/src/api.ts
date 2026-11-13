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
}

export type MortgageEvent = {
  id: number
  event_timestamp: string
  event_type: string
  note: string | null
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
  const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const rows = await get<Customer[]>('customers', { customer_id: `eq.${id}` })
  return rows[0] ?? null
}

export function getTransactions(customerId: string, offset: number): Promise<Transaction[]> {
  return get('transactions', {
    customer_id: `eq.${customerId}`,
    select:
      'bank_account_id,tx_date,tx_timestamp,category,tx_amount_eur,balance_after_eur,transaction_type,merchant_id',
    order: 'tx_timestamp.desc',
    offset: String(offset),
    limit: String(PAGE_SIZE),
  })
}

export async function getMortgage(customerId: string): Promise<Mortgage | null> {
  const rows = await get<Mortgage[]>('mortgage_applications', {
    customer_id: `eq.${customerId}`,
    select: '*,mortgage_events(id,event_timestamp,event_type,note)',
    'mortgage_events.order': 'event_timestamp.desc',
  })
  return rows[0] ?? null
}
