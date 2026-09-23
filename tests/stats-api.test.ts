import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '../api/stats.ts'

const headers = {
  'user-agent': 'Mozilla/5.0 TestBrowser', 'sec-fetch-site': 'same-origin',
  origin: 'https://example.com', 'x-forwarded-for': '192.0.2.1',
}
const request = (overrides: Record<string, string> = {}) => new Request('https://example.com/api/stats', { method: 'POST', headers: { ...headers, ...overrides } })

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ result: 1 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('visitor counter privacy boundary', () => {
  it.each<Record<string, string>>([
    { 'sec-gpc': '1' }, { dnt: '1' },
    { origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' },
    { 'user-agent': 'Googlebot' },
  ])('does not process a disallowed request: %j', async (overrides) => {
    expect((await POST(request(overrides))).status).toBe(204)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each<Record<string, string>>([
    { 'sec-gpc': '0, 1' }, { dnt: 'yes' },
    { origin: 'https://example.com.attacker.test' }, { 'sec-fetch-site': 'same-site' },
    { 'user-agent': 'Mozilla/5.0 HeadlessChrome' },
  ])('rejects spoofed or ambiguous browser signals: %j', async (overrides) => {
    await POST(request(overrides))
    expect(fetch).not.toHaveBeenCalled()
  })
  it('handles a bounded burst of rejected requests without touching Redis', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => POST(request({
      origin: `https://attacker-${i}.example`,
      'x-forwarded-for': `192.0.2.${i}`,
    }))))
    expect(fetch).not.toHaveBeenCalled()
  })
  it('allows the explicit DNT opt-in value', async () => {
    await POST(request({ dnt: '0' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('increments only an aggregate total, never raw identity or page data', async () => {
    await POST(request())
    const call = vi.mocked(fetch).mock.calls[0]!
    const body = JSON.parse(call[1]!.body as string)
    expect(body).toEqual(['INCR', 'bbb:page-visits:v1'])
    expect(call[1]!.body).not.toContain('192.0.2.1')
    expect(call[1]!.body).not.toContain('Mozilla')
  })
  it('counts repeat visits from the same browser separately', async () => {
    let total = 0
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const command = JSON.parse(options!.body as string)
      if (command[0] === 'INCR') total += 1
      return Response.json({ result: command[0] === 'GET' ? String(total) : total })
    })
    await POST(request())
    await POST(request())
    expect(await (await GET()).json()).toMatchObject({ total: 2 })
  })
  it('counts without consent, IP headers or an identity secret', async () => {
    vi.stubEnv('VISITOR_SALT', '')
    await POST(request({ 'x-forwarded-for': '' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed with missing Redis config in production', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    expect((await GET()).status).toBe(503)
    await POST(request())
    expect(fetch).not.toHaveBeenCalled()
  })
  it('starts at zero when the new aggregate does not yet exist', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ result: null }))
    expect(await (await GET()).json()).toMatchObject({ total: 0 })
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify(['GET', 'bbb:page-visits:v1']),
    }))
  })
  it('does not write preview traffic', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    await POST(request())
    expect(fetch).not.toHaveBeenCalled()
  })
  it('accepts environment names from the Vercel Upstash integration', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example.com')
    vi.stubEnv('KV_REST_API_TOKEN', 'kv-token')
    expect((await GET()).status).toBe(200)
    expect(fetch).toHaveBeenCalledWith('https://kv.example.com', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer kv-token' }),
    }))
  })
  it('reports provider failures instead of a false zero', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'WRONGTYPE' }))
    expect((await GET()).status).toBe(503)
  })
  it.each([
    new Response('rate limited', { status: 429 }),
    Response.json({ result: -1 }),
    Response.json({ result: 'invalid' }),
    Response.json({ result: '' }),
    Response.json({ result: 1.5 }),
    Response.json({ result: '9007199254740992' }),
    new Response('not-json', { status: 200 }),
  ])('contains a hostile or limited counter response', async (upstreamResponse) => {
    vi.mocked(fetch).mockResolvedValue(upstreamResponse)
    expect((await GET()).status).toBe(503)
  })
  it('keeps write failures invisible to the visitor', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('provider secret'))
    const res = await POST(request())
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })
  it('uses bounded, non-redirecting requests to the counter provider', async () => {
    await GET()
    expect(fetch).toHaveBeenCalledWith('https://redis.example.com', expect.objectContaining({
      redirect: 'error', signal: expect.any(AbortSignal),
    }))
  })
  it('returns only the aggregate total and methodology', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ result: 42 }))
    const body = await (await GET()).json() as { total: number }
    expect(body.total).toBe(42)
    expect(body).not.toHaveProperty('daily')
    expect(body).not.toHaveProperty('views')
  })
})
