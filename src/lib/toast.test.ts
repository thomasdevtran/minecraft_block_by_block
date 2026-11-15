import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, pauseToasts, resumeToasts, showToast, SUCCESS_MS, toasts } from './toast'

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    resumeToasts()
    for (const toast of [...toasts.value]) dismissToast(toast.id)
    vi.useRealTimers()
  })

  it('closes confirmations on their own and keeps errors until dismissed', () => {
    showToast('Saved')
    showToast('Failed', 'error')
    vi.advanceTimersByTime(SUCCESS_MS)
    expect(toasts.value.map((t) => t.message)).toEqual(['Failed'])
    vi.advanceTimersByTime(60_000)
    expect(toasts.value).toHaveLength(1)
  })

  it('holds the countdown while paused and resumes with time to spare', () => {
    showToast('Copied')
    vi.advanceTimersByTime(SUCCESS_MS - 100)
    pauseToasts()
    vi.advanceTimersByTime(60_000)
    expect(toasts.value).toHaveLength(1)
    resumeToasts()
    vi.advanceTimersByTime(1_000)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    expect(toasts.value).toHaveLength(0)
  })

  it('keeps the newest three and stops timers for the ones it drops', () => {
    for (const message of ['a', 'b', 'c', 'd']) showToast(message)
    expect(toasts.value.map((t) => t.message)).toEqual(['b', 'c', 'd'])
    vi.advanceTimersByTime(SUCCESS_MS)
    expect(toasts.value).toHaveLength(0)
  })

  it('clears the pause once the last toast is gone', () => {
    showToast('First')
    pauseToasts()
    dismissToast(toasts.value[0]!.id)
    showToast('Second')
    vi.advanceTimersByTime(SUCCESS_MS)
    expect(toasts.value).toHaveLength(0)
  })
})
