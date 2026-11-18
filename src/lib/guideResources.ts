import { loadPixels, type PixelImage } from '../engine/pixels'
import { validateShape, type ShapeData } from '../engine/shapeData'
import { assetUrl, blockUrl, textureUrl, type BuildableItem } from './catalog'
import type { Look } from './buildSettings'

export interface GuideResourceUrls {
  sprite: string | null
  block: string | null
  pot: string | null
  shape: string | null
}

/** Pixel inputs for the selected model. Header images remain ordinary browser images. */
export function guideResourceUrls(item: BuildableItem, settings: {
  view: '2d' | '3d'; look: Look; potted: boolean; potUrl: string
}): GuideResourceUrls {
  const shape = settings.view === '3d' && !item.flower && !!item.shape
  const block = settings.view === '3d' && !item.flower && !shape && !!item.block
  return {
    sprite: shape || block ? null : textureUrl(item, settings.look),
    block: block ? blockUrl(item, settings.look) : null,
    pot: settings.potted && item.flower?.pottable ? settings.potUrl : null,
    shape: shape ? assetUrl(item.shape!) : null,
  }
}

/** One guide's resources, shared across setting changes and discarded on item change/unmount. */
export function createGuideResources() {
  const images = new Map<string, Promise<PixelImage>>()
  const shapes = new Map<string, Promise<ShapeData>>()
  function cached<T>(cache: Map<string, Promise<T>>, url: string | null, load: (url: string) => Promise<T>): Promise<T | null> {
    if (!url) return Promise.resolve(null)
    let pending = cache.get(url)
    if (!pending) {
      pending = load(url)
      cache.set(url, pending)
      const request = pending
      void pending.catch(() => {
        // A failed old request must not delete a fresh request created after clear().
        if (cache.get(url) === request) cache.delete(url)
      })
    }
    return pending
  }
  async function loadShape(url: string): Promise<ShapeData> {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Build shape could not be loaded.')
    const data: unknown = await response.json()
    validateShape(data)
    return data
  }
  return {
    async load(urls: GuideResourceUrls) {
      const [sprite, block, pot, shape] = await Promise.all([
        cached(images, urls.sprite, loadPixels), cached(images, urls.block, loadPixels),
        cached(images, urls.pot, loadPixels), cached(shapes, urls.shape, loadShape),
      ])
      return { sprite, block, pot, shape }
    },
    clear() { images.clear(); shapes.clear() },
  }
}
