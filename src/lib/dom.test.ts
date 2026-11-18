import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePageFocus, whenIdle } from './dom'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('whenIdle', () => {
  it('cancels the browser idle callback with its returned handle', () => {
    const callbacks = new Map<number, () => void>()
    const schedule = vi.fn((fn: () => void) => { callbacks.set(42, fn); return 42 })
    const cancel = vi.fn((id: number) => callbacks.delete(id))
    vi.stubGlobal('requestIdleCallback', schedule)
    vi.stubGlobal('cancelIdleCallback', cancel)
    const work = vi.fn()
    const stop = whenIdle(work)
    expect(schedule).toHaveBeenCalledWith(work, { timeout: 4000 })
    stop()
    for (const callback of callbacks.values()) callback()
    expect(cancel).toHaveBeenCalledWith(42)
    expect(work).not.toHaveBeenCalled()
  })

  it('runs fallback work once after the delay and cancels unneeded work', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const work = vi.fn()
    const cancelled = vi.fn()
    whenIdle(work)
    whenIdle(cancelled)()
    vi.advanceTimersByTime(1499)
    expect(work).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(work).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(work).toHaveBeenCalledTimes(1)
    expect(cancelled).not.toHaveBeenCalled()
  })
})

/** Just enough of an element for the helper; the suite runs without a DOM. */
function fakeElement(tabindex?: string) {
  const attributes = new Map(tabindex === undefined ? [] : [['tabindex', tabindex]])
  return {
    tabIndex: tabindex === undefined ? 0 : Number(tabindex),
    hasAttribute: (name: string) => attributes.has(name),
    focus: vi.fn(),
  } as unknown as HTMLElement & { focus: ReturnType<typeof vi.fn> }
}

describe('usePageFocus', () => {
  it('does nothing unless a page turn asked for it', async () => {
    const list = fakeElement()
    const focus = usePageFocus(() => [list])
    await focus.settle()
    expect(list.focus).not.toHaveBeenCalled()
  })

  it('focuses the first target that exists, once per request', async () => {
    const message = fakeElement()
    const focus = usePageFocus(() => [undefined, null, message])
    focus.request()
    await focus.settle()
    await focus.settle()
    expect(message.focus).toHaveBeenCalledTimes(1)
    expect(message.tabIndex).toBe(-1)
  })

  it('keeps an element that is already focusable as it is', async () => {
    const list = fakeElement('0')
    const focus = usePageFocus(() => [list])
    focus.request()
    await focus.settle()
    expect(list.tabIndex).toBe(0)
  })
})
