import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadForNewDeploy } from './recovery'

let data: Map<string, string>
const location = { assign: vi.fn(), reload: vi.fn() }
beforeEach(() => {
  data = new Map()
  location.assign.mockReset()
  location.reload.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
  vi.stubGlobal('window', { location })
})
afterEach(() => vi.unstubAllGlobals())

describe('stale deploy recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/assets/SkinView-abc.js',
    'error loading dynamically imported module: https://example.com/assets/x.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/CatalogView-abc.css',
  ])('recognizes a failed chunk load: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new Error('Could not load the catalog.'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })

  it('reloads once, then stops while the new version keeps failing', () => {
    expect(reloadForNewDeploy(undefined, 1_000_000)).toBe(true)
    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(reloadForNewDeploy('/skin', 1_005_000)).toBe(false)
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('recovers again from a later deploy and opens the intended page', () => {
    reloadForNewDeploy(undefined, 1_000_000)
    expect(reloadForNewDeploy('/item/rose?view=3d', 2_000_000)).toBe(true)
    expect(location.assign).toHaveBeenCalledWith('/item/rose?view=3d')
  })

  it('never reloads without session storage, so it cannot loop', () => {
    vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked') } })
    expect(reloadForNewDeploy()).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })
})
