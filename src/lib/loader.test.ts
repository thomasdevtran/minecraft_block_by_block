import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './loader'

afterEach(() => vi.unstubAllGlobals())

const ok = (body: unknown) => ({ ok: true, json: async () => body })

describe('loader', () => {
  it('shares one request between callers', async () => {
    const fetch = vi.fn(async () => ok({ items: 1 }))
    vi.stubGlobal('fetch', fetch)
    const load = loader<{ items: number }>('/data/items.json', 'Could not load.')
    const [a, b] = await Promise.all([load(), load()])
    expect(a).toEqual({ items: 1 })
    expect(b).toBe(a)
    await load()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed response instead of caching the failure', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(ok('second'))
    vi.stubGlobal('fetch', fetch)
    const load = loader<string>('/data/items.json', 'Could not load the catalog.')
    await expect(load()).rejects.toThrow('Could not load the catalog.')
    await expect(load()).resolves.toBe('second')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries after a network error', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok(3))
    vi.stubGlobal('fetch', fetch)
    const load = loader<number>('/x.json', 'Could not load.')
    await expect(load()).rejects.toThrow('offline')
    await expect(load()).resolves.toBe(3)
  })
})
