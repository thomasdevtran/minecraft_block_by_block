import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GET as skinGet } from './api/skin/[username].ts'
import { hashFiles, PHOTO_DIRS } from './scripts/asset-revision.ts'
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

/** `VITE_OFFLINE=off npm run build` ships the kill switch: the page stops registering the worker,
 * and dist/sw.js deletes its caches and unregisters itself in every browser that had it. */
const OFFLINE = process.env.VITE_OFFLINE !== 'off'

/** Fills in src/sw.js's placeholders. Exported for the worker's unit tests. */
export function workerSource(template: string, build: string, startup: string[], enabled: boolean): string {
  const worker = template
    .replace("'__BUILD__'", JSON.stringify(build))
    .replace('[/* __STARTUP__ */]', JSON.stringify(startup))
    .replace('const ENABLED = true', `const ENABLED = ${enabled}`)
  if (worker.includes('__BUILD__') || worker.includes('__STARTUP__') || !worker.includes(`const ENABLED = ${enabled}`)) {
    throw new Error('src/sw.js placeholders changed; update workerSource in vite.config.ts.')
  }
  return worker
}

/**
 * Writes dist/sw.js from src/sw.js after the build. The build ID changes whenever the page or any
 * hashed file changes, so browsers install the new worker; STARTUP is what the page needs first.
 */
function offlineWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'offline-worker',
    apply: 'build',
    configResolved(config) { outDir = join(config.root, config.build.outDir) },
    writeBundle() {
      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const startup = ['/', ...new Set([...html.matchAll(/\b(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)].map((match) => match[1]!))]
      const template = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
      const build = createHash('sha256').update(html).update(readdirSync(join(outDir, 'assets')).sort().join('\n'))
        .update(template).update(String(OFFLINE)).digest('hex').slice(0, 12)
      writeFileSync(join(outDir, 'sw.js'), workerSource(template, build, startup, OFFLINE))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: { manifest: true },
  // Craft photos keep their names when replaced, so CraftPhoto tags their URLs with a hash of the
  // photo files. vercel.json can then cache tagged photos for a year.
  define: {
    __PHOTO_REVISION__: JSON.stringify(hashFiles(fileURLToPath(new URL('.', import.meta.url)), PHOTO_DIRS)),
    __OFFLINE__: JSON.stringify(OFFLINE),
  },
  preview: { headers: previewHeaders },
  plugins: [
    vue(),
    offlineWorker(),
    devApi({
      '/api/skin/': { GET: skinGet },
      '/api/stats': { GET: statsGet, POST: statsPost },
    }),
  ],
})
