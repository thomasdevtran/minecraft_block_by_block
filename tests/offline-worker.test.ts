/** Runs src/sw.js in a fake service-worker global with in-memory Cache Storage and network. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { workerSource } from '../vite.config.ts'

const ORIGIN = 'https://blockbycube.com'
const TEMPLATE = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8')
const STARTUP = ['/', '/assets/index-a.js']

const keyOf = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href

class FakeCache {
  entries = new Map<string, Response>()
  async match(request: string | Request) { return this.entries.get(keyOf(request))?.clone() }
  async put(request: string | Request, response: Response) { this.entries.set(keyOf(request), response) }
  async delete(request: string | Request) { return this.entries.delete(keyOf(request)) }
  async add(request: string) { const response = await network.fetch(keyOf(request)); await this.put(request, response) }
  async addAll(requests: string[]) { for (const request of requests) await this.add(request) }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>()
  async open(name: string) { if (!this.stores.has(name)) this.stores.set(name, new FakeCache()); return this.stores.get(name)! }
  async keys() { return [...this.stores.keys()] }
  async delete(name: string) { return this.stores.delete(name) }
  async match(request: string | Request, options: { cacheName?: string } = {}) {
    const names = options.cacheName ? [options.cacheName] : [...this.stores.keys()]
    for (const name of names) {
      const hit = await this.stores.get(name)?.match(request)
      if (hit) return hit
    }
    return undefined
  }
  urls(name: string) { return [...(this.stores.get(name)?.entries.keys() ?? [])].map((url) => url.replace(ORIGIN, '')) }
}

/** The network: every request succeeds with its own URL as the body, unless offline. */
const network = {
  online: true,
  requests: [] as string[],
  async fetch(input: string | Request) {
    const url = keyOf(input)
    network.requests.push(url.replace(ORIGIN, ''))
    if (!network.online) throw new TypeError('Failed to fetch')
    const html = !/\.\w+(\?|$)/.test(new URL(url).pathname)
    return new Response(url, { headers: { 'content-type': html ? 'text/html' : 'application/octet-stream' } })
  },
}

function worker(caches: FakeCacheStorage, { build = 'b1', enabled = true, pages = {} as Record<string, string> } = {}) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const state = { claimed: false, unregistered: false }
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler },
    skipWaiting: () => {},
    clients: {
      get: async (id: string) => pages[id] ? { url: ORIGIN + pages[id] } : undefined,
      claim: async () => { state.claimed = true },
    },
    registration: { unregister: async () => { state.unregistered = true } },
  }
  runInNewContext(workerSource(TEMPLATE, build, STARTUP, enabled), { self, caches, fetch: network.fetch, Response, URL, Promise, console })

  async function lifecycle(type: string, extra: object = {}) {
    const pending: Promise<unknown>[] = []
    handlers[type]!({ waitUntil: (promise: Promise<unknown>) => pending.push(promise), ...extra })
    await Promise.all(pending)
  }
  return {
    state,
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    message: (data: unknown, page: string) => lifecycle('message', { data, source: { url: ORIGIN + page } }),
    /** Returns the response, or null when the worker left the request to the browser. */
    async request(path: string, { mode = 'cors', client = '', method = 'GET' } = {}) {
      let answer: Promise<Response> | null = null
      const pending: Promise<unknown>[] = []
      const request = new Request(new URL(path, ORIGIN), { method })
      Object.defineProperty(request, 'mode', { value: mode })
      handlers.fetch!({ request, clientId: client, respondWith: (response: Promise<Response>) => { answer = response }, waitUntil: (promise: Promise<unknown>) => pending.push(promise) })
      if (!answer) return null
      const response = await answer
      await Promise.all(pending)
      await new Promise((resolve) => setTimeout(resolve, 0))
      return response
    },
  }
}

async function installed(caches = new FakeCacheStorage(), options: Parameters<typeof worker>[1] = {}) {
  const sw = worker(caches, options)
  await sw.install()
  await sw.activate()
  return sw
}

const text = (response: Response | null) => response!.text()

