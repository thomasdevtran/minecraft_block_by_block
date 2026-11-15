import { loader } from './loader'
import type { Look } from './buildSettings'

export type Category = 'item' | 'plant' | 'block'

/** The fields a guide needs to build something. */
export interface BuildableItem {
  id: string
  name: string
  /** Flat 16×16 sprite. For blocks, this is the front face. */
  texture: string
  /** Six-face strip for building the item as a 3D cube, when it is a full block. */
  block?: string
  /** Voxel geometry for craft shapes that are not a full textured block. */
  shape?: string
  /** Flowers can also be built as a 3D crossed plant, and most can go in a pot. */
  flower?: { pottable: boolean }
  /** Pre-1.14 textures, only when they look different from today's. */
  classic?: { texture: string; block?: string }
  /** Extra background shown on the guide, e.g. for items no longer in the game. */
  note?: string
}

export interface CatalogItem extends BuildableItem {
  category: Category
  /** Sub-group inside each catalog tab. */
  group?: string
  aliases?: string[]
}

export interface Catalog {
  version: string
  /** Sub-groups per tab, in display order. */
  groups: Partial<Record<Category, string[]>>
  /** Flower pot + dirt textures for potted flowers. */
  pot: string
  classicPot: string
  /** The Minecraft version the classic textures come from. */
  classicVersion: string
  items: CatalogItem[]
}

const rawCatalog = loader<Catalog>('/data/items.json', 'The build catalog could not be loaded. Check your connection and try again.')

/**
 * Texture filenames never change, but their contents do when the game version moves, so the paths
 * carry the version as a query. That lets the CDN cache them forever and still hand out the new
 * pictures the moment `npm run extract` bumps the version.
 */
let assetVersion = ''

/** Loads the index written by `npm run extract`. */
export const loadCatalog = async (): Promise<Catalog> => {
  const catalog = await rawCatalog()
  assetVersion = catalog.version
  return catalog
}

/** Turns a path from items.json into a cache-busted absolute URL. */
export function assetUrl(path: string): string {
  return assetVersion ? `/${path}?v=${assetVersion}` : `/${path}`
}

const useClassic = (item: BuildableItem, look: Look) => look === 'classic' && !!item.classic

export function textureUrl(item: BuildableItem, look: Look = 'current'): string {
  return assetUrl(useClassic(item, look) ? item.classic!.texture : item.texture)
}

export function blockUrl(item: BuildableItem, look: Look = 'current'): string | null {
  if (!item.block) return null
  return assetUrl(useClassic(item, look) && item.classic!.block ? item.classic!.block : item.block)
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** Extra words that find a group by what people call it ("weapons", "armour", "underwater"). */
const GROUP_KEYWORDS: Record<string, string> = {
  'Weapons & Combat': 'weapon weapons combat fighting',
  'Tools & Equipment': 'tool tools equipment mining utility utilities',
  'Armor & Wearables': 'armor armour wearable wearables protection',
  'Food & Drinks': 'food foods drink drinks eating',
  'Potions & Brewing': 'potion potions brewing magic',
  'Music & Collectibles': 'music collectibles collection disc discs trim trims pattern patterns',
  'Redstone & Transport': 'redstone transport transportation',
  'Building & Decoration': 'building decoration decorations decor',
  'Materials & Ingredients': 'materials ingredients crafting',
  'Nether Plants': 'nether plant plants fungus fungi',
  'Aquatic Plants & Coral': 'aquatic underwater ocean coral plants',
}

const normalize = (text: string) => text.toLowerCase().replace(/[_—–-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Everything an item can be found by, folded once at load so filtering stays cheap per keystroke. */
export function catalogSearchText(item: CatalogItem): string {
  return normalize([item.name, item.id, item.category, item.group, GROUP_KEYWORDS[item.group ?? ''], ...(item.aliases ?? [])].filter(Boolean).join(' '))
}

/** True when every word of `query` appears in the item's search text. */
export function matchesCatalogSearch(search: string, query: string): boolean {
  return normalize(query).split(' ').every(word => search.includes(word))
}
