import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPixels, type PixelImage } from '../engine/pixels'
import { createGuideResources, guideResourceUrls, type GuideResourceUrls } from './guideResources'
import { loadCatalog, type BuildableItem } from './catalog'

vi.mock('../engine/pixels', () => ({ loadPixels: vi.fn() }))
const sprite: PixelImage = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }
const shape = { size: [1, 1, 1], palette: ['#ff0000'], cubes: [[0, 0, 0, 0, 0, 0, 0, 0, 0]] }
const base: BuildableItem = { id: 'test', name: 'Test', texture: 'sprite.png' }
const block = { ...base, block: 'strip.png', classic: { texture: 'old-sprite.png', block: 'old-strip.png' } }
const flower = { ...base, flower: { pottable: true } }
const craft = { ...base, shape: 'shape.json' }
const urls = (overrides: Partial<GuideResourceUrls> = {}): GuideResourceUrls => ({ sprite: null, block: null, pot: null, shape: null, ...overrides })
const plan = (item: BuildableItem, view: '2d' | '3d', potted = false, look: 'current' | 'classic' = 'current') =>
  guideResourceUrls(item, { view, look, potted, potUrl: '/pot.png' })
// Guides open after the catalog has loaded, so their texture and shape URLs carry its revision.
beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '1', assetRevision: 'r1', groups: {}, pot: '', classicPot: '', classicVersion: '', items: [] }))))
  await loadCatalog()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadPixels).mockReset().mockResolvedValue(sprite)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => shape }))
})
afterEach(() => vi.unstubAllGlobals())

describe('selected guide resources', () => {
  it.each([
    [base, '2d', false, urls({ sprite: '/sprite.png?v=r1' })],
    [block, '2d', false, urls({ sprite: '/sprite.png?v=r1' })],
    [block, '3d', false, urls({ block: '/strip.png?v=r1' })],
    [flower, '2d', false, urls({ sprite: '/sprite.png?v=r1' })],
    [flower, '3d', false, urls({ sprite: '/sprite.png?v=r1' })],
    [flower, '2d', true, urls({ sprite: '/sprite.png?v=r1', pot: '/pot.png' })],
    [flower, '3d', true, urls({ sprite: '/sprite.png?v=r1', pot: '/pot.png' })],
    [craft, '2d', false, urls({ sprite: '/sprite.png?v=r1' })],
    [craft, '3d', false, urls({ shape: '/shape.json?v=r1' })],
  ] as const)('loads the inputs for %j / %s / pot=%s', async (item, view, potted, expected) => {
    const selected = plan(item, view, potted)
    expect(selected).toEqual(expected)
    await createGuideResources().load(selected)
    expect(vi.mocked(loadPixels).mock.calls.map(call => call[0])).toEqual([expected.sprite, expected.block, expected.pot].filter(Boolean))
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual(expected.shape ? [expected.shape] : [])
  })

  it('uses the effective classic texture, including a current-strip fallback', () => {
    expect(plan(block, '2d', false, 'classic').sprite).toBe('/old-sprite.png?v=r1')
    expect(plan(block, '3d', false, 'classic').block).toBe('/old-strip.png?v=r1')
    expect(plan({ ...block, classic: { texture: 'old-sprite.png' } }, '3d', false, 'classic').block).toBe('/strip.png?v=r1')
    expect(plan(base, '2d', false, 'classic').sprite).toBe('/sprite.png?v=r1')
    expect(plan({ ...base, flower: { pottable: false } }, '3d', true).pot).toBeNull()
  })

  it('shares in-flight and successful pixels across setting changes', async () => {
    const store = createGuideResources()
    const a = store.load(plan(flower, '2d'))
    const b = store.load(plan(flower, '3d', true))
    const [flat, potted] = await Promise.all([a, b])
    expect(flat.sprite).toBe(potted.sprite)
    expect(loadPixels).toHaveBeenCalledTimes(2) // sprite and pot, not the sprite twice
    await store.load(plan(flower, '2d'))
    await store.load(plan(flower, '3d', true))
    expect(loadPixels).toHaveBeenCalledTimes(2)
  })

  it('keys reusable inputs by the full versioned URL and clears them for a new item', async () => {
    const store = createGuideResources()
    await store.load(urls({ sprite: '/sprite.png?v=1' }))
    await store.load(urls({ sprite: '/sprite.png?v=2' }))
    store.clear()
    await store.load(urls({ sprite: '/sprite.png?v=2' }))
    expect(loadPixels).toHaveBeenCalledTimes(3)
  })

  it('retries failed images while retaining the successfully loaded inputs', async () => {
    vi.mocked(loadPixels).mockImplementation(async url => {
      if (url === '/pot.png' && vi.mocked(loadPixels).mock.calls.length === 2) throw new Error('offline')
      return sprite
    })
    const store = createGuideResources()
    await expect(store.load(plan(flower, '3d', true))).rejects.toThrow('offline')
    await expect(store.load(plan(flower, '3d', true))).resolves.toMatchObject({ sprite, pot: sprite })
    expect(vi.mocked(loadPixels).mock.calls.map(call => call[0])).toEqual(['/sprite.png?v=r1', '/pot.png', '/pot.png'])
  })

  it('validates shape JSON before reuse, and retries network and validation failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...shape, cubes: [] }) } as Response)
    const store = createGuideResources()
    await expect(store.load(plan(craft, '3d'))).rejects.toThrow('could not be loaded')
    await expect(store.load(plan(craft, '3d'))).rejects.toThrow('Invalid build shape')
    await expect(store.load(plan(craft, '3d'))).resolves.toMatchObject({ shape })
    await store.load(plan(craft, '3d'))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(loadPixels).not.toHaveBeenCalled()
  })

  it('does not let an old failure evict a fresh request after the guide is cleared', async () => {
    let rejectOld!: (reason: Error) => void
    vi.mocked(loadPixels).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
    const store = createGuideResources()
    const old = store.load(plan(base, '2d'))
    const oldFailure = expect(old).rejects.toThrow('old request')
    store.clear()
    await store.load(plan(base, '2d'))
    rejectOld(new Error('old request'))
    await oldFailure
    await store.load(plan(base, '2d'))
    expect(loadPixels).toHaveBeenCalledTimes(2)
  })
})
