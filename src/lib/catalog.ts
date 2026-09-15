import type { Look } from './look'

export type Category = 'item' | 'plant' | 'block'

/** The fields every buildable thing has, whether it's in the game today or was removed. */
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

export interface RemovedItem extends BuildableItem {
  category: 'item' | 'plant'
  /** The Minecraft version the texture was taken from. */
  source: string
  /** What happened to it. */
  note: string
}

export interface RemovedCatalog {
  pot: string
  items: RemovedItem[]
}

function loader<T>(url: string): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= fetch(url).then((res) => {
      if (!res.ok) throw new Error('Item list is missing. Run `npm run extract` first.')
      return res.json() as Promise<T>
    })
    pending.catch(() => (pending = null))
    return pending
  }
}

/** Loads the index written by `npm run extract`. */
export const loadCatalog = loader<Catalog>('/data/items.json')
export const loadRemoved = loader<RemovedCatalog>('/data/removed.json')

const useClassic = (item: BuildableItem, look: Look) => look === 'classic' && !!item.classic

export function textureUrl(item: BuildableItem, look: Look = 'current'): string {
  return `/${useClassic(item, look) ? item.classic!.texture : item.texture}`
}

export function blockUrl(item: BuildableItem, look: Look = 'current'): string | null {
  if (!item.block) return null
  return `/${useClassic(item, look) && item.classic!.block ? item.classic!.block : item.block}`
}

/** Short label of the build styles an item supports, e.g. "2D · 3D · Pot". */
export function buildStyles(item: BuildableItem): string | null {
  if (item.block) return '2D · 3D'
  if (item.flower) return item.flower.pottable ? '2D · 3D · Pot' : '2D · 3D'
  return null
}
