// Purchase classifier built on Laya, a small open-source decision model.
// Runs in the dev server only, so no key reaches the browser.
//
// Laya is too small to judge "is this purchase good for this goal?" in one
// step (asked directly it answers "good" or "neutral" to almost everything).
// It is reliable on simpler questions, so it answers three of those and the
// verdict is combined from them in verdictFor().

export const VERDICTS = ['good', 'bad', 'neutral'] as const
export type Verdict = (typeof VERDICTS)[number]

export type PurchaseKind = { category: string | null; transaction_type: string | null }

export type LayaConfig = {
  // Where Laya runs. Unset: the hosted API (api.laya.studio).
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

const HOSTED_URL = 'https://api.laya.studio'
const MAX_KINDS = 64
const MAX_GOAL_LENGTH = 300

// The wording, the state shapes and even the one-letter labels below were
// picked by measuring the model's answers; change them only with a re-test.

// 1. What kind of spending is it? State: {category, type}.
type Spending = 'n' | 'd' | 's'
const SPENDING_QUESTION = {
  type: 'choice',
  instructions: 'What kind of spending is this?',
  criteria: {
    n: 'A basic living cost that people cannot avoid: groceries, rent, mortgage or other housing payments, utilities, insurance, health care, commuting and transport.',
    d: 'Optional spending people choose to do: restaurants, entertainment, shopping, lifestyle, electronics and things for the home, holidays and travel.',
    s: 'Money put aside for later: a savings or investment deposit.',
  },
}

// 2. Is the goal about money? State: "Goal: …". Answer: probability of yes.
const SAVING_GOAL_QUESTION = {
  type: 'noul',
  instructions:
    'Is this goal about saving money, spending less, paying off debt or building up money for something?',
}

// 3. Is the spending what the goal talks about? State: {goal, spending}.
const SAME_TOPIC_QUESTION = {
  type: 'noul',
  instructions: 'Is the spending the same kind of activity that the goal mentions?',
}

function verdictFor(spending: Spending, savingGoal: boolean, sameTopic: boolean): Verdict {
  // Money put aside helps a money goal.
  if (spending === 's') return savingGoal || sameTopic ? 'good' : 'neutral'
  // Optional spending hurts a money goal; otherwise it helps only if it is what the goal is about.
  if (spending === 'd') return savingGoal ? 'bad' : sameTopic ? 'good' : 'neutral'
  // Necessities (groceries, housing, utilities…) are neutral, unless a
  // non-money goal is about exactly that, e.g. "get fit" and health.
  return !savingGoal && sameTopic ? 'good' : 'neutral'
}

const words = (s: string | null) => (s ?? 'unknown').replace(/_/g, ' ')

// Returns one verdict per purchase kind, in order.
export async function classifyPurchases(
  config: LayaConfig,
  goal: unknown,
  kinds: unknown,
): Promise<Verdict[]> {
  const baseUrl = (config.baseUrl || HOSTED_URL).replace(/\/+$/, '')
  if (baseUrl === HOSTED_URL && !config.apiKey)
    throw new ClassifyError(503, 'Set LAYA_BASE_URL or LAYA_API_KEY in server/.env')
  if (typeof goal !== 'string' || !goal.trim() || goal.length > MAX_GOAL_LENGTH)
    throw new ClassifyError(400, 'Invalid goal')
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > MAX_KINDS)
    throw new ClassifyError(400, `Expected 1–${MAX_KINDS} purchases`)
  const goalText = goal.trim()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  // One /v1/systemone call; the hosted API and the local server share that endpoint.
  async function ask(state: unknown, question: object) {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/v1/systemone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ state, questions: { q: question } }),
      })
    } catch {
      throw new ClassifyError(502, `Could not reach Laya at ${baseUrl}`)
    }
    if (!res.ok) throw new ClassifyError(502, `Laya request failed (${res.status})`)
    const answer = (await res.json())?.answers?.q
    if (!answer) throw new ClassifyError(502, 'Unexpected response from Laya')
    return answer
  }
  const yes = async (state: unknown, question: object) => (await ask(state, question)).noul > 0.5

  const savingGoal = yes(`Goal: ${goalText}`, SAVING_GOAL_QUESTION)
  return Promise.all(
    (kinds as PurchaseKind[]).map(async (k) => {
      const category = words(k.category)
      const [spending, sameTopic] = await Promise.all([
        ask({ category, type: words(k.transaction_type) }, SPENDING_QUESTION),
        yes({ goal: goalText, spending: category.toLowerCase() }, SAME_TOPIC_QUESTION),
      ])
      return verdictFor(spending.choice, await savingGoal, sameTopic)
    }),
  )
}
