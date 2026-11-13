// Laya (laya.studio) purchase classifier. Runs in the dev server only, so the
// API key from server/.env never reaches the browser.

export const VERDICTS = ['good', 'bad', 'neutral'] as const
export type Verdict = (typeof VERDICTS)[number]

export type PurchaseKind = { category: string | null; transaction_type: string | null }

const HOSTED_URL = 'https://api.laya.studio'
const MAX_KINDS = 64
const MAX_GOAL_LENGTH = 300

const QUESTION = {
  type: 'choice',
  instructions: "How does this spending affect the customer's goal?",
  criteria: {
    good: 'The spending directly moves the customer toward the goal, for example a savings or investment deposit for a saving goal, or paying for exactly what the goal is about.',
    bad: 'Optional, discretionary spending that works against the goal or uses up money the goal needs.',
    neutral:
      'A necessary everyday living cost such as groceries, mortgage, rent or other housing payments, utilities, insurance, health care or commuting, or spending that has nothing to do with the goal.',
  },
}

export class ClassifyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type LayaConfig = {
  // Where Laya runs. Unset: the hosted API. For the open-source server
  // (laya-serve) on this machine: http://127.0.0.1:8000
  baseUrl?: string
  // Required by the hosted API; only needed locally if laya-serve was given one.
  apiKey?: string
}

const words = (s: string | null) => (s ?? 'unknown').replace(/_/g, ' ')

// Returns one verdict per purchase kind, in order. Each kind is one
// /v1/systemone call: the hosted API and laya-serve share that endpoint,
// while their batch endpoints take different request shapes.
export async function classifyPurchases(
  config: LayaConfig,
  goal: unknown,
  kinds: unknown,
): Promise<Verdict[]> {
  const baseUrl = (config.baseUrl || HOSTED_URL).replace(/\/+$/, '')
  if (baseUrl === HOSTED_URL && !config.apiKey)
    throw new ClassifyError(503, 'Set LAYA_API_KEY or LAYA_BASE_URL in server/.env')
  if (typeof goal !== 'string' || !goal.trim() || goal.length > MAX_GOAL_LENGTH)
    throw new ClassifyError(400, 'Invalid goal')
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > MAX_KINDS)
    throw new ClassifyError(400, `Expected 1–${MAX_KINDS} purchases`)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  return Promise.all(
    (kinds as PurchaseKind[]).map(async (k) => {
      let res: Response
      try {
        res = await fetch(`${baseUrl}/v1/systemone`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            state: `Customer's goal: ${goal.trim()}\nBank transaction: ${words(k.transaction_type)}, category "${words(k.category)}".`,
            questions: { verdict: QUESTION },
          }),
        })
      } catch {
        throw new ClassifyError(502, `Could not reach Laya at ${baseUrl}`)
      }
      if (!res.ok) throw new ClassifyError(502, `Laya request failed (${res.status})`)
      const choice = (await res.json())?.answers?.verdict?.choice
      if (!VERDICTS.includes(choice)) throw new ClassifyError(502, 'Unexpected response from Laya')
      return choice as Verdict
    }),
  )
}
