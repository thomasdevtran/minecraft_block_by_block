import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const skin = { label: 'Private skin', model: 'classic' as const, dataUrl: 'data:image/png;base64,dGVzdA==' }
let data: Map<string, string>
beforeEach(() => {
  vi.resetModules()
  data = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('private account skin cache', () => {
  it('hides a cached account skin until the same account signs in', async () => {
    data.set('skin:current', JSON.stringify({ ...skin, accountId: 'owner-a' }))
    const store = await import('./skinStore')
    expect(store.currentSkin.value).toBeNull()
    store.syncAccountSkin('owner-a')
    expect(store.currentSkin.value?.label).toBe(skin.label)
  })

  it('clears a cached private image when another account signs in', async () => {
    data.set('skin:current', JSON.stringify({ ...skin, accountId: 'owner-a' }))
    const store = await import('./skinStore')
    store.syncAccountSkin('owner-b')
    expect(store.currentSkin.value).toBeNull()
    expect(data.get('skin:current')).toBe('null')
  })

  it('clears an open private image when the user signs out', async () => {
    const store = await import('./skinStore')
    store.setSkin({ ...skin, accountId: 'owner-a' })
    store.syncAccountSkin()
    expect(store.currentSkin.value).toBeNull()
    expect(data.get('skin:current')).toBe('null')
  })

  it('clears the matching private skin name from the recent-build card on sign-out', async () => {
    const store = await import('./skinStore')
    const { hashString } = await import('./storage')
    store.setSkin({ ...skin, accountId: 'owner-a' })
    data.set('progress:recent', JSON.stringify({
      title: skin.label, path: '/skin/guide?view=3d', step: 0, total: 10, skinHash: hashString(skin.dataUrl),
    }))
    store.syncAccountSkin()
    expect(data.get('progress:recent')).toBe('null')
  })

  it('preserves a local upload when the user signs out', async () => {
    const store = await import('./skinStore')
    store.setSkin(skin)
    store.syncAccountSkin()
    expect(store.currentSkin.value?.dataUrl).toBe(skin.dataUrl)
  })
})
