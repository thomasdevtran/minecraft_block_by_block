import { finalizeModel, type BuildModel, type ColorOptions } from './model'
import { getPixel, toHex, type PixelImage } from './pixels'
import { emptyFaces, faceTexel, FACES, type Face, type Voxel } from './voxels'

/** Face order of the strip written by `npm run extract`: six square textures side by side. */
export const BLOCK_STRIP_ORDER: readonly Face[] = ['top', 'bottom', 'front', 'back', 'left', 'right']

export interface BlockOptions extends ColorOptions {
  /** Only build the outer shell of the cube. */
  hollow: boolean
}

/** Turns a face strip into a full cube: 16×16×16 cubes for a normal block, one cube per texture pixel. */
export function blockToModel(strip: PixelImage, options: BlockOptions): BuildModel {
  const size = strip.height
  if (strip.width !== size * BLOCK_STRIP_ORDER.length) {
    throw new Error(`Block textures must be a ${size * 6}×${size} strip of six faces.`)
  }
  const faceOffset = Object.fromEntries(BLOCK_STRIP_ORDER.map((f, i) => [f, i * size])) as Record<Face, number>

  const raw: Voxel<string>[] = []
  for (let ly = 0; ly < size; ly++) {
    for (let lz = 0; lz < size; lz++) {
      for (let lx = 0; lx < size; lx++) {
        const edges: Record<Face, boolean> = {
          left: lx === 0,
          right: lx === size - 1,
          bottom: ly === 0,
          top: ly === size - 1,
          back: lz === 0,
          front: lz === size - 1,
        }
        const onSurface = FACES.some((f) => edges[f])
        if (options.hollow && !onSurface) continue

        const faces = emptyFaces<string>()
        for (const face of FACES) {
          if (!edges[face]) continue
          const [col, row] = faceTexel(face, lx, ly, lz, size, size, size)
          faces[face] = toHex(getPixel(strip, faceOffset[face] + col, row))
        }
        raw.push({ x: lx, y: ly, z: lz, lx, ly, lz, part: 'block', interior: !onSurface, faces })
      }
    }
  }

  const parts = [{ id: 'block', name: 'Block', w: size, h: size, d: size, origin: [0, 0, 0] as [number, number, number] }]
  return finalizeModel('block', raw, parts, options)
}
