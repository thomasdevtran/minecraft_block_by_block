import { FACE_NORMALS, FACES, voxelKey, type Voxel } from './voxels'

export interface ConnectivityReport {
  /** Groups of cubes that touch face to face. More than one means the build falls apart. */
  pieces: number
  /** Size of each piece, largest first. */
  pieceSizes: number[]
  /** Empty spots that would join two or more pieces if a filler cube went there. */
  bridgeSpots: { x: number; y: number; z: number }[]
}

export function faceConnectedGroups<T>(voxels: readonly Voxel<T>[]): Voxel<T>[][] {
  const remaining = new Map(voxels.map(v => [voxelKey(v.x, v.y, v.z), v]))
  const groups: Voxel<T>[][] = []
  for (const [key, start] of remaining) {
    remaining.delete(key)
    const group = [start]
    for (const v of group) {
      for (const face of FACES) {
        const [dx, dy, dz] = FACE_NORMALS[face]
        const neighbor = voxelKey(v.x + dx, v.y + dy, v.z + dz)
        const next = remaining.get(neighbor)
        if (!next) continue
        remaining.delete(neighbor)
        group.push(next)
      }
    }
    groups.push(group)
  }
  return groups
}

export function touchesPlacedCube(v: Voxel<unknown>, placed: ReadonlySet<string>): boolean {
  return FACES.some(face => {
    const [dx, dy, dz] = FACE_NORMALS[face]
    return placed.has(voxelKey(v.x + dx, v.y + dy, v.z + dz))
  })
}

export function checkConnectivity(voxels: Voxel<unknown>[]): ConnectivityReport {
  const groups = faceConnectedGroups(voxels)
  const bridgeSpots: ConnectivityReport['bridgeSpots'] = []
  if (groups.length > 1) {
    const pieceOf = new Map<string, number>()
    groups.forEach((group, i) => {
      for (const v of group) pieceOf.set(voxelKey(v.x, v.y, v.z), i)
    })
    const seen = new Set<string>()
    for (const v of voxels) {
      for (const face of FACES) {
        const [dx, dy, dz] = FACE_NORMALS[face]
        const x = v.x + dx
        const y = v.y + dy
        const z = v.z + dz
        const key = voxelKey(x, y, z)
        if (pieceOf.has(key) || seen.has(key)) continue
        seen.add(key)
        const touching = new Set<number>()
        for (const f of FACES) {
          const [ex, ey, ez] = FACE_NORMALS[f]
          const n = pieceOf.get(voxelKey(x + ex, y + ey, z + ez))
          if (n !== undefined) touching.add(n)
        }
        if (touching.size > 1) bridgeSpots.push({ x, y, z })
      }
    }
  }

  return { pieces: groups.length, pieceSizes: groups.map(group => group.length).sort((a, b) => b - a), bridgeSpots }
}
