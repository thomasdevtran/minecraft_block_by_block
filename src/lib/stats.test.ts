import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('navigator', { webdriver: false, doNotTrack: null })
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})
afterEach(() => vi.unstubAllGlobals())

describe('automatic page visits', () => {
  it('counts immediately without a choice, cookies or local storage', async () => {
    const stats = await import('./stats')
    stats.countVisit()
    expect(fetch).toHaveBeenCalledWith('/api/stats', {
      method: 'POST', credentials: 'omit', keepalive: true,
    })
    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
  it('counts once per page load, and again on a new load', async () => {
    const stats = await import('./stats')
    stats.countVisit()
    stats.countVisit()
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.resetModules()
    const nextPage = await import('./stats')
    nextPage.countVisit()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each([{ globalPrivacyControl: true }, { doNotTrack: '1' }, { webdriver: true }])(
    'skips privacy signals and browser automation: %j', async (navigatorValue) => {
      vi.stubGlobal('navigator', navigatorValue)
      const stats = await import('./stats')
      stats.countVisit()
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('contains network failures without retrying and double counting', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    const stats = await import('./stats')
    stats.countVisit()
    await Promise.resolve()
    stats.countVisit()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
