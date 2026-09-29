import { finalizeModel, type ColorOptions } from './model'
import { emptyFaces, FACES, type Voxel } from './voxels'
import { checkConnectivity } from './connectivity'
import type { ShapeData } from './shapeData'
export { validateShape, type ShapeData } from './shapeData'

function shapeVoxels(data: ShapeData, hollow: boolean): Voxel<string>[] {
  const raw: Voxel<string>[] = []
  for (const [x, y, z, ...colors] of data.cubes) {
    const interior = colors.every(c => c === -1)
    const faces = emptyFaces<string>()
    FACES.forEach((face, i) => { faces[face] = colors[i]! < 0 ? null : data.palette[colors[i]!]! })
    raw.push({ x, y, z, lx: x, ly: y, lz: z, part: 'object', interior, faces })
  }
  if (!hollow) return raw
  const shell = raw.filter(v => !v.interior)
  const filler = new Map(raw.filter(v => v.interior).map(v => [`${v.x},${v.y},${v.z}`, v]))
  // At a stepped edge, a one-cube shell can meet only diagonally. Keep hidden supports
  // from the original solid so every piece has a face to glue to, without changing its outline.
  for (;;) {
    const report = checkConnectivity(shell)
    if (report.pieces <= 1) return shell
    const bridge = report.bridgeSpots.map(p => filler.get(`${p.x},${p.y},${p.z}`)).find(Boolean)
    if (!bridge) return raw // An unfamiliar shape remains safely buildable as a solid.
    shell.push(bridge)
    filler.delete(`${bridge.x},${bridge.y},${bridge.z}`)
  }
}

export function shapeCubeCounts(data: ShapeData) {
  return { solid: data.cubes.length, hollow: shapeVoxels(data, true).length }
}

export function shapeToModel(data: ShapeData, options: ColorOptions & { hollow: boolean }) {
  const [w, h, d] = data.size
  return finalizeModel('object', shapeVoxels(data, options.hollow), [{ id: 'object', name: 'Build', w, h, d, origin: [0, 0, 0] }], options)
}
