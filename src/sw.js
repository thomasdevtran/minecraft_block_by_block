/*
 * Offline support for Block by Cube. Not bundled: vite.config.ts (offlineWorker) copies this file
 * to dist/sw.js at build time and fills in BUILD, STARTUP and ENABLED.
 *
 * What is kept, and for how long:
 * - The app itself (index.html, hashed code, fonts, the catalog) in one cache per deploy. The
 *   current and previous deploy are kept, so a tab opened before a deploy keeps working.
 * - The pictures and shape of each guide page a visitor opens, saved automatically, up to the
 *   MAX_GUIDES most recently opened. These files carry a content hash (?v=), so they never go stale.
 * Nothing tied to an account is cached: API calls and other sites always go to the network.
 */
const BUILD = '__BUILD__'
const STARTUP = [/* __STARTUP__ */]
/** false builds the kill switch: this worker deletes its caches and unregisters itself. */
const ENABLED = true

const PREFIX = 'bbc-'
const APP = `${PREFIX}app-${BUILD}`
const GUIDES = `${PREFIX}guides`
const META = `${PREFIX}meta`
const SHELL = '/'
const MAX_GUIDES = 30
/** Every cached file is the same for everyone, so a Vary header (e.g. Origin on module scripts) mustn't hide it. */
const ANY = { ignoreVary: true }
/** The guide pages whose files are saved for offline use. Query strings (2D/3D, look) share one entry. */
const GUIDE_PAGE = /^\/(?:item\/[^/]+|skin\/guide)\/?$/
/** Content-hashed static files: cache-first is safe because a change gives them a new URL. */
const TAGGED = /^\/(?:textures|data\/shapes|crafts)\//
/** Unhashed static files the app needs offline: network first, cached copy as the fallback. */
const REFRESHED = /^\/(?:data\/items\.json|fonts\/.+)$/

self.addEventListener('install', (event) => {
  self.skipWaiting()
  if (ENABLED) event.waitUntil(caches.open(APP).then((cache) => cache.addAll(STARTUP)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(ENABLED ? activate() : disable())
})

async function activate() {
  // Remember the last two deploys and delete the app caches of any older one.
  const meta = await caches.open(META)
  const stored = await meta.match('/builds')
  const previous = stored ? await stored.json() : []
  const builds = [BUILD, ...previous.filter((build) => build !== BUILD)].slice(0, 2)
  await meta.put('/builds', Response.json(builds))
  const keep = new Set([...builds.map((build) => `${PREFIX}app-${build}`), GUIDES, META])
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name)
  }
  await self.clients.claim()
}

/** Open tabs need no reload: this worker passes every request to the network until they close. */
async function disable() {
  for (const name of await caches.keys()) if (name.startsWith(PREFIX)) await caches.delete(name)
  await self.registration.unregister()
}

self.addEventListener('fetch', (event) => {
  if (!ENABLED) return
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(appFile(request))
  else if (TAGGED.test(url.pathname) && url.searchParams.has('v')) event.respondWith(guideFile(event, request))
  else if (REFRESHED.test(url.pathname)) event.respondWith(refreshed(request))
})

/** Pages: always the newest index.html when online, so deploys arrive as they do without a worker. */
async function page(request) {
  try {
    const response = await fetch(request)
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      const copy = response.clone()
      void caches.open(APP).then((cache) => cache.put(SHELL, copy))
    }
    return response
  } catch (error) {
    const shell = await caches.match(SHELL, { ...ANY, cacheName: APP }) ?? await caches.match(SHELL, ANY)
    if (shell) return shell
    throw error
  }
}

/** Hashed code: never changes, so the cache answers first. Every deploy's cache is searched. */
async function appFile(request) {
  const cached = await caches.match(request, ANY)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const copy = response.clone()
    void caches.open(APP).then((cache) => cache.put(request, copy))
  }
  return response
}

async function refreshed(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const copy = response.clone()
      void caches.open(APP).then((cache) => cache.put(request, copy))
    }
    return response
  } catch (error) {
    const cached = await caches.match(request, ANY)
    if (cached) return cached
    throw error
  }
}

/** A tagged picture or shape. Saved only when a guide page asked for it, not when the catalog did. */
async function guideFile(event, request) {
  const guide = guideKey((await self.clients.get(event.clientId))?.url)
  const cached = await caches.match(request, { ...ANY, cacheName: GUIDES })
  if (cached) {
    if (guide) event.waitUntil(remember(guide, [request.url]))
    return cached
  }
  const response = await fetch(request)
  if (guide && response.ok) {
    const copy = response.clone()
    event.waitUntil(remember(guide, [request.url], [copy]))
  }
  return response
}

function guideKey(pageUrl) {
  if (!pageUrl) return null
  const path = new URL(pageUrl).pathname
  return GUIDE_PAGE.test(path) ? path.replace(/\/$/, '') : null
}

// Index of saved guides, stored as JSON in the guide cache: { [page]: { at, urls } }.
// Updates run one after another so two files of one guide can't overwrite each other's entry.
let queue = Promise.resolve()
function remember(guide, urls, responses = []) {
  queue = queue.then(() => saveGuide(guide, urls, responses)).catch(() => {})
  return queue
}

async function saveGuide(guide, urls, responses) {
  const cache = await caches.open(GUIDES)
  await Promise.all(responses.map((response, i) => cache.put(urls[i], response)))
  const stored = await cache.match('/__guides')
  const index = stored ? await stored.json() : {}
  const entry = index[guide] ?? { at: 0, urls: [] }
  index[guide] = { at: Date.now(), urls: [...new Set([...entry.urls, ...urls])] }
  // Over the cap: drop the least recently opened guides and any file no kept guide uses.
  const kept = Object.entries(index).sort((a, b) => b[1].at - a[1].at)
  const dropped = kept.splice(MAX_GUIDES)
  const inUse = new Set(kept.flatMap(([, value]) => value.urls))
  for (const [, value] of dropped) {
    for (const url of value.urls) if (!inUse.has(url)) await cache.delete(url)
  }
  await cache.put('/__guides', Response.json(Object.fromEntries(kept)))
}

// The first visit loads files before this worker controls the page, so the page lists what it
// already loaded. Code goes in the app cache; a guide page's pictures and shape go in the guide cache.
self.addEventListener('message', (event) => {
  if (!ENABLED || event.data?.type !== 'warm' || !Array.isArray(event.data.urls)) return
  const guide = guideKey(event.source?.url)
  const urls = event.data.urls.filter((value) => typeof value === 'string').map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin)
  const code = urls.filter((url) => url.pathname.startsWith('/assets/') || REFRESHED.test(url.pathname)).map(String)
  const files = guide ? urls.filter((url) => TAGGED.test(url.pathname) && url.searchParams.has('v')).map(String) : []
  event.waitUntil(Promise.all([
    caches.open(APP).then((cache) => Promise.all(code.map((url) => cache.add(url).catch(() => {})))),
    files.length ? fetchAll(files).then((found) => found.length && remember(guide, found.map(([url]) => url), found.map(([, response]) => response))) : null,
  ]))
})

async function fetchAll(urls) {
  const found = await Promise.all(urls.map((url) => fetch(url).then((response) => response.ok ? [url, response] : null, () => null)))
  return found.filter(Boolean)
}
