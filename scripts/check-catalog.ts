import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { PNG } from 'pngjs'
import { validateShape } from '../src/engine/shapeData.ts'

interface Item { id: string; name: string; category: string; group?: string; shape?: string; texture: string; block?: string; classic?: { texture: string; block?: string } }
const catalog = JSON.parse(readFileSync('public/data/items.json', 'utf8')) as { groups: Record<string, string[]>; items: Item[]; pot: string; classicPot: string }
const root = resolve('public')
const paths = new Map<string, number>()
const ids = new Set<string>()
let shapeCount = 0
const assetPath = (path: string) => {
  const absolute = resolve(root, path)
  if (!absolute.startsWith(root + sep)) throw new Error(`Asset escapes public directory: ${path}`)
  return absolute
}
for (const item of catalog.items) {
  if (!/^[a-z0-9_]+$/.test(item.id) || ids.has(item.id) || !item.name || !['item', 'plant', 'block'].includes(item.category)) throw new Error(`Invalid catalog item: ${item.id}`)
  ids.add(item.id)
  if (!item.group || !catalog.groups[item.category]?.includes(item.group)) throw new Error(`Missing or invalid group: ${item.id}`)
  if (item.shape) {
    validateShape(JSON.parse(readFileSync(assetPath(item.shape), 'utf8')))
    shapeCount++
  }
  paths.set(item.texture, 16)
  if (item.block) paths.set(item.block, 96)
  if (item.classic) paths.set(item.classic.texture, 16)
  if (item.classic?.block) paths.set(item.classic.block, 96)
}
paths.set(catalog.pot, 32)
paths.set(catalog.classicPot, 32)
for (const [path, width] of paths) {
  const absolute = assetPath(path)
  const png = PNG.sync.read(readFileSync(absolute))
  if (png.height !== 16 || png.width !== width) throw new Error(`Unexpected dimensions for ${path}: ${png.width}x${png.height}`)
}
console.log(`Validated ${ids.size} categorized catalog entries, ${paths.size} referenced PNGs, and ${shapeCount} craft shapes.`)
