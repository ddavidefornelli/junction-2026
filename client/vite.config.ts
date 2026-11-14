import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ClassifyError, classifyPurchases, type LayaConfig } from './laya.ts'
import { ChatError, chatReply, mortgageSteps, type ChatConfig } from './chat.ts'
import { ScenarioError, whatIfScenarios } from './scenarios.ts'
import { TtsError, speech, type TtsConfig } from './tts.ts'
import { transcribe } from './stt.ts'

const TABLES = ['customers', 'transactions', 'mortgage_applications']

// API for the client:
//   GET  /api/<table>?<postgrest query>   read-only Supabase access
//   POST /api/classify {purchases}       essential / flexible / saving labels from Laya (laya.ts)
//   POST /api/chat {context, messages, ledger, spoken}  the assistant's reply from OpenAI, streamed as plain text (chat.ts)
//   POST /api/mortgage-steps {context}    AI-written next steps towards the mortgage, as JSON (chat.ts)
//   POST /api/scenarios {context}         Walter's personalised what-if questions, as JSON (scenarios.ts)
//   POST /api/tts {text}                  Walter's voice from ElevenLabs, as MP3 audio (tts.ts)
//   POST /api/stt {audio, mimeType}       what the customer said, from ElevenLabs Scribe, as {text} (stt.ts)
// The dev server calls Supabase, Laya, OpenAI and ElevenLabs itself with keys from server/.env
// (or client/.env for Laya); the keys never reach the browser.
function bankApi(url: string, key: string, laya: LayaConfig, chat: ChatConfig, tts: TtsConfig): Plugin {
  return {
    name: 'bank-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const { pathname, search } = new URL(req.url ?? '/', 'http://localhost')
        if (req.method === 'POST' && (pathname === '/classify' || pathname === '/chat' || pathname === '/mortgage-steps' || pathname === '/scenarios' || pathname === '/tts' || pathname === '/stt')) {
          res.setHeader('Content-Type', 'application/json')
          try {
            let raw = ''
            for await (const chunk of req) raw += chunk
            const body = JSON.parse(raw)
            if (pathname === '/mortgage-steps') return res.end(JSON.stringify(await mortgageSteps(chat, body.context)))
            if (pathname === '/tts') {
              const audio = await speech(tts, body.text)
              res.setHeader('Content-Type', 'audio/mpeg')
              return res.end(audio)
            }
            if (pathname === '/stt') return res.end(JSON.stringify(await transcribe(tts, body.audio, body.mimeType)))
            if (pathname === '/scenarios') return res.end(JSON.stringify(await whatIfScenarios(chat, body.context)))
            if (pathname === '/chat') {
              const reply = await chatReply(chat, body.context, body.messages, body.ledger, body.spoken === true)
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              try {
                for await (const text of reply) res.write(text)
              } catch (e) {
                console.error('[chat] Reply cut short', e) // the browser gets what was written so far
              }
              return res.end()
            }
            res.end(JSON.stringify(await classifyPurchases(laya, body.purchases)))
          } catch (e) {
            const known = e instanceof ClassifyError || e instanceof ChatError || e instanceof ScenarioError || e instanceof TtsError
            res.statusCode = known ? e.status : 400
            res.end(JSON.stringify({ error: known ? e.message : 'Bad request' }))
          }
          return
        }
        const table = pathname.slice(1)
        if (req.method !== 'GET' || !TABLES.includes(table)) {
          res.statusCode = 404
          return res.end()
        }
        try {
          const upstream = await fetch(`${url}/rest/v1/${table}${search}`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          })
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(await upstream.text())
        } catch {
          res.statusCode = 502
          res.end()
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../server'), ['SUPABASE_', 'LAYA_', 'OPENAI_', 'ELEVENLABS_'])
  // Vite does not load non-VITE_ variables from client/.env automatically.
  // Allow a local Laya URL there too, while keeping server/.env authoritative.
  const localLaya = loadEnv(mode, import.meta.dirname, 'LAYA_')
  // The ElevenLabs key lives in .env.local at the repo root (written by `elevenlabs onboard`).
  const eleven = { ...env, ...loadEnv(mode, path.resolve(import.meta.dirname, '..'), 'ELEVENLABS_') }
  return {
    plugins: [
      react(),
      tailwindcss(),
      bankApi(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        { baseUrl: env.LAYA_BASE_URL || localLaya.LAYA_BASE_URL, apiKey: env.LAYA_API_KEY || localLaya.LAYA_API_KEY },
        { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
        { apiKey: eleven.ELEVENLABS_API_KEY, voiceId: eleven.ELEVENLABS_VOICE_ID, model: eleven.ELEVENLABS_MODEL },
      ),
    ],
  }
})
