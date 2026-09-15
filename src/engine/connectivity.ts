import { FACE_NORMALS, FACES, voxelKey, type Voxel } from './voxels'

export interface ConnectivityReport {
  /** Groups of cubes that touch face to face. More than one means the build falls apart. */
  pieces: number
  /** Size of each piece, largest first. */
  pieceSizes: number[]
  /** Empty spots that would join two or more pieces if a filler cube went there. */
  bridgeSpots: { x: number; y: number; z: number }[]
}

export function checkConnectivity(voxels: Voxel<unknown>[]): ConnectivityReport {
  const index = new Map(voxels.map((v, i) => [voxelKey(v.x, v.y, v.z), i]))
  const pieceOf = new Array<number>(voxels.length).fill(-1)
  const sizes: number[] = []

  for (let start = 0; start < voxels.length; start++) {
    if (pieceOf[start] !== -1) continue
    const piece = sizes.length
    sizes.push(0)
    const stack = [start]
    pieceOf[start] = piece
    while (stack.length) {
      const v = voxels[stack.pop()!]
      sizes[piece]++
      for (const face of FACES) {
        const [dx, dy, dz] = FACE_NORMALS[face]
        const n = index.get(voxelKey(v.x + dx, v.y + dy, v.z + dz))
        if (n !== undefined && pieceOf[n] === -1) {
          pieceOf[n] = piece
          stack.push(n)
        }
      }
    }
  }

  const bridgeSpots: ConnectivityReport['bridgeSpots'] = []
  if (sizes.length > 1) {
    const seen = new Set<string>()
    for (const v of voxels) {
      for (const face of FACES) {
        const [dx, dy, dz] = FACE_NORMALS[face]
        const x = v.x + dx
        const y = v.y + dy
        const z = v.z + dz
        const key = voxelKey(x, y, z)
        if (index.has(key) || seen.has(key)) continue
        seen.add(key)
        const touching = new Set<number>()
        for (const f of FACES) {
          const [ex, ey, ez] = FACE_NORMALS[f]
          const n = index.get(voxelKey(x + ex, y + ey, z + ez))
          if (n !== undefined) touching.add(pieceOf[n])
        }
        if (touching.size > 1) bridgeSpots.push({ x, y, z })
      }
    }
  }

  return { pieces: sizes.length, pieceSizes: [...sizes].sort((a, b) => b - a), bridgeSpots }
}
