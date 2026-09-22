import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBuildData, readStored } from './storage'
let data: Map<string, string>
beforeEach(() => {
  data = new Map()
  vi.stubGlobal('localStorage', {
    get length() { return data.size },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key),
  })
})
afterEach(() => vi.unstubAllGlobals())
describe('local build storage', () => {
  it.each(['null', '"bad"', '[]', '{"hollow":"wrong"}'])('recovers from a malformed preferences object: %s', (value) => {
    data.set('prefs:block', value)
    expect(readStored('prefs:block', { hollow: true })).toEqual({ hollow: true })
  })
  it('clears only build data while preserving consent and unrelated storage', () => {
    for (const key of ['prefs:block', 'progress:item:test', 'progress:recent', 'skin:current', 'privacy:visitor-count:v1', 'unrelated', 'appearance:theme']) data.set(key, 'true')
    expect(clearBuildData()).toBe(true)
    expect([...data.keys()]).toEqual(['privacy:visitor-count:v1', 'unrelated', 'appearance:theme'])
  })
  it('reports inaccessible storage instead of claiming deletion', () => {
    vi.stubGlobal('localStorage', { get length() { throw new Error('Storage blocked') } })
    expect(clearBuildData()).toBe(false)
  })
})
