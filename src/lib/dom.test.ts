import { describe, expect, it, vi } from 'vitest'
import { usePageFocus } from './dom'

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
