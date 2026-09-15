/**
 * Downloads the Minecraft client jar and writes flat item sprites + an index for the catalog.
 *
 *   npm run extract            # latest release
 *   npm run extract -- 1.21.8  # a specific version
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT_TEXTURES = join(ROOT, 'public', 'textures', 'items')
const OUT_INDEX = join(ROOT, 'public', 'data', 'items.json')
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

type Json = Record<string, any>

interface CatalogItem {
  id: string
  name: string
  texture: string
  category: 'item' | 'plant'
}

/** Colors the game would tint gray textures with, using their in-inventory defaults. */
const BIOME_TINTS: Record<string, number> = {
  'minecraft:grass': 0x7cbd6b,
  'minecraft:foliage': 0x48b518,
  'minecraft:dry_foliage': 0xa1714d,
}

async function getJson(url: string): Promise<Json> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return res.json() as Promise<Json>
}

async function downloadJar(requested?: string): Promise<{ version: string; jar: AdmZip }> {
  const manifest = await getJson(MANIFEST)
  const version = requested ?? manifest.latest.release
  const entry = manifest.versions.find((v: Json) => v.id === version)
  if (!entry) throw new Error(`Unknown Minecraft version ${version}`)

  mkdirSync(CACHE, { recursive: true })
  const path = join(CACHE, `${version}.jar`)
  if (!existsSync(path)) {
    const meta = await getJson(entry.url)
    console.log(`Downloading client jar for ${version}…`)
    const res = await fetch(meta.downloads.client.url)
    if (!res.ok) throw new Error(`${res.status} downloading client jar`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  }
  return { version, jar: new AdmZip(path) }
}

const strip = (id: string) => id.replace(/^minecraft:/, '')

function main(jar: AdmZip): CatalogItem[] {
  const read = (path: string): Buffer | null => jar.getEntry(path)?.getData() ?? null
  const readJson = (path: string): Json | null => {
    const buf = read(path)
    return buf ? JSON.parse(buf.toString('utf8')) : null
  }
  const lang = readJson('assets/minecraft/lang/en_us.json') ?? {}

  /** Follows `parent` links. Returns merged textures, or null for 3D (non-sprite) models. */
  const resolveModel = (ref: string): Record<string, string> | null => {
    const textures: Record<string, string> = {}
    let current: string | undefined = strip(ref)
    for (let depth = 0; current && depth < 10; depth++) {
      if (current === 'builtin/generated' || current === 'item/generated') return textures
      const model = readJson(`assets/minecraft/models/${current}.json`)
      if (!model) return null
      for (const [k, v] of Object.entries<string>(model.textures ?? {})) textures[k] ??= v
      current = model.parent ? strip(model.parent) : undefined
    }
    return null
  }

  /** Finds the plain inventory model inside an item definition (skipping conditional variants). */
  const findModel = (node: Json): Json | null => {
    if (!node || typeof node !== 'object') return null
    if (strip(node.type ?? '') === 'model') return node
    for (const key of ['fallback', 'on_false', 'model', 'cases', 'entries']) {
      const child = node[key]
      const found = Array.isArray(child) ? child.map((c) => findModel(c.model ?? c)).find(Boolean) : findModel(child)
      if (found) return found
    }
    return null
  }

  const items: CatalogItem[] = []
  const prefix = 'assets/minecraft/items/'
  const ids = jar
    .getEntries()
    .map((e) => e.entryName)
    .filter((n) => n.startsWith(prefix) && n.endsWith('.json'))
    .map((n) => n.slice(prefix.length, -'.json'.length))
    .sort()

  let skipped = 0
  for (const id of ids) {
    const model = findModel(readJson(`${prefix}${id}.json`)!.model)
    const textures = model && resolveModel(model.model)
    if (!textures?.layer0) {
      skipped++
      continue
    }

    const tints: Json[] = model!.tints ?? []
    const out = new PNG({ width: 16, height: 16 })
    for (let layer = 0; textures[`layer${layer}`]; layer++) {
      const texPath = `assets/minecraft/textures/${strip(textures[`layer${layer}`])}.png`
      const buf = read(texPath)
      if (!buf) break
      const png = PNG.sync.read(buf)
      if (png.width !== 16) break
      // Animated textures stack their frames vertically; the first 16×16 is frame one.
      composite(out, png, tintColor(tints[layer]))
    }

    if (!out.data.some((_, i) => i % 4 === 3 && out.data[i] > 0)) {
      skipped++
      continue
    }
    writeFileSync(join(OUT_TEXTURES, `${id}.png`), PNG.sync.write(out))
    const fromBlock = strip(textures.layer0).startsWith('block/')
    items.push({
      id,
      name: lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`] ?? id,
      texture: `textures/items/${id}.png`,
      category: fromBlock ? 'plant' : 'item',
    })
  }
  console.log(`Wrote ${items.length} flat items, skipped ${skipped} 3D or empty models.`)
  return items
}

function tintColor(tint: Json | undefined): number | null {
  if (!tint) return null
  const type = strip(tint.type ?? '')
  if (type === 'constant') return tint.value & 0xffffff
  if (`minecraft:${type}` in BIOME_TINTS) return BIOME_TINTS[`minecraft:${type}`]
  if (typeof tint.default === 'number') return tint.default & 0xffffff
  return null
}

function composite(dst: PNG, src: PNG, tint: number | null): void {
  const tr = tint === null ? 255 : (tint >> 16) & 255
  const tg = tint === null ? 255 : (tint >> 8) & 255
  const tb = tint === null ? 255 : tint & 255
  for (let i = 0; i < 16 * 16 * 4; i += 4) {
    const a = src.data[i + 3] / 255
    if (a === 0) continue
    const r = (src.data[i] * tr) / 255
    const g = (src.data[i + 1] * tg) / 255
    const b = (src.data[i + 2] * tb) / 255
    const da = dst.data[i + 3] / 255
    const oa = a + da * (1 - a)
    dst.data[i] = Math.round((r * a + dst.data[i] * da * (1 - a)) / oa)
    dst.data[i + 1] = Math.round((g * a + dst.data[i + 1] * da * (1 - a)) / oa)
    dst.data[i + 2] = Math.round((b * a + dst.data[i + 2] * da * (1 - a)) / oa)
    dst.data[i + 3] = Math.round(oa * 255)
  }
}

const { version, jar } = await downloadJar(process.argv[2])
rmSync(OUT_TEXTURES, { recursive: true, force: true })
mkdirSync(OUT_TEXTURES, { recursive: true })
mkdirSync(dirname(OUT_INDEX), { recursive: true })
const items = main(jar)
writeFileSync(OUT_INDEX, JSON.stringify({ version, items }))
console.log(`Minecraft ${version} → ${OUT_INDEX}`)
