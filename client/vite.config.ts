import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ClassifyError, classifyPurchases, type LayaConfig } from './laya'

const TABLES = ['customers', 'transactions', 'mortgage_applications']

// API for the client:
//   GET  /api/<table>?<postgrest query>   read-only Supabase access
//   POST /api/classify {goal, purchases}  good / bad / neutral verdicts from Laya (laya.ts)
// The dev server calls Supabase and Laya itself with the keys from server/.env,
// so the keys never reach the browser.
function bankApi(url: string, key: string, laya: LayaConfig): Plugin {
  return {
    name: 'bank-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const { pathname, search } = new URL(req.url ?? '/', 'http://localhost')
        if (req.method === 'POST' && pathname === '/classify') {
          res.setHeader('Content-Type', 'application/json')
          try {
            let raw = ''
            for await (const chunk of req) raw += chunk
            const { goal, purchases } = JSON.parse(raw)
            res.end(JSON.stringify(await classifyPurchases(laya, goal, purchases)))
          } catch (e) {
            res.statusCode = e instanceof ClassifyError ? e.status : 400
            res.end(JSON.stringify({ error: e instanceof ClassifyError ? e.message : 'Bad request' }))
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
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../server'), ['SUPABASE_', 'LAYA_'])
  return {
    plugins: [
      react(),
      tailwindcss(),
      bankApi(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        baseUrl: env.LAYA_BASE_URL,
        apiKey: env.LAYA_API_KEY,
      }),
    ],
  }
})
