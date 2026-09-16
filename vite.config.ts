import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { GET as skinGet } from './api/skin/[username].ts'
import { GET as statsGet, POST as statsPost } from './api/stats.ts'

type Handler = (request: Request) => Promise<Response>
type Route = { GET?: Handler; POST?: Handler }

// Apply the deployed security headers to local production previews too.
const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const previewHeaders = Object.fromEntries(deployment.headers.find((rule) => rule.source === '/(.*)')!.headers.map(({ key, value }) => [key, value]))

/**
 * Serves the Vercel functions from the dev server, so `npm run dev` needs no extra tools.
 * Routes are matched by path prefix, the same way Vercel maps files under api/.
 */
function devApi(routes: Record<string, Route>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const [prefix, handlers] of Object.entries(routes)) {
        server.middlewares.use(prefix, async (req, res) => {
          const handler = req.method === 'POST' ? handlers.POST : req.method === 'GET' ? handlers.GET : undefined
          if (!handler) {
            res.statusCode = 405
            return res.end()
          }

          // Connect strips the prefix from req.url, so put it back to rebuild the real path.
          // No body is forwarded: neither function reads one (the visit beacon is empty).
          const path = prefix.replace(/\/$/, '') + (req.url ?? '')
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${path}`, {
            method: req.method,
            headers: Object.entries(req.headers).flatMap(([k, v]) =>
              v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v] as [string, string]],
            ),
          })

          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  preview: { headers: previewHeaders },
  plugins: [
    vue(),
    devApi({
      '/api/skin/': { GET: skinGet },
      '/api/stats': { GET: statsGet, POST: statsPost },
    }),
  ],
})
