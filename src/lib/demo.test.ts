import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem } from './catalog'
import type { PixelImage } from '../engine/pixels'
import type { BuildModel } from '../engine/model'

const sprite: PixelImage = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }
const front: PixelImage = { ...sprite, width: 2 }
const item: CatalogItem = { id: 'test', name: 'Test', category: 'item', texture: 'sprite.png' }
const block = { ...item, block: 'strip.png' }
const flower = { ...item, flower: { pottable: true } }
const model = (kind: BuildModel['kind']): BuildModel => ({ kind, voxels: [], palette: [], parts: [] })
let imported: string[]
let pixels: ReturnType<typeof vi.fn>
let flat: ReturnType<typeof vi.fn>
let cube: ReturnType<typeof vi.fn>
let plant: ReturnType<typeof vi.fn>
let skin: ReturnType<typeof vi.fn>
let project: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.resetModules()
  // As on the homepage, the catalog has loaded before any demo builds, so texture URLs carry its revision.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: '1', assetRevision: 'r1', groups: {}, pot: '', classicPot: '', classicVersion: '', items: [] }))))
  await (await import('./catalog')).loadCatalog()
  imported = []
  pixels = vi.fn().mockResolvedValue(sprite)
  flat = vi.fn().mockReturnValue(model('item'))
  cube = vi.fn().mockReturnValue(model('block'))
  plant = vi.fn().mockReturnValue(model('plant'))
  skin = vi.fn().mockReturnValue(model('skin'))
  project = vi.fn().mockReturnValue(front)
  vi.doMock('../engine/pixels', () => { imported.push('pixels'); return { loadPixels: pixels } })
  vi.doMock('../engine/item', () => { imported.push('item'); return { itemToModel: flat } })
  vi.doMock('../engine/block', () => { imported.push('block'); return { blockToModel: cube } })
  vi.doMock('../engine/flower', () => { imported.push('flower'); return { flowerToModel: plant } })
  vi.doMock('../engine/skin', () => { imported.push('skin'); return { skinFront: project, skinToModel: skin } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const path of ['../engine/pixels', '../engine/item', '../engine/block', '../engine/flower', '../engine/skin']) vi.doUnmock(path)
})

describe('optional homepage model loading', () => {
  it.each([
    [item, '2d', ['item', 'pixels'], '/sprite.png?v=r1', 'item'],
    [item, '3d', ['item', 'pixels'], '/sprite.png?v=r1', 'item'],
    [block, '2d', ['item', 'pixels'], '/sprite.png?v=r1', 'item'],
    [block, '3d', ['block', 'pixels'], '/strip.png?v=r1', 'block'],
    [flower, '2d', ['item', 'pixels'], '/sprite.png?v=r1', 'item'],
    [flower, '3d', ['flower', 'pixels'], '/sprite.png?v=r1', 'plant'],
    [undefined, '2d', ['item', 'pixels', 'skin'], '/steve.png', 'item'],
    [undefined, '3d', ['pixels', 'skin'], '/steve.png', 'skin'],
  ] as const)('loads only the generators for %j / %s', async (entry, mode, modules, path, kind) => {
    const { loadDemoModel } = await import('./demo')
    expect(imported).toEqual([]) // importing the homepage helper must not start optional work
    expect((await loadDemoModel(entry, mode, '/steve.png')).kind).toBe(kind)
    expect([...imported].sort()).toEqual([...modules].sort())
    expect(pixels).toHaveBeenCalledExactlyOnceWith(path)
    const called = [flat, cube, plant, skin].filter(fn => fn.mock.calls.length)
    expect(called).toHaveLength(1)
    const options = called[0]!.mock.calls[0]![1]
    expect(options.maxPaints).toBe(8)
    expect(options.simplePaint).toBe(kind !== 'item')
    if (kind === 'block' || kind === 'skin') expect(options.hollow).toBe(true)
    if (kind === 'plant') expect(options.pot).toBeNull()
    if (!entry && mode === '2d') expect(flat.mock.calls[0]![0]).toBe(front)
    if (!entry) expect((kind === 'skin' ? skin : project).mock.calls[0]![1]).toMatchObject({ model: 'classic', overlay: true, hollow: true })
  })

  it('keeps current-texture demo recipes independent of the catalog icon look', async () => {
    const { loadDemoModel } = await import('./demo')
    await loadDemoModel({ ...block, classic: { texture: 'old.png', block: 'old-strip.png' } }, '3d')
    expect(pixels).toHaveBeenCalledExactlyOnceWith('/strip.png?v=r1')
  })

  it('propagates an image failure and permits a later selection to try again', async () => {
    pixels.mockRejectedValueOnce(new Error('offline'))
    const { loadDemoModel } = await import('./demo')
    await expect(loadDemoModel(item, '2d')).rejects.toThrow('offline')
    expect(flat).not.toHaveBeenCalled()
    await expect(loadDemoModel(item, '2d')).resolves.toMatchObject({ kind: 'item' })
    expect(pixels).toHaveBeenCalledTimes(2)
  })
})
