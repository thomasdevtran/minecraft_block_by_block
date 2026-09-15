/**
 * Downloads the Minecraft client jar and writes item sprites, block face strips and an index for the catalog.
 *
 *   npm run extract            # latest release
 *   npm run extract -- 1.21.8  # a specific version
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT_ITEMS = join(ROOT, 'public', 'textures', 'items')
const OUT_BLOCKS = join(ROOT, 'public', 'textures', 'blocks')
const OUT_INDEX = join(ROOT, 'public', 'data', 'items.json')
const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

type Json = Record<string, any>

interface CatalogItem {
  id: string
  name: string
  category: 'item' | 'plant' | 'block'
  /** Sub-group inside the Plants or Blocks tab. */
  group?: string
  /** Flat 16×16 sprite (for blocks, the front face). */
  texture: string
  /** 96×16 strip of the six block faces, when the item can be built as a 3D cube. */
  block?: string
  /** Flowers can also be built as a 3D crossed plant. */
  flower?: { pottable: boolean }
  /** Pre-1.14 look, only when it differs from today's. */
  classic?: { texture: string; block?: string }
  /** Extra background shown on the guide, e.g. for items no longer in the game. */
  note?: string
}

const OUT_POT = join(ROOT, 'public', 'textures', 'pot.png')

/**
 * Plants by category, in the same order as https://game8.co/games/Minecraft/archives/378440
 */
const PLANT_GROUPS: Record<string, string[]> = {
  Leaves: ['oak_leaves', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'azalea_leaves', 'flowering_azalea_leaves', 'mangrove_leaves'],
  Saplings: ['oak_sapling', 'spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling', 'dark_oak_sapling', 'azalea', 'flowering_azalea', 'mangrove_propagule'],
  Flowers: ['allium', 'azure_bluet', 'blue_orchid', 'cornflower', 'dandelion', 'lilac', 'lily_of_the_valley', 'orange_tulip', 'oxeye_daisy', 'peony', 'pink_tulip', 'poppy', 'red_tulip', 'rose_bush', 'sunflower', 'white_tulip', 'wither_rose'],
  Mushrooms: ['brown_mushroom', 'brown_mushroom_block', 'mushroom_stem', 'red_mushroom', 'red_mushroom_block'],
  Crops: ['bamboo', 'cactus', 'carved_pumpkin', 'hay_block', 'melon', 'pumpkin', 'sugar_cane'],
  'Cave Plants': ['big_dripleaf', 'glow_lichen', 'hanging_roots', 'moss_block', 'moss_carpet', 'small_dripleaf', 'spore_blossom'],
  Shrubbery: ['dead_bush', 'fern', 'short_grass', 'large_fern', 'lily_pad', 'tall_grass', 'vine'],
}

/**
 * Well-known full blocks, pinned to a group. Every other full-cube block is still included and
 * sorted by AUTO_BLOCK_GROUPS below.
 */
const BLOCK_GROUPS: Record<string, string[]> = {
  Natural: ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'mycelium', 'stone', 'cobblestone', 'mossy_cobblestone', 'deepslate', 'bedrock', 'sand', 'red_sand', 'gravel', 'clay', 'snow_block', 'muddy_mangrove_roots', 'creaking_heart'],
  Wood: ['oak_log', 'spruce_log', 'birch_log', 'oak_planks'],
  Ores: ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'emerald_ore', 'lapis_ore', 'diamond_ore', 'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_copper_ore', 'deepslate_gold_ore', 'deepslate_redstone_ore', 'deepslate_emerald_ore', 'deepslate_lapis_ore', 'deepslate_diamond_ore', 'nether_gold_ore', 'nether_quartz_ore', 'ancient_debris'],
  'Ore Blocks': ['coal_block', 'iron_block', 'copper_block', 'gold_block', 'redstone_block', 'emerald_block', 'lapis_block', 'diamond_block', 'netherite_block', 'quartz_block', 'amethyst_block', 'raw_iron_block', 'raw_copper_block', 'raw_gold_block'],
  'Nether & End': ['netherrack', 'soul_sand', 'soul_soil', 'glowstone', 'magma_block', 'nether_bricks', 'nether_wart_block', 'warped_wart_block', 'crimson_nylium', 'warped_nylium', 'basalt', 'blackstone', 'shroomlight', 'obsidian', 'crying_obsidian', 'end_stone', 'purpur_block'],
  'Utility & Fun': [
    'tnt', 'crafting_table', 'furnace', 'bookshelf', 'jukebox', 'note_block', 'redstone_lamp', 'sea_lantern', 'sponge', 'target', 'barrel', 'bee_nest', 'command_block',
    'wet_sponge', 'chiseled_bookshelf', 'beehive', 'blast_furnace', 'smoker', 'cartography_table', 'fletching_table', 'smithing_table', 'loom', 'crafter',
    'dispenser', 'dropper', 'piston', 'sticky_piston', 'jack_o_lantern', 'lodestone', 'respawn_anchor', 'chain_command_block', 'repeating_command_block',
  ],
}

