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
  /** Hash of every texture and shape file (scripts/asset-revision.ts); tags their URLs. */
  assetRevision?: string
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
 * Texture and shape filenames never change, but their contents do, so their URLs carry the
 * catalog's asset revision, a hash of the files. That lets browsers and the CDN cache them for a
 * year and still fetch new bytes the moment any file changes. Older catalogs without a revision
 * fall back to the game version.
 */
let assetVersion = ''

/** Loads the index written by `npm run extract`. */
export const loadCatalog = async (): Promise<Catalog> => {
  const catalog = await rawCatalog()
  assetVersion = catalog.assetRevision ?? catalog.version
  return catalog
}

/**
 * Turns a path from items.json into a cache-busted absolute URL. Only call it after loadCatalog():
 * before, there's no revision to add. Development stops on that mistake; a deployed site serves the
 * untagged path, which vercel.json revalidates on every visit instead of caching for a year.
 */
export function assetUrl(path: string): string {
  if (!assetVersion && import.meta.env.DEV) throw new Error(`assetUrl('${path}') ran before loadCatalog().`)
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
