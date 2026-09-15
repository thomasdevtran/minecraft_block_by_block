export type Category = 'item' | 'plant' | 'block'

export interface CatalogItem {
  id: string
  name: string
  category: Category
  /** Sub-group inside the Plants or Blocks tab (Flowers, Ores…). */
  group?: string
  /** Flat 16×16 sprite. For blocks, this is the front face. */
  texture: string
  /** Six-face strip for building the item as a 3D cube, when it is a full block. */
  block?: string
  /** Flowers can also be built as a 3D crossed plant, and most can go in a pot. */
  flower?: { pottable: boolean }
}

export interface Catalog {
  version: string
  /** Flower pot + dirt textures for potted flowers. */
  pot: string
  /** Sub-groups per tab, in display order. */
  groups: Partial<Record<Category, string[]>>
  items: CatalogItem[]
}

let pending: Promise<Catalog> | null = null

/** Loads the index written by `npm run extract`. */
export function loadCatalog(): Promise<Catalog> {
  pending ??= fetch('/data/items.json').then((res) => {
    if (!res.ok) throw new Error('Item list is missing. Run `npm run extract` first.')
    return res.json() as Promise<Catalog>
  })
  pending.catch(() => (pending = null))
  return pending
}

export function textureUrl(item: CatalogItem): string {
  return `/${item.texture}`
}

export function blockUrl(item: CatalogItem): string | null {
  return item.block ? `/${item.block}` : null
}

/** Short label of the build styles an item supports, e.g. "2D · 3D · Pot". */
export function buildStyles(item: CatalogItem): string | null {
  if (item.block) return '2D · 3D'
  if (item.flower) return item.flower.pottable ? '2D · 3D · Pot' : '2D · 3D'
  return null
}
