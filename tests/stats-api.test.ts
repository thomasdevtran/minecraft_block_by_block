import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '../api/stats.ts'

const headers = {
  'user-agent': 'Mozilla/5.0 TestBrowser', 'sec-fetch-site': 'same-origin',
  origin: 'https://example.com', 'x-visitor-consent': 'granted', 'x-forwarded-for': '192.0.2.1',
}
const request = (overrides: Record<string, string> = {}) => new Request('https://example.com/api/stats', { method: 'POST', headers: { ...headers, ...overrides } })

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('VISITOR_SALT', 'test-key-longer-than-thirty-two-characters')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ result: 1 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('visitor counter privacy boundary', () => {
  it.each<Record<string, string>>([
    { 'x-visitor-consent': '' }, { 'sec-gpc': '1' }, { dnt: '1' },
    { origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' },
    { 'x-forwarded-for': '' }, { 'user-agent': 'Googlebot' },
  ])('does not process a disallowed request: %j', async (overrides) => {
    expect((await POST(request(overrides))).status).toBe(204)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('writes only a keyed aggregate contribution, never raw identity or page data', async () => {
    await POST(request())
    const call = vi.mocked(fetch).mock.calls[0]!
    const body = JSON.parse(call[1]!.body as string)
    expect(body).toEqual(['PFADD', 'bbb:hll:consenting:v1', expect.stringMatching(/^[a-f0-9]{64}$/)])
    expect(call[1]!.body).not.toContain('192.0.2.1')
    expect(call[1]!.body).not.toContain('Mozilla')
  })
  it('fails closed with a missing production secret or Redis config', async () => {
    vi.stubEnv('VISITOR_SALT', '')
    expect((await GET()).status).toBe(503)
    await POST(request())
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('VISITOR_SALT', 'test-key-longer-than-thirty-two-characters')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect((await GET()).status).toBe(503)
    await POST(request())
    expect(fetch).not.toHaveBeenCalled()
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
  it('returns only the aggregate total and methodology', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ result: 42 }))
    const body = await (await GET()).json() as { total: number }
    expect(body.total).toBe(42)
    expect(body).not.toHaveProperty('daily')
    expect(body).not.toHaveProperty('views')
  })
})
