import { finalizeModel, type BuildModel, type ColorOptions, type PartInfo } from './model'
import { ALPHA_CUTOFF, getPixel, toHex, type PixelImage } from './pixels'
import { emptyFaces, faceTexel, FACES, type Face, type Voxel } from './voxels'

/**
 * Pot textures written by `npm run extract`: a 32×16 image with flower_pot.png on the left and dirt.png on the right.
 */
export type PotTextures = PixelImage

/** Pot footprint and height in cubes, matching Minecraft's flower pot model. */
export const POT = { size: 6, height: 6, dirtLevel: 4, origin: [5, 0, 5] as [number, number, number] }

/** In a pot, the plant starts on the dirt, 4 cubes up. */
const PLANT_LIFT = POT.dirtLevel

/** Where the two crossed planes sit inside the 16×16 footprint. */
const CROSS_CENTER = 7

export interface FlowerOptions extends ColorOptions {
  pot: PotTextures | null
}

function blank(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

function copyPixel(src: PixelImage, sx: number, sy: number, dst: PixelImage, dx: number, dy: number): void {
  const s = (sy * src.width + sx) * 4
  const d = (dy * dst.width + dx) * 4
  for (let k = 0; k < 4; k++) dst.data[d + k] = src.data[s + k]
}

/**
 * Front view of a potted flower as a flat picture: the sprite standing on the dirt,
 * with the pot's front wall drawn over the bottom of the stem.
 */
export function pottedSprite(sprite: PixelImage, pot: PotTextures): PixelImage {
  const height = sprite.height + PLANT_LIFT
  const out = blank(sprite.width, height)
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) copyPixel(sprite, x, y, out, x, y)
  }
  // Front of the pot uses flower_pot.png columns 5–10, rows 10–15.
  for (let y = 0; y < POT.height; y++) {
    for (let x = 0; x < POT.size; x++) {
      copyPixel(pot, 5 + x, 10 + y, out, POT.origin[0] + x, height - POT.height + y)
    }
  }
  return out
}

/**
 * The flower as it stands in the world: two planes of cubes crossing in a plus shape
 * (Minecraft tilts them 45°, which cubes can't do). Optionally planted in a pot.
 */
export function flowerToModel(sprite: PixelImage, options: FlowerOptions): BuildModel {
  const lift = options.pot ? PLANT_LIFT : 0
  const byPosition = new Map<string, Voxel<string>>()
  const add = (v: Voxel<string>) => {
    const key = `${v.x},${v.y},${v.z}`
    if (!byPosition.has(key)) byPosition.set(key, v)
  }

  if (options.pot) for (const v of potVoxels(options.pot)) add(v)

  const plantCube = (x: number, y: number, z: number, hex: string): Voxel<string> => ({
    x,
    y: y + lift,
    z,
    lx: x,
    ly: y,
    lz: z,
    part: 'plant',
    interior: false,
    faces: { top: hex, bottom: hex, front: hex, back: hex, left: hex, right: hex },
  })

  for (let row = 0; row < sprite.height; row++) {
    const y = sprite.height - 1 - row
    for (let col = 0; col < sprite.width; col++) {
      const px = getPixel(sprite, col, row)
      if (px.a < ALPHA_CUTOFF) continue
      const hex = toHex(px)
      // Plane facing the front, then the plane facing the side (seen from the right, so columns run back to front).
      add(plantCube(col, y, CROSS_CENTER, hex))
      add(plantCube(CROSS_CENTER, y, sprite.width - 1 - col, hex))
    }
  }

  const parts: PartInfo[] = []
  if (options.pot) {
    parts.push({ id: 'pot', name: 'Pot', w: POT.size, h: POT.height, d: POT.size, origin: POT.origin })
  }
  parts.push({
    id: 'plant',
    name: 'Flower',
    w: sprite.width,
    h: sprite.height,
    d: sprite.width,
    origin: [0, lift, 0],
    ...(options.pot && {
      firstLayerNote: `Stand this layer on the dirt inside the pot, 2 cubes below the rim. The pot fills the middle ${POT.size}×${POT.size} of this grid.`,
    }),
  })
  return finalizeModel('plant', [...byPosition.values()], parts, options)
}

/** A 6×6×6 pot with 1-cube walls, filled with dirt up to 2 cubes below the rim. */
function potVoxels(tex: PotTextures): Voxel<string>[] {
  const { size, height, dirtLevel, origin } = POT
  const out: Voxel<string>[] = []
  const potPixel = (x: number, y: number) => toHex(getPixel(tex, x, y))
  const dirtPixel = (x: number, y: number) => toHex(getPixel(tex, 16 + x, y))

  for (let ly = 0; ly < height; ly++) {
    for (let lz = 0; lz < size; lz++) {
      for (let lx = 0; lx < size; lx++) {
        const wall = lx === 0 || lx === size - 1 || lz === 0 || lz === size - 1
        if (!wall && ly >= dirtLevel) continue
        const faces = emptyFaces<string>()
        for (const face of FACES) faces[face] = potFaceColor(face, lx, ly, lz, wall)
        out.push({ x: origin[0] + lx, y: origin[1] + ly, z: origin[2] + lz, lx, ly, lz, part: 'pot', interior: false, faces })
      }
    }
  }
  return out

  function potFaceColor(face: Face, lx: number, ly: number, lz: number, wall: boolean): string {
    // Dirt surface: dirt.png columns/rows 6–9.
    if (face === 'top' && !wall && ly === dirtLevel - 1) return dirtPixel(6 + lx - 1, 6 + lz - 1)
    const [col, row] = faceTexel(face, lx, ly, lz, size, height, size)
    // Rim and base use flower_pot.png from (5, 5); every side uses it from (5, 10).
    return face === 'top' || face === 'bottom' ? potPixel(5 + col, 5 + row) : potPixel(5 + col, 10 + row)
  }
}
