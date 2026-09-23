/** Aggregate page loads only. No stored visitor identifiers or browsing history. */

const KEY = 'bbb:page-visits:v1'
const NO_STORE = { 'Cache-Control': 'no-store' }
const BOTS = /bot|crawl|spider|headless|lighthouse|preview|curl|wget|python|axios|node-fetch/i
let memory = 0

function configuration() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  const deployed = !!process.env.VERCEL_ENV || process.env.NODE_ENV === 'production'
  return { url, token, deployed, ready: !!(url?.startsWith('https://') && token) }
}

async function redis(command: (string | number)[], config: ReturnType<typeof configuration>): Promise<number> {
  const res = await fetch(config.url!, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error('Counter unavailable')
  const body = await res.json() as { result?: number | string | null; error?: string }
  // Redis GET returns a decimal string, or null before the first visit.
  const total = command[0] === 'GET' && body.result === null ? 0
    : command[0] === 'GET' && typeof body.result === 'string' && /^\d+$/.test(body.result) ? Number(body.result)
    : body.result
  if (body.error || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw new Error('Invalid counter response')
  return total
}

export async function POST(request: Request): Promise<Response> {
  const done = () => new Response(null, { status: 204, headers: NO_STORE })
  const config = configuration()
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') return done()
  if (config.deployed && !config.ready) return done()
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOTS.test(ua) || request.headers.get('sec-fetch-site') !== 'same-origin') return done()
  const gpc = request.headers.get('sec-gpc')
  const dnt = request.headers.get('dnt')
  // Sec-GPC is only sent when enabled. For DNT, 0 explicitly permits measurement; any
  // malformed or combined value is treated as an opt-out instead of failing open.
  if (gpc !== null || (dnt !== null && dnt !== '0')) return done()
  if (request.headers.get('origin') !== new URL(request.url).origin) return done()
  try {
    if (config.ready) await redis(['INCR', KEY], config)
    else memory += 1 // Local development only; never used as a published total.
  } catch { /* Measurement failures must not fail the site. */ }
  return done()
}

export async function GET(): Promise<Response> {
  const config = configuration()
  if (config.deployed && !config.ready) return Response.json({ error: 'Visit count is not configured.' }, { status: 503, headers: NO_STORE })
  try {
    const total = config.ready ? await redis(['GET', KEY], config) : memory
    return Response.json({
      total, updatedAt: new Date().toISOString(),
      method: config.ready ? 'Aggregate page loads, including repeat visits and reloads. No visitor identifiers are stored by the counter.' : 'Local development count; resets when the server restarts.',
      accuracy: config.ready ? 'Not unique people. Privacy signals, blockers, failed requests and bot filtering can exclude visits; automated requests can inflate the total.' : 'Development data only',
    }, { headers: { 'Cache-Control': config.ready ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store' } })
  } catch {
    return Response.json({ error: 'The counter is unavailable right now.' }, { status: 503, headers: NO_STORE })
  }
}
