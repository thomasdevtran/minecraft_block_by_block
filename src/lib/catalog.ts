export interface CatalogItem {
  id: string
  name: string
  texture: string
  category: 'item' | 'plant'
}

export interface Catalog {
  version: string
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
