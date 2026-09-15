/**
 * Coordinates: x grows to the viewer's right, y grows up, z grows toward the viewer.
 * Face names are from the viewer's point of view while looking at the front of the build,
 * so `left` is the -x side (for a skin, that's the character's own right side).
 */
export const FACES = ['top', 'bottom', 'front', 'back', 'left', 'right'] as const
export type Face = (typeof FACES)[number]

export const FACE_NORMALS: Record<Face, [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
}

/** A face color is a hex string before palette reduction and a paint index after. Null = not visible. */
export type FaceColors<T> = Record<Face, T | null>

export interface Voxel<T = number> {
  x: number
  y: number
  z: number
  /** Which body part (skins) or 'item'. */
  part: string
  /** Position inside the part, with ly = 0 at the bottom and lz = 0 at the back. */
  lx: number
  ly: number
  lz: number
  faces: FaceColors<T>
  /** Hollow-build filler cube that never shows. */
  interior: boolean
}

/**
 * Which pixel (column, row) of a face's own texture covers the cube at (lx, ly, lz) in a w×h×d box.
 * Follows Minecraft's conventions, so it works for both skins and block textures:
 * side faces are upright, the top's bottom row meets the front, and the bottom's top row meets the front.
 */
export function faceTexel(
  face: Face,
  lx: number,
  ly: number,
  lz: number,
  w: number,
  h: number,
  d: number,
): [number, number] {
  const row = h - 1 - ly
  switch (face) {
    case 'top':
      return [lx, lz]
    case 'bottom':
      return [lx, d - 1 - lz]
    case 'left':
      return [lz, row]
    case 'front':
      return [lx, row]
    case 'right':
      return [d - 1 - lz, row]
    case 'back':
      return [w - 1 - lx, row]
  }
}

export function emptyFaces<T>(): FaceColors<T> {
  return { top: null, bottom: null, front: null, back: null, left: null, right: null }
}

export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

/** Clears any face that is pressed against another cube, since it will never be seen. */
export function hideCoveredFaces<T>(voxels: Voxel<T>[]): void {
  const occupied = new Set(voxels.map((v) => voxelKey(v.x, v.y, v.z)))
  for (const v of voxels) {
    for (const face of FACES) {
      const [dx, dy, dz] = FACE_NORMALS[face]
      if (occupied.has(voxelKey(v.x + dx, v.y + dy, v.z + dz))) v.faces[face] = null
    }
  }
}

/** The color that covers the most visible faces, with front/top winning ties. */
export function dominantColor<T>(faces: FaceColors<T>): T | null {
  const counts = new Map<T, number>()
  let best: T | null = null
  let bestCount = 0
  for (const face of ['front', 'top', 'left', 'right', 'back', 'bottom'] as const) {
    const c = faces[face]
    if (c === null) continue
    const n = (counts.get(c) ?? 0) + 1
    counts.set(c, n)
    if (n > bestCount) {
      best = c
      bestCount = n
    }
  }
  return best
}

export function mapFaces<A, B>(faces: FaceColors<A>, fn: (c: A) => B): FaceColors<B> {
  const out = emptyFaces<B>()
  for (const face of FACES) {
    const c = faces[face]
    out[face] = c === null ? null : fn(c)
  }
  return out
}
