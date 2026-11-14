type Request = {
  method?: string
  url?: string
  body?: unknown
}

type Response = {
  status(code: number): Response
  setHeader(name: string, value: string): void
  json(body: unknown): void
  write(chunk: string): void
  end(body?: string | Uint8Array): void
}

const TABLES = new Set(['customers', 'transactions', 'mortgage_applications'])

// What to answer when a route fails. ClassifyError and ChatError carry the
// status to use; they are recognised by shape because their modules are loaded
// inside the routes, and may be what failed to load.
function failure(error: unknown): { status: number; message: string } {
  if (error instanceof Error && typeof (error as { status?: unknown }).status === 'number')
    return { status: (error as unknown as { status: number }).status, message: error.message }
  return { status: 500, message: 'Server error' }
}

export default async function handler(req: Request, res: Response) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost')
  const resource = requestUrl.pathname.split('/').filter(Boolean).at(-1)

  if (resource === 'classify') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      // Load the classifier only for this route. Keeping the bank data routes
      // independent avoids making their startup depend on classifier bundling.
      // The ".js" is required: the function runs as an ES module, where Node
      // does not resolve an import without its extension.
      const { classifyPurchases } = await import('../laya.js')
      const { purchases } = (req.body ?? {}) as { purchases?: unknown }
      const config = {
        baseUrl: process.env.LAYA_BASE_URL,
        apiKey: process.env.LAYA_API_KEY,
      }
      return res.json(await classifyPurchases(config, purchases))
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/classify] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'chat') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { chatReply } = await import('../chat.js')
      const { context, messages, ledger, spoken, future } = (req.body ?? {}) as { context?: unknown; messages?: unknown; ledger?: unknown; spoken?: unknown; future?: unknown }
      const config = { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }
      const reply = await chatReply(config, context, messages, ledger, spoken === true, future === true)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      try {
        for await (const text of reply) res.write(text)
      } catch (error) {
        console.error('[api/chat] Reply cut short', error) // the browser gets what was written so far
      }
      return res.end()
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/chat] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'scenarios') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { whatIfScenarios } = await import('../scenarios.js')
      const { context } = (req.body ?? {}) as { context?: unknown }
      const config = { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }
      return res.json(await whatIfScenarios(config, context))
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/scenarios] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'tts') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { speech } = await import('../tts.js')
      const { text, voice } = (req.body ?? {}) as { text?: unknown; voice?: unknown }
      const config = {
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID,
        model: process.env.ELEVENLABS_MODEL,
        futureVoiceId: process.env.ELEVENLABS_FUTURE_VOICE_ID,
      }
      const audio = await speech(config, text, voice === 'future')
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Cache-Control', 'no-store')
      return res.end(audio)
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/tts] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'stt') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { transcribe } = await import('../stt.js')
      const { audio, mimeType } = (req.body ?? {}) as { audio?: unknown; mimeType?: unknown }
      const config = { apiKey: process.env.ELEVENLABS_API_KEY }
      return res.json(await transcribe(config, audio, mimeType))
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/stt] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'mortgage-steps') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { mortgageSteps } = await import('../chat.js')
      const { context } = (req.body ?? {}) as { context?: unknown }
      const config = { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }
      return res.json(await mortgageSteps(config, context))
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/mortgage-steps] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (resource === 'briefing') {
    if (req.method !== 'POST') return res.status(405).end()

    try {
      const { morningBriefing } = await import('../chat.js')
      const { context, today, mode } = (req.body ?? {}) as { context?: unknown; today?: unknown; mode?: unknown }
      const config = { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }
      return res.json(await morningBriefing(config, context, today, mode))
    } catch (error) {
      const { status, message } = failure(error)
      console.error('[api/briefing] Request failed', { status, message, error })
      return res.status(status).json({ error: message })
    }
  }

  if (!TABLES.has(resource ?? '')) return res.status(404).end()
  if (req.method !== 'GET') return res.status(405).end()

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[api] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return res.status(500).json({ error: 'Bank API is not configured' })
  }

  try {
    // Vercel exposes dynamic route params as query params too; don't pass
    // `resource=customers` through to PostgREST as a database filter.
    requestUrl.searchParams.delete('resource')
    const query = requestUrl.searchParams.toString()
    const upstream = await fetch(`${url}/rest/v1/${resource}${query ? `?${query}` : ''}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    res.setHeader('Content-Type', 'application/json')
    res.status(upstream.status)
    return res.end(await upstream.text())
  } catch (error) {
    console.error('[api] Supabase request failed', { resource, error })
    return res.status(502).json({ error: 'Could not reach Supabase' })
  }
}
