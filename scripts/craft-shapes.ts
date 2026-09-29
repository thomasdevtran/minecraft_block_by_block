import type AdmZip from 'adm-zip'
import { PNG } from 'pngjs'
import { emptyFaces, faceTexel, FACES, hideCoveredFaces, type Face, type Voxel } from '../src/engine/voxels.ts'
import { validateShape, type ShapeCube, type ShapeData } from '../src/engine/shapeData.ts'
import { sampleFace, type UV } from './texture-uv.ts'

type Point = [number, number, number]
interface Surface { texture: PNG; uv: UV; rotation?: number }
interface Box { from: Point; to: Point; faces: Partial<Record<Face, Surface>> }
export interface CraftShape { id: string; name: string; group: string; category: 'block' | 'item'; note: string; data: ShapeData; sprite: PNG }

/** Union boxes before hiding covered faces, so overlapping model pieces never double-count cubes. */
export function bakeShape(boxes: Box[]): ShapeData {
  const opaqueFallback = new Map<Surface, [number, number, number]>()
  const fallback = (surface: Surface): [number, number, number] => {
    if (!opaqueFallback.has(surface)) {
      const sums = [0, 0, 0]; let count = 0
      const [u1, v1, u2, v2] = surface.uv
      for (let y = Math.min(v1, v2); y < Math.max(v1, v2); y++) for (let x = Math.min(u1, u2); x < Math.max(u1, u2); x++) {
        const i = (y * surface.texture.width + x) * 4
        if (surface.texture.data[i + 3]! < 128) continue
        for (let c = 0; c < 3; c++) sums[c]! += surface.texture.data[i + c]!
        count++
      }
      if (!count) throw new Error('Craft face has no opaque texture pixels.')
      opaqueFallback.set(surface, sums.map(n => Math.round(n / count)) as [number, number, number])
    }
    return opaqueFallback.get(surface)!
  }
  const min = [0, 1, 2].map(i => Math.min(...boxes.map(box => box.from[i]!)))
  const max = [0, 1, 2].map(i => Math.max(...boxes.map(box => box.to[i]!)))
  const voxels = new Map<string, Voxel<string>>()
  for (const box of boxes) {
    if ([...box.from, ...box.to].some(n => !Number.isInteger(n))) throw new Error('Craft boxes must align to whole cubes.')
    const [w, h, d] = box.to.map((n, i) => n - box.from[i]!)
    for (let y = box.from[1]; y < box.to[1]; y++) for (let z = box.from[2]; z < box.to[2]; z++) for (let x = box.from[0]; x < box.to[0]; x++) {
      const [lx, ly, lz] = [x - box.from[0], y - box.from[1], z - box.from[2]]
      const faces = emptyFaces<string>()
      const edges = { top: ly === h! - 1, bottom: ly === 0, front: lz === d! - 1, back: lz === 0, left: lx === 0, right: lx === w! - 1 }
      const key = `${x},${y},${z}`
      const prior = voxels.get(key)
      for (const face of FACES) {
        const surface = box.faces[face]
        // A missing face on a model element is normally covered by a neighboring element.
        if (!edges[face] || !surface) { faces[face] = prior?.faces[face] ?? null; continue }
        const [col, row] = faceTexel(face, lx, ly, lz, w!, h!, d!)
        const fw = face === 'left' || face === 'right' ? d! : w!
        const fh = face === 'top' || face === 'bottom' ? d! : h!
        const color = sampleFace(surface.texture, surface.uv, (col + .5) / fw, (row + .5) / fh, surface.rotation)
        // Skull undersides have transparent pixels. Real craft cubes need a solid painted surface.
        const rgb = color[3] < 128 ? fallback(surface) : color.slice(0, 3)
        faces[face] = '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('')
      }
      voxels.set(key, { x, y, z, lx: x, ly: y, lz: z, faces, part: 'object', interior: false })
    }
  }
  const raw = [...voxels.values()]
  hideCoveredFaces(raw)
  const palette: string[] = []
  const indices = new Map<string, number>()
  const cubes = raw.map(v => [v.x - min[0]!, v.y - min[1]!, v.z - min[2]!, ...FACES.map(face => {
    const color = v.faces[face]
    if (color === null) return -1
    if (!indices.has(color)) { indices.set(color, palette.length); palette.push(color) }
    return indices.get(color)!
  })] as ShapeCube)
  cubes.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])
  const data = { size: max.map((n, i) => n - min[i]!) as Point, palette, cubes }
  validateShape(data)
  return data
}

