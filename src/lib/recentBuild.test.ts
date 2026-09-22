import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRecentBuild } from './recentBuild'
import { flag, paintLimit } from './buildSettings'

afterEach(() => vi.unstubAllGlobals())
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
