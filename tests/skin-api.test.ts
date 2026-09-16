import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, lookupSkin } from '../api/skin/[username].ts'
afterEach(() => vi.unstubAllGlobals())
function upstream(url = 'http://textures.minecraft.net/texture/abc123') {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({ id: 'a'.repeat(32), name: 'Builder' }))
    .mockResolvedValueOnce(Response.json({ properties: [{ name: 'textures', value: btoa(JSON.stringify({ textures: { SKIN: { url } } })) }] }))
}
describe('skin lookup boundary', () => {
  it('returns 400 for malformed encoding instead of escaping the handler', async () => {
    const res = await GET(new Request('https://example.com/api/skin/%E0%A4'))
    expect(res.status).toBe(400)
  })
  it('rejects invalid usernames without a network request', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(lookupSkin('../internal')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['https://127.0.0.1/private', 'https://textures.minecraft.net.evil.example/texture/abc', 'https://textures.minecraft.net:8443/texture/abc', 'https://textures.minecraft.net/texture/abc?redirect=1'])('rejects untrusted texture URL %s', async (url) => {
    const mock = upstream(url)
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
    expect(mock).toHaveBeenCalledTimes(2)
  })
  it('does not expose upstream exception details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal-secret')))
    const res = await GET(new Request('https://example.com/api/skin/Builder'))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('internal-secret')
  })
  it('rejects incorrect PNG dimensions before sending a skin', async () => {
    const mock = upstream().mockResolvedValueOnce(new Response(new Uint8Array(24), { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
  })
  it('accepts an official 64 by 64 PNG and upgrades http to https', async () => {
    const bytes = new Uint8Array(24)
    const data = new DataView(bytes.buffer)
    data.setUint32(0, 0x89504e47); data.setUint32(4, 0x0d0a1a0a); data.setUint32(12, 0x49484452)
    data.setUint32(16, 64); data.setUint32(20, 64)
    const mock = upstream().mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', mock)
    expect((await lookupSkin('Builder')).username).toBe('Builder')
    expect(String(mock.mock.calls[2]![0])).toBe('https://textures.minecraft.net/texture/abc123')
    expect(mock.mock.calls[2]![1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) })
  })
})
