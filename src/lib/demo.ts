import type { BuildModel } from '../engine/model'
import { assetUrl, blockUrl, textureUrl, type CatalogItem } from './catalog'
import { starterPaintLimit } from './site'

/** Optional homepage work: import only the generators required for this selected model. */
export async function loadDemoModel(item: CatalogItem | undefined, mode: '2d' | '3d', skinUrl?: string): Promise<BuildModel> {
  const colors = { maxPaints: starterPaintLimit }
  if (!item) {
    const [{ loadPixels }, { skinFront, skinToModel }, flat] = await Promise.all([
      import('../engine/pixels'), import('../engine/skin'), mode === '2d' ? import('../engine/item') : null,
    ])
    const skin = await loadPixels(skinUrl ?? assetUrl('textures/steve.png'))
    const options = { model: 'classic' as const, overlay: true, hollow: true, simplePaint: true, ...colors }
    return mode === '3d' ? skinToModel(skin, options)
      : flat!.itemToModel(skinFront(skin, options), { ...colors, simplePaint: false })
  }
  if (mode === '3d' && item.flower) {
    const [{ loadPixels }, { flowerToModel }] = await Promise.all([import('../engine/pixels'), import('../engine/flower')])
    return flowerToModel(await loadPixels(textureUrl(item, 'current')), { ...colors, simplePaint: true, pot: null })
  }
  if (mode === '3d' && item.block) {
    const [{ loadPixels }, { blockToModel }] = await Promise.all([import('../engine/pixels'), import('../engine/block')])
    return blockToModel(await loadPixels(blockUrl(item, 'current')!), { ...colors, simplePaint: true, hollow: true })
  }
  const [{ loadPixels }, { itemToModel }] = await Promise.all([import('../engine/pixels'), import('../engine/item')])
  return itemToModel(await loadPixels(textureUrl(item, 'current')), { ...colors, simplePaint: false })
}
