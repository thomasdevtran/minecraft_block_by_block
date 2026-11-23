/**
 * Offline guides: registers the service worker built from src/sw.js (production builds only).
 * Guides a visitor opens are saved automatically; see the worker for what is kept and for how long.
 */
import { whenIdle } from './dom'

declare const __OFFLINE__: boolean

/** Cache names the worker uses; everything with this prefix belongs to it. */
const CACHE_PREFIX = 'bbc-'

export function startOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const workers = navigator.serviceWorker
  if (!__OFFLINE__) {
    // Kill switch build: stop using any worker this browser installed earlier.
    void workers.getRegistrations().then((all) => all.forEach((registration) => void registration.unregister())).catch(() => {})
    return
  }
  // A worker that starts controlling the page missed what the page already loaded: list it.
  workers.addEventListener('controllerchange', () => {
    workers.controller?.postMessage({ type: 'warm', urls: performance.getEntriesByType('resource').map((entry) => entry.name) })
  })
  whenIdle(() => void workers.register('/sw.js').catch(() => {}))
}

/** Deletes every offline copy kept by the worker. Resolves false when the browser refused. */
export async function clearOfflineCopies(): Promise<boolean> {
  if (typeof caches === 'undefined') return true
  try {
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX))
    await Promise.all(names.map((name) => caches.delete(name)))
    return true
  } catch { return false }
}
