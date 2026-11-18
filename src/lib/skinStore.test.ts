import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'

const skin = { label: 'Private skin', model: 'classic' as const, dataUrl: 'data:image/png;base64,dGVzdA==' }
let data: Map<string, string>
beforeEach(() => {
  vi.resetModules()
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../engine/skin')
})

describe('lazy skin processing', () => {
  it('keeps state and account checks synchronous without importing the processor', async () => {
    const imported = vi.fn()
    const readSkinPng = vi.fn().mockRejectedValue(new Error('processor failed'))
    vi.doMock('../engine/skin', () => { imported(); return { readSkinPng } })
    const store = await import('./skinStore')
    store.setSkin({ ...skin, accountId: 'owner-a' })
    store.syncAccountSkin('owner-b')
    expect(store.currentSkin.value).toBeNull()
    expect(imported).not.toHaveBeenCalled()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('skin bytes')))
    await expect(store.fetchSkinByUsername('Steve')).rejects.toThrow('processor failed')
    expect(imported).toHaveBeenCalledOnce()
    expect(readSkinPng).toHaveBeenCalledOnce()
  })

  it('validates each lookup before encoding, and retries after invalid image data', async () => {
    const png = PNG.sync.write(new PNG({ width: 64, height: 64 }))
    const encode = vi.fn()
    vi.stubGlobal('FileReader', class {
      result = ''
      onload: (() => void) | null = null
      readAsDataURL(blob: Blob) {
        encode(blob)
        void blob.arrayBuffer().then(bytes => {
          this.result = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
          this.onload?.()
        })
      }
    })
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('invalid image'))
      .mockResolvedValueOnce(new Response(new Uint8Array(png), {
        headers: { 'X-Skin-Model': 'slim', 'X-Skin-Username': 'CanonicalName' },
      }))
    vi.stubGlobal('fetch', request)
    const store = await import('./skinStore')
    store.setSkin(skin)
    await expect(store.fetchSkinByUsername('  Player  ')).rejects.toThrow('valid PNG')
    expect(encode).not.toHaveBeenCalled()
    const loaded = await store.fetchSkinByUsername('  Player  ')
    expect(loaded).toEqual({ label: 'CanonicalName', model: 'slim', dataUrl: `data:image/png;base64,${png.toString('base64')}` })
    expect(request.mock.calls[0]![0]).toBe('/api/skin/Player')
    expect(encode).toHaveBeenCalledOnce()
    // Fetching a candidate never replaces the current skin; the caller validates/commits it.
    expect(store.currentSkin.value).toEqual(skin)
  })

  it('preserves server errors without loading the processor', async () => {
    const imported = vi.fn()
    vi.doMock('../engine/skin', () => { imported(); return { readSkinPng: vi.fn() } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Player unavailable' }), { status: 404 })))
    const store = await import('./skinStore')
    await expect(store.fetchSkinByUsername('Missing')).rejects.toThrow('Player unavailable')
    expect(imported).not.toHaveBeenCalled()
  })
})

describe('private account skin cache', () => {
  it('hides a cached account skin until the same account signs in', async () => {
    data.set('skin:current', JSON.stringify({ ...skin, accountId: 'owner-a' }))
    const store = await import('./skinStore')
    expect(store.currentSkin.value).toBeNull()
    store.syncAccountSkin('owner-a')
    expect(store.currentSkin.value?.label).toBe(skin.label)
  })

  it('clears a cached private image when another account signs in', async () => {
    data.set('skin:current', JSON.stringify({ ...skin, accountId: 'owner-a' }))
    const store = await import('./skinStore')
    store.syncAccountSkin('owner-b')
    expect(store.currentSkin.value).toBeNull()
    expect(data.get('skin:current')).toBe('null')
  })

  it('clears an open private image when the user signs out', async () => {
    const store = await import('./skinStore')
    store.setSkin({ ...skin, accountId: 'owner-a' })
    store.syncAccountSkin()
    expect(store.currentSkin.value).toBeNull()
    expect(data.get('skin:current')).toBe('null')
  })

  it('clears the matching private skin name from the recent-build card on sign-out', async () => {
    const store = await import('./skinStore')
    const { hashString } = await import('./storage')
    store.setSkin({ ...skin, accountId: 'owner-a' })
    data.set('progress:recent', JSON.stringify({
      title: skin.label, path: '/skin/guide?view=3d', step: 0, total: 10, skinHash: hashString(skin.dataUrl),
    }))
    store.syncAccountSkin()
    expect(data.get('progress:recent')).toBe('null')
  })

  it('preserves a local upload when the user signs out', async () => {
    const store = await import('./skinStore')
    store.setSkin(skin)
    store.syncAccountSkin()
    expect(store.currentSkin.value?.dataUrl).toBe(skin.dataUrl)
  })
})