/** Group for full blocks that aren't pinned above. The first matching rule wins. */
const AUTO_BLOCK_GROUPS: [group: string, test: RegExp][] = [
  ['Wood', /(^stripped_|_log$|_wood$|_planks$|_stem$|_hyphae$|^bamboo_block$|^bamboo_mosaic$)/],
  ['Ores', /_ore$/],
  ['Copper', /copper/],
  ['Colorful', /(_wool$|_concrete$|_concrete_powder$|terracotta$)/],
  ['Glass', /glass$/],
  ['Nether & End', /(nether|blackstone|basalt|crimson|warped|soul|end_stone|purpur|quartz|chorus)/],
  ['Stone & Bricks', /(stone|deepslate|brick|tuff|granite|diorite|andesite|calcite|dripstone|prismarine|mud|polished|chiseled|smooth|cobbled|resin|cinnabar|sulfur)/],
  ['Natural', /(dirt|sand|gravel|clay|ice|snow|moss|sculk|kelp|mud|root|coral|honeycomb|bone|amethyst|ochre|froglight|pearlescent|verdant)/],
]
const BLOCK_GROUP_ORDER = ['Natural', 'Wood', 'Stone & Bricks', 'Ores', 'Ore Blocks', 'Copper', 'Colorful', 'Glass', 'Nether & End', 'Utility & Fun', 'Other']

/** Full blocks that are really plants go in the Plants tab instead. */
const AUTO_PLANT_GROUPS: [group: string, test: RegExp][] = [
  ['Leaves', /_leaves$/],
  ['Mushrooms', /mushroom/],
]

/**
 * Items left out of the catalog on purpose, each with the reason shown in the extract log.
 * Checked against every item in 26.3; see README "Catalog review".
 */
const EXCLUDE_RULES: { reason: string; test: (id: string) => boolean }[] = [
  {
    reason: 'explorer map (same picture as the regular Map with different marking colors)',
    test: (id) => id.endsWith('_map') && id !== 'filled_map',
  },
  { reason: 'waxed copper (identical to the unwaxed item)', test: (id) => id.startsWith('waxed_') },
  { reason: 'identical sprite to Golden Apple (only the glint differs)', test: (id) => id === 'enchanted_golden_apple' },
  { reason: 'infested block (looks exactly like the normal block)', test: (id) => id.startsWith('infested_') },
  {
    reason: 'glass pane (mostly see-through, so cubes would only make a frame)',
    test: (id) => id === 'glass_pane' || id.endsWith('_stained_glass_pane'),
  },
  {
    reason: 'technical or creative-only item',
    test: (id) =>
      ['light', 'structure_void', 'debug_stick', 'knowledge_book', 'structure_block', 'jigsaw', 'test_block', 'test_instance_block'].includes(id),
  },
]
const excludeReason = (id: string) => EXCLUDE_RULES.find((r) => r.test(id))?.reason

const groupIndex =(groups: Record<string, string[]>) =>
  new Map(Object.entries(groups).flatMap(([group, ids]) => ids.map((id) => [id, group])))
const PLANT_GROUP_OF = groupIndex(PLANT_GROUPS)
const BLOCK_GROUP_OF = groupIndex(BLOCK_GROUPS)

/** Colors the game would tint gray textures with, using their in-inventory defaults. */
const BIOME_TINTS: Record<string, number> = {
  grass: 0x7cbd6b,
  foliage: 0x48b518,
  dry_foliage: 0xa1714d,
}

