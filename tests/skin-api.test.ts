import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, lookupSkin } from '../api/skin/[username].ts'
afterEach(() => vi.unstubAllGlobals())
function upstream(url = 'http://textures.minecraft.net/texture/abc123') {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({ id: 'a'.repeat(32), name: 'Builder' }))
    .mockResolvedValueOnce(Response.json({ properties: [{ name: 'textures', value: btoa(JSON.stringify({ textures: { SKIN: { url } } })) }] }))
}

function pngBytes(size = 24) {
  const bytes = new Uint8Array(size)
  const data = new DataView(bytes.buffer)
  data.setUint32(0, 0x89504e47); data.setUint32(4, 0x0d0a1a0a); data.setUint32(12, 0x49484452)
  data.setUint32(16, 64); data.setUint32(20, 64)
  return bytes
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
  it.each([
    '', 'a'.repeat(17), 'player-name', 'player name', 'pläyer', '../internal', 'name\0tail',
  ])('rejects attack-shaped username %j before a network request', async (username) => {
    vi.stubGlobal('fetch', vi.fn())
    const res = await GET(new Request(`https://example.com/api/skin/${encodeURIComponent(username)}`))
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('accepts the 16-character username boundary', async () => {
    const mock = upstream().mockResolvedValueOnce(new Response(pngBytes(), { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', mock)
    expect((await lookupSkin('a'.repeat(16))).username).toBe('Builder')
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
  it.each([429, 500, 503])('contains an upstream profile failure with status %i', async (status) => {
    const mock = vi.fn().mockResolvedValue(new Response('upstream-secret', { status }))
    vi.stubGlobal('fetch', mock)
    const res = await GET(new Request('https://example.com/api/skin/Builder'))
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('upstream-secret')
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed profile data before requesting a session', async () => {
    const mock = vi.fn().mockResolvedValue(Response.json({ id: 'not-an-id', name: 'Builder\r\nInjected' }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('caps encoded texture metadata before decoding it', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'a'.repeat(32), name: 'Builder' }))
      .mockResolvedValueOnce(Response.json({ properties: [{ name: 'textures', value: 'A'.repeat(64 * 1024 + 1) }] }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
    expect(mock).toHaveBeenCalledTimes(2)
  })
  it('contains malformed texture metadata without fetching an image', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'a'.repeat(32), name: 'Builder' }))
      .mockResolvedValueOnce(Response.json({ properties: [{ name: 'textures', value: btoa('{not-json') }] }))
    vi.stubGlobal('fetch', mock)
    const res = await GET(new Request('https://example.com/api/skin/Builder'))
    expect(res.status).toBe(502)
    expect(mock).toHaveBeenCalledTimes(2)
  })
  it('rejects incorrect PNG dimensions before sending a skin', async () => {
    const mock = upstream().mockResolvedValueOnce(new Response(new Uint8Array(24), { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
  })
  it('rejects a declared oversized PNG without reading its body', async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(pngBytes()) } })
    const mock = upstream().mockResolvedValueOnce(new Response(body, {
      headers: { 'Content-Type': 'image/png', 'Content-Length': String(1024 * 1024 + 1) },
    }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
    expect(pulls).toBeLessThanOrEqual(1)
  })
  it('enforces the streamed PNG limit even when content-length is absent', async () => {
    const mock = upstream().mockResolvedValueOnce(new Response(new Uint8Array(1024 * 1024 + 1), {
      headers: { 'Content-Type': 'image/png' },
    }))
    vi.stubGlobal('fetch', mock)
    await expect(lookupSkin('Builder')).rejects.toMatchObject({ status: 502 })
  })
  it('accepts an official 64 by 64 PNG and upgrades http to https', async () => {
    const mock = upstream().mockResolvedValueOnce(new Response(pngBytes(), { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', mock)
    expect((await lookupSkin('Builder')).username).toBe('Builder')
    expect(String(mock.mock.calls[2]![0])).toBe('https://textures.minecraft.net/texture/abc123')
    expect(mock.mock.calls[2]![1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) })
  })
})
