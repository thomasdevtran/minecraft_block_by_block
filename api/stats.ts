/** Opt-in approximate browser count. No page-view, daily-history or event tracking. */
import { createHmac } from 'node:crypto'

const KEY = 'bbb:hll:consenting:v1'
const NO_STORE = { 'Cache-Control': 'no-store' }
const BOTS = /bot|crawl|spider|headless|lighthouse|preview|curl|wget|python|axios|node-fetch/i
const memory = new Set<string>()

function configuration() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  const salt = process.env.VISITOR_SALT
  const deployed = !!process.env.VERCEL_ENV || process.env.NODE_ENV === 'production'
  return { url, token, salt, deployed, ready: !!(url?.startsWith('https://') && token && salt && salt.length >= 32) }
}

async function redis(command: (string | number)[], config: ReturnType<typeof configuration>): Promise<number> {
  const res = await fetch(config.url!, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error('Counter unavailable')
  const body = await res.json() as { result?: number; error?: string }
  if (body.error || typeof body.result !== 'number' || !Number.isFinite(body.result) || body.result < 0) throw new Error('Invalid counter response')
  return body.result
}

export async function POST(request: Request): Promise<Response> {
  const done = () => new Response(null, { status: 204, headers: NO_STORE })
  const config = configuration()
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return done()
  if (config.deployed && !config.ready) return done()
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOTS.test(ua) || request.headers.get('sec-fetch-site') !== 'same-origin') return done()
  if (request.headers.get('x-visitor-consent') !== 'granted' || request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return done()
  if (request.headers.get('origin') !== new URL(request.url).origin) return done()
  // Vercel overwrites x-forwarded-for at its trusted edge. Other hosts need a trusted proxy.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (config.deployed && !ip) return done()
  const hash = createHmac('sha256', config.salt ?? 'local-development-only').update(`${ip}\n${ua}`).digest('hex')
  try {
    if (config.ready) await redis(['PFADD', KEY, hash], config)
    else memory.add(hash) // Local development only; never used as a published total.
  } catch { /* Measurement failures must not fail the site. */ }
  return done()
}

export async function GET(): Promise<Response> {
  const config = configuration()
  if (config.deployed && !config.ready) return Response.json({ error: 'Visitor count is not configured.' }, { status: 503, headers: NO_STORE })
  try {
    const total = config.ready ? await redis(['PFCOUNT', KEY], config) : memory.size
    return Response.json({
      total, updatedAt: new Date().toISOString(),
      method: config.ready ? 'Approximate count of opted-in IP and browser combinations using a keyed hash and HyperLogLog. Not a count of individual people.' : 'Local development count; resets when the server restarts.',
      accuracy: config.ready ? 'About 0.81% statistical standard error; consent, shared connections and changing browsers create additional measurement error.' : 'Development data only',
    }, { headers: { 'Cache-Control': config.ready ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store' } })
  } catch {
    return Response.json({ error: 'The counter is unavailable right now.' }, { status: 503, headers: NO_STORE })
  }
}