const MC_FACES = ['up', 'down', 'south', 'north', 'west', 'east'] as const
type McFace = (typeof MC_FACES)[number]
/** Strip order matches BLOCK_STRIP_ORDER in src/engine/block.ts: top, bottom, front, back, left, right. */
const STRIP_ORDER: readonly McFace[] = MC_FACES

/** `rotation` turns the texture clockwise on that face, in degrees. */
type FaceLayer = { texture: string; tint: number; rotation: number }
type Resolved =
  | { kind: 'flat'; textures: Record<string, string> }
  | { kind: 'cube'; faces: Record<McFace, FaceLayer[]>; orientable: boolean }

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

interface JarReader {
  read(path: string): Buffer | null
  readJson(path: string): Json | null
  /** A 16-wide texture by model reference, e.g. "block/dirt". */
  readTexture(ref: string): PNG | null
  resolveModel(ref: string): Resolved | null
}

/** Reads models and textures out of one client jar (1.13 or newer layout). */
function jarReader(jar: AdmZip): JarReader {
  const read = (path: string): Buffer | null => jar.getEntry(path)?.getData() ?? null
  const readJson = (path: string): Json | null => {
    const buf = read(path)
    return buf ? JSON.parse(buf.toString('utf8')) : null
  }
  const readTexture = (ref: string): PNG | null => {
    const buf = read(`assets/minecraft/textures/${strip(ref)}.png`)
    if (!buf) return null
    const png = PNG.sync.read(buf)
    // Animated textures stack frames vertically; composite() only reads the first 16×16.
    return png.width === 16 ? png : null
  }

  /** Follows `parent` links to either a flat sprite model or a single full-size cube. */
  const resolveModel = (ref: string): Resolved | null => {
    const textures: Record<string, string> = {}
    let elements: Json[] | undefined
    let current: string | undefined = strip(ref)
    for (let depth = 0; current && depth < 10; depth++) {
      if (current === 'builtin/generated' || current === 'item/generated') return { kind: 'flat', textures }
      const model = readJson(`assets/minecraft/models/${current}.json`)
      if (!model) return null
      // Newer versions may write a texture as { sprite, force_translucent } instead of a string.
      for (const [k, v] of Object.entries<string | Json>(model.textures ?? {})) textures[k] ??= typeof v === 'string' ? v : v.sprite
      elements ??= model.elements
      current = model.parent ? strip(model.parent) : undefined
    }
    if (!elements?.length) return null

    const lookup = (value: string): string | null => {
      let v: string | undefined = value
      for (let i = 0; v?.startsWith('#') && i < 10; i++) v = textures[v.slice(1)]
      return v && !v.startsWith('#') ? v : null
    }
    const faces = Object.fromEntries(MC_FACES.map((f) => [f, [] as FaceLayer[]])) as Record<McFace, FaceLayer[]>
    for (const el of elements) {
      const full = el.from.every((n: number) => n === 0) && el.to.every((n: number) => n === 16)
      if (!full || el.rotation) return null
      for (const [face, def] of Object.entries<Json>(el.faces ?? {})) {
        if (def.uv && def.uv.join() !== '0,0,16,16') return null
        const texture = lookup(def.texture)
        if (!texture) return null
        faces[face as McFace].push({ texture, tint: def.tintindex ?? -1, rotation: def.rotation ?? 0 })
      }
    }
    if (MC_FACES.some((f) => faces[f].length === 0)) return null
    return { kind: 'cube', faces, orientable: 'front' in textures }
  }

  return { read, readJson, readTexture, resolveModel }
}

/** Draws a flat item: each `layerN` texture on top of the last, tinted by `tints[N]`. Null if nothing shows. */
function renderFlat(reader: JarReader, textures: Record<string, string>, tints: Json[]): PNG | null {
  const out = new PNG({ width: 16, height: 16 })
  for (let layer = 0; textures[`layer${layer}`]; layer++) {
    const png = reader.readTexture(textures[`layer${layer}`])
    if (!png) break
    composite(out, png, tintColor(tints[layer]))
  }
  return out.data.some((_, i) => i % 4 === 3 && out.data[i] > 0) ? out : null
}

