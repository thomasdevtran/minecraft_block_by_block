/**
 * Recovery from stale code after a deploy.
 *
 * Vite gives every chunk a content hash, and a deploy removes the old ones. A tab that stayed open
 * across a deploy still asks for the old hashes, gets 404s, and the navigation dies silently.
 * Loading the page again fetches the new index.html and its new chunk names.
 */

const RELOAD_KEY = 'recovery:reloaded-at'
/** A second failure this soon after reloading means the deploy itself is broken, so stop. */
const RELOAD_COOLDOWN_MS = 10_000

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

/** Whether `error` is a failed lazy chunk load (wording differs between Chrome, Firefox and Safari). */
export function isChunkLoadError(error: unknown): boolean {
  return CHUNK_ERROR.test(error instanceof Error ? error.message : String(error))
}

/**
 * Reloads the page (or opens `target`) unless that already happened in the last few seconds.
 * Returns whether it reloaded. Without session storage it never reloads, so it can't loop.
 */
export function reloadForNewDeploy(target?: string, now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY))
    if (last && now - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    return false
  }
  if (target) window.location.assign(target)
  else window.location.reload()
  return true
}
