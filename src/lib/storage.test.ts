import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flag, paintLimit } from './buildSettings'
import { clearBuildData, readRecentBuild, readStored } from './storage'
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
describe('saved build links', () => {
  const valid = { title: 'Apple', path: '/item/apple?paints=8&look=current', step: 3, total: 20 }
  const read = (value: unknown) => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(value) })
    return readRecentBuild()
  }
  it('preserves exact build settings and progress', () => expect(read(valid)).toEqual(valid))
  it.each([null, [], { ...valid, path: '//example.com' }, { ...valid, path: '/other' }, { ...valid, step: 21 }, { ...valid, step: 1.5 }, { ...valid, skinHash: {} }])('ignores malformed or external records', value => {
    expect(read(value)).toBeNull()
  })
  it('bounds linked paint settings and accepts only explicit flags', () => {
    for (const value of ['0', '33', '1e1', [], 'NaN', '8.1']) expect(paintLimit(value, 12)).toBe(12)
    expect(paintLimit('8', 12)).toBe(8)
    expect(flag('0', true)).toBe(false)
    expect(flag('1', false)).toBe(true)
    expect(flag('false', true)).toBe(true)
  })
})