/** Draws the six faces of a full block, turned so its front faces the viewer, as a strip plus the front face alone. */
function renderCube(reader: JarReader, resolved: Extract<Resolved, { kind: 'cube' }>, tints: Json[]): { strip: PNG; front: PNG } {
  const faceImages = Object.fromEntries(
    MC_FACES.map((face) => {
      const out = new PNG({ width: 16, height: 16 })
      for (const layer of resolved.faces[face]) {
        const png = reader.readTexture(layer.texture)
        if (png) composite(out, rotateClockwise(png, layer.rotation), layer.tint >= 0 ? tintColor(tints[layer.tint]) : null)
      }
      fillTransparent(out)
      return [face, out]
    }),
  ) as Record<McFace, PNG>

  // Orientable blocks (furnace, carved pumpkin…) face north in the model. Turn them to face the viewer.
  if (resolved.orientable) {
    ;[faceImages.north, faceImages.south] = [faceImages.south, faceImages.north]
    ;[faceImages.west, faceImages.east] = [faceImages.east, faceImages.west]
    rotate180(faceImages.up)
    rotate180(faceImages.down)
  }

  const stripPng = new PNG({ width: 16 * STRIP_ORDER.length, height: 16 })
  STRIP_ORDER.forEach((face, i) => PNG.bitblt(faceImages[face], stripPng, 0, 0, 16, 16, i * 16, 0))
  return { strip: stripPng, front: faceImages.south }
}

/** Flower pot + dirt textures side by side, as src/engine/flower.ts expects. */
function renderPot(potTexture: PNG | null, dirtTexture: PNG | null): PNG {
  if (!potTexture || !dirtTexture) throw new Error('Missing flower pot or dirt texture')
  const pot = new PNG({ width: 32, height: 16 })
  PNG.bitblt(potTexture, pot, 0, 0, 16, 16, 0, 0)
  PNG.bitblt(dirtTexture, pot, 0, 0, 16, 16, 16, 0)
  return pot
}

