import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { PNG } from 'pngjs'

interface Item { id: string; name: string; category: string; texture: string; block?: string; classic?: { texture: string; block?: string } }
const catalog = JSON.parse(readFileSync('public/data/items.json', 'utf8')) as { items: Item[]; pot: string; classicPot: string }
const root = resolve('public')
const paths = new Map<string, number>()
const ids = new Set<string>()
for (const item of catalog.items) {
  if (!/^[a-z0-9_]+$/.test(item.id) || ids.has(item.id) || !item.name || !['item', 'plant', 'block'].includes(item.category)) throw new Error(`Invalid catalog item: ${item.id}`)
  ids.add(item.id)
  paths.set(item.texture, 16)
  if (item.block) paths.set(item.block, 96)
  if (item.classic) paths.set(item.classic.texture, 16)
  if (item.classic?.block) paths.set(item.classic.block, 96)
}
paths.set(catalog.pot, 32)
paths.set(catalog.classicPot, 32)
for (const [path, width] of paths) {
  const absolute = resolve(root, path)
  if (!absolute.startsWith(root + sep)) throw new Error(`Asset escapes public directory: ${path}`)
  const png = PNG.sync.read(readFileSync(absolute))
  if (png.height !== 16 || png.width !== width) throw new Error(`Unexpected dimensions for ${path}: ${png.width}x${png.height}`)
}
console.log(`Validated ${ids.size} catalog entries and ${paths.size} referenced PNGs (current, classic, block strips and pots).`)
