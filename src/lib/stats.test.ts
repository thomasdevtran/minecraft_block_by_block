import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const idle = vi.hoisted(() => [] as (() => void)[])
vi.mock('./schedule', () => ({ whenIdle: (fn: () => void) => idle.push(fn) }))
beforeEach(() => {
  vi.resetModules()
  idle.length = 0
  vi.stubGlobal('navigator', { webdriver: false, doNotTrack: null })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})
afterEach(() => vi.unstubAllGlobals())
describe('count consent', () => {
  it('sends nothing without a choice or after declining', async () => {
    const stats = await import('./stats')
    stats.countVisit()
    stats.setVisitorChoice('deny')
    idle.forEach((fn) => fn())
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sends once after allowing and ignores duplicate idle scheduling', async () => {
    const stats = await import('./stats')
    stats.setVisitorChoice('allow')
    stats.countVisit()
    idle.forEach((fn) => fn())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/stats', expect.objectContaining({ headers: { 'X-Visitor-Consent': 'granted' } }))
  })
  it('withdrawal cancels a queued count', async () => {
    const stats = await import('./stats')
    stats.setVisitorChoice('allow')
    stats.setVisitorChoice('deny')
    idle.forEach((fn) => fn())
    expect(fetch).not.toHaveBeenCalled()
  })
  it('respects Global Privacy Control even with an allow choice', async () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true })
    const stats = await import('./stats')
    stats.setVisitorChoice('allow')
    idle.forEach((fn) => fn())
    expect(fetch).not.toHaveBeenCalled()
  })
})
