import { finalizeModel, type BuildModel, type ColorOptions } from './model'
import { ALPHA_CUTOFF, getPixel, toHex, type PixelImage } from './pixels'
import type { Voxel } from './voxels'

/**
 * Turns a flat sprite into a one-cube-thick build. Each visible pixel becomes a cube,
 * and every face of that cube gets the pixel's color.
 * Row 0 of the image is the top of the build.
 */
export function itemToModel(img: PixelImage, options: ColorOptions): BuildModel {
  const raw: Voxel<string>[] = []
  for (let row = 0; row < img.height; row++) {
    for (let col = 0; col < img.width; col++) {
      const px = getPixel(img, col, row)
      if (px.a < ALPHA_CUTOFF) continue
      const hex = toHex(px)
      const y = img.height - 1 - row
      raw.push({
        x: col,
        y,
        z: 0,
        lx: col,
        ly: y,
        lz: 0,
        part: 'item',
        interior: false,
        faces: { top: hex, bottom: hex, front: hex, back: hex, left: hex, right: hex },
      })
    }
  }
  const parts = [{ id: 'item', name: 'Item', w: img.width, h: img.height, d: 1, origin: [0, 0, 0] as [number, number, number] }]
  return finalizeModel('item', raw, parts, options)
}
