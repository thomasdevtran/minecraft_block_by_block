import { ref } from 'vue'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

export const toasts = ref<Toast[]>([])
let nextId = 1

/**
 * Confirmations close on their own after this long. Errors stay until dismissed: they often hold
 * the only copy of something the reader needs, such as the Discord username when copying fails.
 */
export const SUCCESS_MS = 8000
/** After a pause, a nearly finished toast still gets this long, so it doesn't vanish the moment the pointer leaves. */
const RESUME_MIN_MS = 2000

const timers = new Map<number, { left: number; started: number; handle?: ReturnType<typeof setTimeout> }>()
let paused = false

function run(id: number) {
  const timer = timers.get(id)
  if (!timer || paused) return
  timer.started = Date.now()
  timer.handle = setTimeout(() => dismissToast(id), timer.left)
}

function forget(id: number) {
  clearTimeout(timers.get(id)?.handle)
  timers.delete(id)
}

/** Shows a short message in the corner. At most three are kept; the oldest goes first. */
export function showToast(message: string, kind: Toast['kind'] = 'success'): void {
  const id = nextId++
  const kept = toasts.value.slice(-2)
  for (const toast of toasts.value) if (!kept.includes(toast)) forget(toast.id)
  toasts.value = [...kept, { id, kind, message }]
  if (kind === 'success') {
    timers.set(id, { left: SUCCESS_MS, started: Date.now() })
    run(id)
  }
}

export function dismissToast(id: number): void {
  forget(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
  // Nothing left to hover or focus, so nothing should stay paused.
  if (!toasts.value.length) paused = false
}

/** Holds every countdown while the pointer or keyboard focus is on a toast (WCAG 2.2.1, Timing Adjustable). */
export function pauseToasts(): void {
  if (paused) return
  paused = true
  const now = Date.now()
  for (const timer of timers.values()) {
    clearTimeout(timer.handle)
    timer.handle = undefined
    timer.left -= now - timer.started
  }
}

export function resumeToasts(): void {
  if (!paused) return
  paused = false
  for (const [id, timer] of timers) {
    timer.left = Math.max(timer.left, RESUME_MIN_MS)
    run(id)
  }
}