/** Front-view template, centered without stretching tall objects into a square. */
export function shapeSprite(data: ShapeData): PNG {
  const out = new PNG({ width: 16, height: 16 })
  const [w, h] = data.size
  const scale = Math.min(16 / w, 16 / h)
  const imageW = Math.max(1, Math.round(w * scale)), imageH = Math.max(1, Math.round(h * scale))
  const left = Math.floor((16 - imageW) / 2), top = Math.floor((16 - imageH) / 2)
  const front = new Map<string, ShapeCube>()
  for (const cube of data.cubes) {
    const key = `${cube[0]},${cube[1]}`
    if (!front.has(key) || front.get(key)![2] < cube[2]) front.set(key, cube)
  }
  for (let y = 0; y < imageH; y++) for (let x = 0; x < imageW; x++) {
    const cube = front.get(`${Math.min(w - 1, Math.floor((x + .5) / imageW * w))},${h - 1 - Math.min(h - 1, Math.floor((y + .5) / imageH * h))}`)
    if (!cube) continue
    const color = data.palette[cube[5]] // front is third in FACES
    if (!color) throw new Error('Front projection has no paint.')
    out.data.set([...color.slice(1).match(/../g)!.map(s => parseInt(s, 16)), 255], ((y + top) * 16 + x + left) * 4)
  }
  return out
}

export function craftShapes(jar: AdmZip): CraftShape[] {
  const texture = (path: string) => {
    const buf = jar.getEntry(`assets/minecraft/textures/${path}.png`)?.getData()
    if (!buf) throw new Error(`Missing craft texture: ${path}`)
    return PNG.sync.read(buf)
  }
  // Entity boxes use Minecraft's unfolded box texture, with the face at +z for the guide.
  const entityBox = (png: PNG, from: Point, size: Point, u = 0, v = 0): Box => {
    const [w, h, d] = size
    const surface = (uv: UV): Surface => ({ texture: png, uv })
    return { from, to: from.map((n, i) => n + size[i]!) as Point, faces: {
      top: surface([u + d, v, u + d + w, v + d]), bottom: surface([u + d + w, v + d, u + d + 2 * w, v]),
      left: surface([u, v + d, u + d, v + d + h]), front: surface([u + d, v + d, u + d + w, v + d + h]),
      right: surface([u + d + w, v + d, u + 2 * d + w, v + d + h]), back: surface([u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h]),
    } }
  }
  const result: CraftShape[] = []
  const add = (id: string, name: string, category: 'block' | 'item', group: string, note: string, boxes: Box[]) => {
    const data = bakeShape(boxes)
    result.push({ id, name, category, group, note, data, sprite: shapeSprite(data) })
  }
  for (const [id, name, path] of [
    ['creeper_head', 'Creeper Head', 'creeper/creeper'], ['skeleton_skull', 'Skeleton Skull', 'skeleton/skeleton'],
    ['wither_skeleton_skull', 'Wither Skeleton Skull', 'skeleton/wither_skeleton'], ['zombie_head', 'Zombie Head', 'zombie/zombie'],
  ] as const) add(id, name, 'item', 'Mob Heads', 'An 8×8×8 decorative head using the mob’s original face textures.', [entityBox(texture(`entity/${path}`), [0, 0, 0], [8, 8, 8])])

  for (const [id, name, file] of [['chest', 'Chest', 'normal'], ['ender_chest', 'Ender Chest', 'ender']] as const) {
    const png = texture(`entity/chest/${file}`)
    add(id, name, 'block', 'Utility & Fun', 'A closed decorative chest with a fixed lid and latch. The lid does not open.', [
      entityBox(png, [0, 0, 0], [14, 10, 14], 0, 19), entityBox(png, [0, 9, 0], [14, 5, 14]), entityBox(png, [6, 7, 14], [2, 4, 1]),
    ])
  }
  const shield = texture('entity/shield/shield_base_nopattern')
  add('shield', 'Shield', 'item', 'Weapons & Combat', 'A decorative shield with a wooden face and a handle on the back. This is a display craft, not protective equipment.', [
    entityBox(shield, [0, 0, 6], [12, 22, 1]), entityBox(shield, [5, 8, 0], [2, 6, 6], 26, 0),
  ])

  const faceNames: Record<string, Face> = { up: 'top', down: 'bottom', south: 'front', north: 'back', west: 'left', east: 'right' }
  for (const [id, name, note] of [
    ['dragon_egg', 'Dragon Egg', 'The stepped egg shape from the game, built from the bottom up.'],
    ['enchanting_table', 'Enchanting Table', 'The textured table base. The animated floating book is not included.'],
    ['beacon', 'Beacon', 'A solid painted beacon core and obsidian base. The transparent glass shell and light beam are omitted so the core stays visible.'],
  ] as const) {
    const model = JSON.parse(jar.getEntry(`assets/minecraft/models/block/${id}.json`)!.getData().toString())
    const boxes: Box[] = model.elements.filter((el: { __comment?: string }) => id !== 'beacon' || el.__comment !== 'Glass shell').map((el: { from: Point; to: Point; rotation?: { angle: number }; faces: Record<string, { texture: string; uv: UV; rotation?: number }> }) => {
      if (el.rotation?.angle) throw new Error('Rotated shape is not supported.')
      return { from: el.from.map(Math.round) as Point, to: el.to.map(Math.round) as Point, faces: Object.fromEntries(Object.entries(el.faces).map(([face, def]) => [faceNames[face], { texture: texture(model.textures[def.texture.slice(1)]), uv: def.uv, rotation: def.rotation }])) }
    })
    add(id, name, 'block', id === 'dragon_egg' ? 'Nether & End' : 'Utility & Fun', note, boxes)
  }
  return result
}