describe('offline worker', () => {
  it('saves the app shell and startup code on install, then controls open pages', async () => {
    const caches = new FakeCacheStorage()
    const sw = await installed(caches)
    expect(caches.urls('bbc-app-b1')).toEqual(STARTUP)
    expect(sw.state.claimed).toBe(true)
  })

  it('always fetches pages first, and serves the saved shell only when offline', async () => {
    network.online = true
    const caches = new FakeCacheStorage()
    const sw = await installed(caches)
    expect(await text(await sw.request('/item/rose', { mode: 'navigate' }))).toBe(`${ORIGIN}/item/rose`)
    network.online = false
    expect(await text(await sw.request('/item/torch', { mode: 'navigate' }))).toBe(`${ORIGIN}/item/rose`)
    network.online = true
  })

  it('saves a guide page’s tagged files and serves them offline', async () => {
    const caches = new FakeCacheStorage()
    const sw = await installed(caches, { pages: { guide: '/item/rose', home: '/' } })
    await sw.request('/textures/items/rose.png?v=r1', { client: 'guide' })
    await sw.request('/textures/items/torch.png?v=r1', { client: 'home' })
    expect(caches.urls('bbc-guides')).toEqual(['/textures/items/rose.png?v=r1', '/__guides'])
    network.online = false
    expect(await text(await sw.request('/textures/items/rose.png?v=r1', { client: 'guide' }))).toContain('rose.png')
    await expect(sw.request('/textures/items/torch.png?v=r1', { client: 'home' })).rejects.toThrow('Failed to fetch')
    network.online = true
  })

  it('keeps the 30 most recently opened guides and only the files they use', async () => {
    const caches = new FakeCacheStorage()
    const pages = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`g${i}`, `/item/i${i}`]))
    const sw = await installed(caches, { pages })
    await sw.request('/textures/pot.png?v=r1', { client: 'g0' })
    await sw.request('/textures/items/i0.png?v=r1', { client: 'g0' })
    for (let i = 1; i <= 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      await sw.request(`/textures/items/i${i}.png?v=r1`, { client: `g${i}` })
      if (i === 1) await sw.request('/textures/pot.png?v=r1', { client: 'g1' })
    }
    const kept = caches.urls('bbc-guides')
    expect(kept).not.toContain('/textures/items/i0.png?v=r1')
    expect(kept).toContain('/textures/pot.png?v=r1')
    expect(kept).toContain('/textures/items/i30.png?v=r1')
    const index = await (await caches.match('/__guides', { cacheName: 'bbc-guides' }))!.json() as Record<string, unknown>
    expect(Object.keys(index)).toHaveLength(30)
    expect(index['/item/i0']).toBeUndefined()
  })

  it('keeps the current and previous deploy’s code, and saved guides, across deploys', async () => {
    const caches = new FakeCacheStorage()
    const first = await installed(caches, { build: 'b1', pages: { guide: '/item/rose' } })
    await first.request('/textures/items/rose.png?v=r1', { client: 'guide' })
    await installed(caches, { build: 'b2' })
    expect(await caches.keys()).toEqual(expect.arrayContaining(['bbc-app-b1', 'bbc-app-b2', 'bbc-guides']))
    const third = await installed(caches, { build: 'b3' })
    expect((await caches.keys()).filter((name) => name.startsWith('bbc-app-')).sort()).toEqual(['bbc-app-b2', 'bbc-app-b3'])
    network.online = false
    // A tab still on the previous deploy keeps getting its code.
    await caches.open('bbc-app-b2').then((cache) => cache.put('/assets/old.js', new Response('old')))
    expect(await text(await third.request('/assets/old.js'))).toBe('old')
    network.online = true
  })

  it('leaves API calls, other sites, writes and untagged files to the browser', async () => {
    const sw = await installed()
    expect(await sw.request('/api/skin/Notch')).toBeNull()
    expect(await sw.request('https://cofbtfabojhjddgrbrea.supabase.co/rest/v1/x')).toBeNull()
    expect(await sw.request('/api/stats', { method: 'POST' })).toBeNull()
    expect(await sw.request('/textures/items/rose.png')).toBeNull()
  })

  it('serves the catalog fresh when online and from the cache when offline', async () => {
    const caches = new FakeCacheStorage()
    const sw = await installed(caches)
    network.requests = []
    await sw.request('/data/items.json')
    expect(network.requests).toEqual(['/data/items.json'])
    network.online = false
    expect(await text(await sw.request('/data/items.json'))).toBe(`${ORIGIN}/data/items.json`)
    network.online = true
  })

  it('saves what a page loaded before the worker took over', async () => {
    const caches = new FakeCacheStorage()
    const sw = await installed(caches)
    const urls = [`${ORIGIN}/assets/ItemGuideView-x.js`, `${ORIGIN}/textures/items/rose.png?v=r1`, 'https://example.com/x.js']
    await sw.message({ type: 'warm', urls }, '/item/rose')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(caches.urls('bbc-app-b1')).toContain('/assets/ItemGuideView-x.js')
    expect(caches.urls('bbc-guides')).toContain('/textures/items/rose.png?v=r1')
    await sw.message({ type: 'warm', urls: [`${ORIGIN}/textures/items/torch.png?v=r1`] }, '/')
    expect(caches.urls('bbc-guides')).not.toContain('/textures/items/torch.png?v=r1')
  })

  it('kill switch deletes every cache, unregisters and passes requests to the network', async () => {
    const caches = new FakeCacheStorage()
    await installed(caches, { pages: { guide: '/item/rose' } })
    await caches.open('unrelated')
    const off = await installed(caches, { build: 'b2', enabled: false, pages: { guide: '/item/rose' } })
    expect(await caches.keys()).toEqual(['unrelated'])
    expect(off.state.unregistered).toBe(true)
    expect(await off.request('/assets/index-a.js')).toBeNull()
  })

  it('is served as itself on Vercel, revalidated on every check, and allowed by the CSP', () => {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: { source: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[]
    }
    const spa = new RegExp(`^${config.rewrites[0]!.source}$`)
    expect(spa.test('/sw.js')).toBe(false)
    expect(spa.test('/item/rose')).toBe(true)
    // No rule may give the worker a long cache, or browsers would notice new deploys late.
    expect(config.headers.filter((rule) => new RegExp(`^${rule.source}$`).test('/sw.js'))
      .flatMap((rule) => rule.headers).some((header) => header.key === 'Cache-Control')).toBe(false)
    const csp = config.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy')!.value
    expect(csp).toMatch(/script-src 'self'/)
    expect(csp).not.toMatch(/worker-src/)
  })

  it('refuses a template whose placeholders changed', () => {
    expect(() => workerSource('const BUILD = 1', 'b', [], true)).toThrow('placeholders changed')
  })
})
