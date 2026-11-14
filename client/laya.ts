// Purchase classifier built on Laya, a small open-source decision model.
// Runs in the dev server only, so no key reaches the browser.
//
// Laya classifies each kind of transaction on its own, without needing a
// customer goal. The result is a helpful label, not a judgement of a person.

export const SPENDING_CLASSES = ['essential', 'flexible', 'saving'] as const
export type SpendingClass = (typeof SPENDING_CLASSES)[number]

export type PurchaseKind = { category: string | null; transaction_type: string | null }

export type LayaConfig = {
  // Where Laya runs. Unset: the laya-ai.com hosted API (needs apiKey).
  // For server/laya_server.py on this machine: http://127.0.0.1:8000
  baseUrl?: string
  // Required by the hosted API only.
  apiKey?: string
}

export class ClassifyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const HOSTED_URL = 'https://api.laya-ai.com'
const MAX_KINDS = 64
const MAX_CACHED_ANSWERS = 5000
const answers = new Map<string, Promise<unknown>>()

// Transient failures are retried after these pauses; others fail at once.
const RETRY_DELAYS_MS = [300, 1000, 2500]
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRY_DELAY_MS = 5000

// Waits as long as the API asks (Retry-After, in seconds) when it says so, within reason.
function retryDelay(res: Response | null, fallback: number) {
  const seconds = Number(res?.headers.get('retry-after'))
  const base = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_DELAY_MS) : fallback
  return base + Math.random() * 200 // spread the parallel calls out
}

// The wording, state shape and one-letter labels below were measured with the
// model; change them only with a re-test.

// What kind of spending is it? State: {category, type}.
type Spending = 'n' | 'd' | 's'
const SPENDING_QUESTION = {
  type: 'choice',
  instructions: 'What kind of money movement is this?',
  criteria: {
    n: 'An essential cost for everyday life: groceries, rent, mortgage or other housing payments, utilities, insurance, health care, commuting and transport.',
    d: 'Flexible spending people can choose: restaurants, entertainment, shopping, lifestyle, electronics and things for the home, holidays and travel.',
    s: 'Money moved aside for later: a savings or investment deposit.',
  },
}

function spendingClass(spending: Spending): SpendingClass {
  if (spending === 'n') return 'essential'
  if (spending === 'd') return 'flexible'
  return 'saving'
}

const words = (s: string | null) => (s ?? 'unknown').replace(/_/g, ' ')

// Returns one spending label per purchase kind, in order.
export async function classifyPurchases(
  config: LayaConfig,
  kinds: unknown,
): Promise<SpendingClass[]> {
  const baseUrl = (config.baseUrl || HOSTED_URL).replace(/\/+$/, '')
  if (baseUrl === HOSTED_URL && !config.apiKey)
    throw new ClassifyError(503, 'Set LAYA_API_KEY in server/.env (or LAYA_BASE_URL for a local Laya server)')
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > MAX_KINDS)
    throw new ClassifyError(400, `Expected 1–${MAX_KINDS} purchases`)
  if (kinds.some((k) => !k || typeof k !== 'object' ||
    (k.category != null && typeof k.category !== 'string') ||
    (k.transaction_type != null && typeof k.transaction_type !== 'string')))
    throw new ClassifyError(400, 'Invalid purchase')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  // One /v1/systemone call; the hosted API and the local server share that endpoint.
  // A round sends many calls at once, and the first round after a quiet spell
  // (a cold API or serverless instance) tends to lose one of them to a dropped
  // connection, a 429 or a 5xx; without retries that failed the whole round.
  async function ask(state: unknown, question: object) {
    let res: Response | null = null
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${baseUrl}/v1/systemone`, {
          method: 'POST',
          headers,
          // Hosts that serve several models need Laya named; the local server ignores it.
          body: JSON.stringify({ model: 'english', state, questions: { q: question } }),
        })
      } catch {
        res = null
      }
      if ((res === null || RETRY_STATUSES.has(res.status)) && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(res, RETRY_DELAYS_MS[attempt])))
        continue
      }
      break
    }
    if (!res) throw new ClassifyError(502, `Could not reach Laya at ${baseUrl}`)
    if (!res.ok) throw new ClassifyError(502, `Laya request failed (${res.status})`)
    let answer: unknown
    try {
      answer = (await res.json())?.answers?.q
    } catch {
      throw new ClassifyError(502, 'Unexpected response from Laya')
    }
    if (!answer || typeof answer !== 'object') throw new ClassifyError(502, 'Unexpected response from Laya')
    return answer as Record<string, unknown>
  }
  // Answers depend only on the transaction kind, so they can be reused across
  // customers. Failures are not kept.
  function once<T>(state: unknown, question: object, read: (answer: Record<string, unknown>) => T): Promise<T> {
    const key = JSON.stringify([baseUrl, state, question])
    let answer = answers.get(key) as Promise<T> | undefined
    if (!answer) {
      if (answers.size >= MAX_CACHED_ANSWERS) answers.clear()
      answer = ask(state, question).then(read)
      answers.set(key, answer)
      answer.catch(() => answers.get(key) === answer && answers.delete(key))
    }
    return answer
  }
  const spendingKind = (state: unknown) =>
    once(state, SPENDING_QUESTION, ({ choice }) => {
      if (choice !== 'n' && choice !== 'd' && choice !== 's')
        throw new ClassifyError(502, 'Unexpected response from Laya')
      return choice
    })

  return Promise.all(
    (kinds as PurchaseKind[]).map(async (k) => {
      const category = words(k.category)
      return spendingClass(await spendingKind({ category, type: words(k.transaction_type) }))
    }),
  )
}
