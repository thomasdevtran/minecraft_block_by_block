/**
 * Runs work once the browser has nothing better to do.
 *
 * Safari only shipped `requestIdleCallback` in version 17, so the fallback matters. Keeping the
 * timing decisions in one place stops each call site inventing its own fallback delay.
 */

/** Long enough that the work still happens on a busy page, short enough that it isn't forgotten. */
const IDLE_TIMEOUT = 4000
/** Roughly when a normal page has finished its initial burst of work. */
const FALLBACK_DELAY = 1500

/** Schedules `fn` for the next idle moment. Returns a function that cancels it. */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(fn, FALLBACK_DELAY)
  return () => clearTimeout(id)
}