function main(reader: JarReader, jar: AdmZip): { items: CatalogItem[]; tints: Map<string, Json[]> } {
  const { read, readJson } = reader
  const lang = readJson('assets/minecraft/lang/en_us.json') ?? {}

  /** Finds the model the inventory shows inside an item definition (skipping in-hand and in-use variants). */
  const findModel = (node: Json): Json | null => {
    if (!node || typeof node !== 'object') return null
    const type = strip(node.type ?? '')
    if (type === 'model') return node
    // Items like spears and tridents use a different model in hand; the inventory icon is the "gui" case.
    if (type === 'select' && strip(node.property ?? '') === 'display_context') {
      const gui = (node.cases ?? []).find((c: Json) => [c.when].flat().includes('gui'))
      const found = gui && findModel(gui.model)
      if (found) return found
    }
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
  let cubes = 0
  const excluded = new Map<string, string[]>()
  /** Full blocks picked up automatically (not in a pinned list), as "category|group|name". */
  const autoAdded: string[] = []
  const tintsById = new Map<string, Json[]>()
  for (const id of ids) {
    const reason = excludeReason(id)
    if (reason) {
      excluded.set(reason, [...(excluded.get(reason) ?? []), id])
      continue
    }
    const model = findModel(readJson(`${prefix}${id}.json`)!.model)
    const resolved = model && reader.resolveModel(model.model)
    const tints: Json[] = model?.tints ?? []
    tintsById.set(id, tints)
    const name = lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`] ?? id
    const plantGroup = PLANT_GROUP_OF.get(id)
    const blockGroup = BLOCK_GROUP_OF.get(id)

    if (resolved?.kind === 'flat' && resolved.textures.layer0) {
      const out = renderFlat(reader, resolved.textures, tints)
      if (!out) {
        skipped++
        continue
      }
      writeFileSync(join(OUT_ITEMS, `${id}.png`), PNG.sync.write(out))
      items.push({
        id,
        name,
        category: plantGroup ? 'plant' : 'item',
        ...(plantGroup && { group: plantGroup }),
        texture: `textures/items/${id}.png`,
        ...(plantGroup === 'Flowers' && {
          flower: { pottable: read(`assets/minecraft/models/block/potted_${id}.json`) !== null },
        }),
      })
    } else if (resolved?.kind === 'cube') {
      const autoPlant = plantGroup ? undefined : AUTO_PLANT_GROUPS.find(([, re]) => re.test(id))?.[0]
      const group =
        plantGroup ?? autoPlant ?? blockGroup ?? AUTO_BLOCK_GROUPS.find(([, re]) => re.test(id))?.[0] ?? 'Other'
      const isPlant = !!(plantGroup ?? autoPlant)
      if (!plantGroup && !blockGroup) autoAdded.push(`${isPlant ? 'plant' : 'block'}|${group}|${name}`)
      const { strip: stripPng, front } = renderCube(reader, resolved, tints)
      writeFileSync(join(OUT_BLOCKS, `${id}.png`), PNG.sync.write(stripPng))
      writeFileSync(join(OUT_ITEMS, `${id}.png`), PNG.sync.write(front))
      cubes++
      items.push({
        id,
        name,
        category: isPlant ? 'plant' : 'block',
        group,
        texture: `textures/items/${id}.png`,
        block: `textures/blocks/${id}.png`,
      })
    } else {
      skipped++
    }
  }
  writeFileSync(OUT_POT, PNG.sync.write(renderPot(reader.readTexture('block/flower_pot'), reader.readTexture('block/dirt'))))

  for (const [reason, list] of excluded) console.log(`Excluded ${list.length} × ${reason}: ${list.join(', ')}`)
  writeFileSync(join(CACHE, 'auto-added-blocks.txt'), autoAdded.sort().join('\n'))
  console.log(`Auto-added ${autoAdded.length} full blocks (list in scripts/.cache/auto-added-blocks.txt).`)
  console.log(`Wrote ${items.length - cubes} flat items and ${cubes} 3D blocks. Skipped ${skipped} other models.`)
  return { items, tints: tintsById }
}

/**
 * Classic look: the last textures before the 1.14 texture update. 1.13.2 already uses today's
 * names, so each current item is looked up by id (plus a few renames) and kept only if it looks different.
 */
const CLASSIC_VERSION = '1.13.2'
const CLASSIC_RENAMES: Record<string, string> = {
  short_grass: 'grass',
  turtle_scute: 'scute',
  oak_sign: 'sign',
  red_dye: 'rose_red',
  green_dye: 'cactus_green',
  yellow_dye: 'dandelion_yellow',
}
const OUT_CLASSIC = join(ROOT, 'public', 'textures', 'classic')

function addClassicTextures(items: CatalogItem[], tintsById: Map<string, Json[]>, classic: JarReader): number {
  mkdirSync(join(OUT_CLASSIC, 'items'), { recursive: true })
  mkdirSync(join(OUT_CLASSIC, 'blocks'), { recursive: true })
  const samePng = (a: PNG, file: string) => Buffer.compare(a.data, PNG.sync.read(readFileSync(join(ROOT, 'public', file))).data) === 0
  let count = 0

  for (const item of items) {
    // Spawn eggs were tinted in code before 1.14, so their old models are plain gray.
    if (item.id.endsWith('_spawn_egg')) continue
    const resolved = classic.resolveModel(`item/${CLASSIC_RENAMES[item.id] ?? item.id}`)
    const tints = tintsById.get(item.id) ?? []

    if (item.block && resolved?.kind === 'cube') {
      const { strip: stripPng, front } = renderCube(classic, resolved, tints)
      if (samePng(stripPng, item.block)) continue
      writeFileSync(join(OUT_CLASSIC, 'blocks', `${item.id}.png`), PNG.sync.write(stripPng))
      writeFileSync(join(OUT_CLASSIC, 'items', `${item.id}.png`), PNG.sync.write(front))
      item.classic = { texture: `textures/classic/items/${item.id}.png`, block: `textures/classic/blocks/${item.id}.png` }
      count++
    } else if (!item.block && resolved?.kind === 'flat') {
      const out = renderFlat(classic, resolved.textures, tints)
      if (!out || samePng(out, item.texture)) continue
      writeFileSync(join(OUT_CLASSIC, 'items', `${item.id}.png`), PNG.sync.write(out))
      item.classic = { texture: `textures/classic/items/${item.id}.png` }
      count++
    }
  }
  writeFileSync(join(OUT_CLASSIC, 'pot.png'), PNG.sync.write(renderPot(classic.readTexture('block/flower_pot'), classic.readTexture('block/dirt'))))
  return count
}

/**
 * The Rose: the red flower until 1.7.2 replaced it with the Poppy. It's no longer in the game, so its texture
 * comes from 1.6.4, the last version that had it, and it's listed with the other flowers.
 */
const ROSE = { version: '1.6.4', path: 'assets/minecraft/textures/blocks/flower_rose.png' }

async function addRose(items: CatalogItem[]): Promise<void> {
  const buf = (await downloadJar(ROSE.version)).jar.getEntry(ROSE.path)?.getData()
  if (!buf) throw new Error(`The Rose texture is missing from ${ROSE.version}`)
  const out = new PNG({ width: 16, height: 16 })
  composite(out, PNG.sync.read(buf), null)
  writeFileSync(join(OUT_ITEMS, 'rose.png'), PNG.sync.write(out))
  items.push({
    id: 'rose',
    name: 'Rose',
    category: 'plant',
    group: 'Flowers',
    texture: 'textures/items/rose.png',
    flower: { pottable: true },
    note: `Removed from the game in 1.7.2, when the Poppy replaced it. Texture from Minecraft ${ROSE.version}.`,
  })
  items.sort((a, b) => a.id.localeCompare(b.id))
}

function tintColor(tint: Json | undefined): number | null {
  if (!tint) return null
  const type = strip(tint.type ?? '')
  if (type === 'constant') return tint.value & 0xffffff
  if (type in BIOME_TINTS) return BIOME_TINTS[type]
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

/** A real cube can't have holes, so see-through pixels (leaves) take the face's average color. */
function fillTransparent(png: PNG): void {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 128) continue
    r += png.data[i]
    g += png.data[i + 1]
    b += png.data[i + 2]
    n++
  }
  const avg = n ? [r / n, g / n, b / n].map(Math.round) : [128, 128, 128]
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] >= 128) png.data[i + 3] = 255
    else png.data.set([...avg, 255], i)
  }
}

/** Copy of the first 16×16 frame, turned clockwise by 0, 90, 180 or 270 degrees. */
function rotateClockwise(src: PNG, degrees: number): PNG {
  const turns = (((degrees / 90) % 4) + 4) % 4
  if (turns === 0) return src
  const out = new PNG({ width: 16, height: 16 })
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // Walk back from the output pixel to where it came from, one quarter turn at a time.
      let sx = x
      let sy = y
      for (let t = 0; t < turns; t++) [sx, sy] = [sy, 15 - sx]
      src.data.copy(out.data, (y * 16 + x) * 4, (sy * 16 + sx) * 4, (sy * 16 + sx) * 4 + 4)
    }
  }
  return out
}

function rotate180(png: PNG): void {
  const copy = Buffer.from(png.data)
  const pixels = png.width * png.height
  for (let p = 0; p < pixels; p++) copy.copy(png.data, p * 4, (pixels - 1 - p) * 4, (pixels - p) * 4)
}

const { version, jar } = await downloadJar(process.argv[2])
for (const dir of [OUT_ITEMS, OUT_BLOCKS, OUT_CLASSIC]) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}
mkdirSync(dirname(OUT_INDEX), { recursive: true })
const { items, tints } = main(jarReader(jar), jar)

const classicCount = addClassicTextures(items, tints, jarReader((await downloadJar(CLASSIC_VERSION)).jar))
console.log(`Classic (${CLASSIC_VERSION}) textures for ${classicCount} items that looked different.`)

await addRose(items)

const found = new Set(items.map((i) => i.id))
for (const [label, index] of [['plants', PLANT_GROUP_OF], ['blocks', BLOCK_GROUP_OF]] as const) {
  const missing = [...index.keys()].filter((id) => !found.has(id))
  if (missing.length) console.log(`Listed ${label} that aren't flat items or full cubes: ${missing.join(', ')}`)
}
writeFileSync(
  OUT_INDEX,
  JSON.stringify({
    version,
    groups: { plant: Object.keys(PLANT_GROUPS), block: BLOCK_GROUP_ORDER },
    pot: 'textures/pot.png',
    classicPot: 'textures/classic/pot.png',
    classicVersion: CLASSIC_VERSION,
    items,
  }),
)
console.log(`Minecraft ${version} → ${OUT_INDEX}`)
