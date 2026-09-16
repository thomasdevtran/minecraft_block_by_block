import { loader } from './loader'
import type { Look } from './look'

export type Category = 'item' | 'plant' | 'block'

/** The fields a guide needs to build something. */
export interface BuildableItem {
  id: string
  name: string
  /** Flat 16×16 sprite. For blocks, this is the front face. */
  texture: string
  /** Six-face strip for building the item as a 3D cube, when it is a full block. */
  block?: string
  /** Flowers can also be built as a 3D crossed plant, and most can go in a pot. */
  flower?: { pottable: boolean }
  /** Pre-1.14 textures, only when they look different from today's. */
  classic?: { texture: string; block?: string }
  /** Extra background shown on the guide, e.g. for items no longer in the game. */
  note?: string
}

export interface CatalogItem extends BuildableItem {
  category: Category
  /** Sub-group inside the Plants or Blocks tab (Flowers, Ores…). */
  group?: string
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

/** Short label of the build styles an item supports, e.g. "2D · 3D · Pot". */
export function buildStyles(item: BuildableItem): string | null {
  if (item.block) return '2D · 3D'
  if (item.flower) return item.flower.pottable ? '2D · 3D · Pot' : '2D · 3D'
  return null
}
