import { finalizeModel, type BuildModel, type ColorOptions, type PartInfo } from './model'
import { ALPHA_CUTOFF, getPixel, toHex, type PixelImage } from './pixels'
import { emptyFaces, faceTexel, type Face, type Voxel } from './voxels'

export type SkinModelType = 'classic' | 'slim'

export interface SkinOptions extends ColorOptions {
  model: SkinModelType
  /** Hollow builds only use cubes on the outside of each body part. */
  hollow: boolean
  /** Paint the second layer (hat, jacket, sleeves, pants) over the base skin. */
  overlay: boolean
}

interface PartSpec {
  id: string
  name: string
  w: number
  h: number
  d: number
  /** Top-left of the part's texture box in the skin file. */
  uv: [number, number]
  overlayUv: [number, number] | null
  origin: [number, number, number]
  /** Legacy 64×32 skins have no left limbs, so they reuse the right limb mirrored. */
  legacyMirrorOf?: string
}

function partSpecs(model: SkinModelType): PartSpec[] {
  const armW = model === 'slim' ? 3 : 4
  // x: the character's right arm is on the viewer's left. z: body spans 0..3, head overhangs by 2.
  return [
    { id: 'rightLeg', name: 'Right leg', w: 4, h: 12, d: 4, uv: [0, 16], overlayUv: [0, 32], origin: [4, 0, 0] },
    { id: 'leftLeg', name: 'Left leg', w: 4, h: 12, d: 4, uv: [16, 48], overlayUv: [0, 48], origin: [8, 0, 0], legacyMirrorOf: 'rightLeg' },
    { id: 'body', name: 'Body', w: 8, h: 12, d: 4, uv: [16, 16], overlayUv: [16, 32], origin: [4, 12, 0] },
    { id: 'rightArm', name: 'Right arm', w: armW, h: 12, d: 4, uv: [40, 16], overlayUv: [40, 32], origin: [4 - armW, 12, 0] },
    { id: 'leftArm', name: 'Left arm', w: armW, h: 12, d: 4, uv: [32, 48], overlayUv: [48, 48], origin: [12, 12, 0], legacyMirrorOf: 'rightArm' },
    { id: 'head', name: 'Head', w: 8, h: 8, d: 8, uv: [0, 0], overlayUv: [32, 0], origin: [4, 24, -2] },
  ]
}

/**
 * Where a face pixel lives inside a part's texture box, which is laid out as
 *   [    ][top ][bottom][    ]
 *   [left][front][right][back]
 * with the character's right side (the viewer's left) first.
 */
export function faceUv(
  face: Face,
  lx: number,
  ly: number,
  lz: number,
  w: number,
  h: number,
  d: number,
): [number, number] {
  const offsets: Record<Face, [number, number]> = {
    top: [d, 0],
    bottom: [d + w, 0],
    left: [0, d],
    front: [d, d],
    right: [d + w, d],
    back: [2 * d + w, d],
  }
  const [col, row] = faceTexel(face, lx, ly, lz, w, h, d)
  return [offsets[face][0] + col, offsets[face][1] + row]
}

const MIRRORED_FACE: Record<Face, Face> = {
  top: 'top',
  bottom: 'bottom',
  front: 'front',
  back: 'back',
  left: 'right',
  right: 'left',
}

export function isLegacySkin(img: PixelImage): boolean {
  return img.height === img.width / 2
}

export function validateSkin(img: PixelImage): string | null {
  if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
    return `Skins must be 64×64 or 64×32 pixels, but this image is ${img.width}×${img.height}.`
  }
  return null
}

export function skinToModel(img: PixelImage, options: SkinOptions): BuildModel {
  const error = validateSkin(img)
  if (error) throw new Error(error)
  const legacy = isLegacySkin(img)
  const specs = partSpecs(options.model)
  const byId = new Map(specs.map((s) => [s.id, s]))

  const useHat = hatVisible(img, options.overlay)

  const raw: Voxel<string>[] = []
  for (const part of specs) {
    const mirror = legacy && part.legacyMirrorOf ? byId.get(part.legacyMirrorOf)! : null
    const source = mirror ?? part
    const overlayUv = !options.overlay
      ? null
      : legacy
        ? source.id === 'head' && useHat
          ? source.overlayUv
          : null
        : source.overlayUv

    const sample = (face: Face, lx: number, ly: number, lz: number): string => {
      let f = face
      let x = lx
      if (mirror) {
        f = MIRRORED_FACE[face]
        x = part.w - 1 - lx
      }
      const [u, v] = faceUv(f, x, ly, lz, source.w, source.h, source.d)
      if (overlayUv) {
        const top = getPixel(img, overlayUv[0] + u, overlayUv[1] + v)
        if (top.a >= ALPHA_CUTOFF) return toHex(top)
      }
      // The base layer is always drawn fully opaque in game.
      return toHex(getPixel(img, source.uv[0] + u, source.uv[1] + v))
    }

    for (let ly = 0; ly < part.h; ly++) {
      for (let lz = 0; lz < part.d; lz++) {
        for (let lx = 0; lx < part.w; lx++) {
          const edges = {
            left: lx === 0,
            right: lx === part.w - 1,
            bottom: ly === 0,
            top: ly === part.h - 1,
            back: lz === 0,
            front: lz === part.d - 1,
          }
          const onSurface = Object.values(edges).some(Boolean)
          if (options.hollow && !onSurface) continue

          const faces = emptyFaces<string>()
          for (const face of Object.keys(edges) as Face[]) {
            if (edges[face]) faces[face] = sample(face, lx, ly, lz)
          }
          raw.push({
            x: part.origin[0] + lx,
            y: part.origin[1] + ly,
            z: part.origin[2] + lz,
            lx,
            ly,
            lz,
            part: part.id,
            interior: !onSurface,
            faces,
          })
        }
      }
    }
  }

  const parts: PartInfo[] = specs.map(({ id, name, w, h, d, origin }) => ({ id, name, w, h, d, origin }))
  return finalizeModel('skin', raw, parts, options)
}

/** Old skins often fill the hat area with a solid color, which the game ignores. */
function hatVisible(img: PixelImage, overlay: boolean): boolean {
  return overlay && !(isLegacySkin(img) && regionIsOpaque(img, 32, 0, 32, 16))
}

/** The front of the head as an 8×8 picture, with the hat layer drawn over it when `overlay` is on. */
export function skinFace(img: PixelImage, overlay: boolean): PixelImage {
  const error = validateSkin(img)
  if (error) throw new Error(error)
  const size = 8
  const hat = hatVisible(img, overlay)
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const top = getPixel(img, 40 + x, 8 + y)
      const px = hat && top.a >= ALPHA_CUTOFF ? top : getPixel(img, 8 + x, 8 + y)
      // The base layer is always drawn fully opaque in game.
      data.set([px.r, px.g, px.b, 255], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data }
}

function regionIsOpaque(img: PixelImage, x: number, y: number, w: number, h: number): boolean {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (getPixel(img, i, j).a < ALPHA_CUTOFF) return false
    }
  }
  return true
}
