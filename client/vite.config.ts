import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const TABLES = ['customers', 'transactions', 'mortgage_applications']

// Read-only API for the client: GET /api/<table>?<postgrest query>.
// The dev server queries Supabase itself with the key from server/.env,
// so the key never reaches the browser.
function bankApi(url: string, key: string): Plugin {
  return {
    name: 'bank-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const { pathname, search } = new URL(req.url ?? '/', 'http://localhost')
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
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '../server'), 'SUPABASE_')
  return {
    plugins: [react(), tailwindcss(), bankApi(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)],
  }
})
