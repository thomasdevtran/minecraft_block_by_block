import { buildPalette, type PaletteEntry } from './palette'
import { dominantColor, FACES, hideCoveredFaces, mapFaces, type Voxel } from './voxels'

export interface PartInfo {
  id: string
  name: string
  /** Size in cubes. */
  w: number
  h: number
  d: number
  /** Where the part's back-bottom-left corner sits in the finished build. */
  origin: [number, number, number]
  /** Extra instruction shown on the part's first build layer. */
  firstLayerNote?: string
}

export interface BuildModel {
  /** item = flat sprite, skin = player figure, block = full cube, plant = crossed flower (maybe potted). */
  kind: 'item' | 'skin' | 'block' | 'plant'
  voxels: Voxel<number>[]
  palette: PaletteEntry[]
  parts: PartInfo[]
}

export interface ColorOptions {
  /** Upper limit on how many paints the build uses. */
  maxPaints: number
  /** Paint each cube one color (its most visible one) instead of face by face. */
  simplePaint: boolean
}

/** Hides covered faces, reduces colors to a paint palette and applies the simple-paint option. */
export function finalizeModel(
  kind: BuildModel['kind'],
  raw: Voxel<string>[],
  parts: PartInfo[],
  options: ColorOptions,
): BuildModel {
  hideCoveredFaces(raw)

  const counts = new Map<string, number>()
  for (const v of raw) {
    for (const face of FACES) {
      const hex = v.faces[face]
      if (hex !== null) counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
  }
  const { palette, lookup } = buildPalette(counts, options.maxPaints)

  const voxels: Voxel<number>[] = raw.map((v) => {
    let faces = mapFaces(v.faces, (hex) => lookup.get(hex)!)
    if (options.simplePaint) {
      const main = dominantColor(faces)
      faces = mapFaces(faces, () => main!)
    }
    return { ...v, faces }
  })

  // Recount after merging and simplifying so the materials list matches the steps.
  for (const p of palette) p.count = 0
  for (const v of voxels) {
    for (const face of FACES) {
      const c = v.faces[face]
      if (c !== null) palette[c].count++
    }
  }
  const used = palette.filter((p) => p.count > 0)
  const remap = new Map(used.map((p, i) => [palette.indexOf(p), i]))
  used.forEach((p, i) => (p.id = i + 1))
  for (const v of voxels) v.faces = mapFaces(v.faces, (c) => remap.get(c)!)

  return { kind, voxels, palette: used, parts }
}
