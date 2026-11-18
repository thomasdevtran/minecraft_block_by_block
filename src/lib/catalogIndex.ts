import type { Catalog, CatalogItem, Category } from './catalog'

export type IndexedCatalogItem = CatalogItem & { search: string }

interface CategorySummary {
  count: number
  groups: { name: string; count: number }[]
}

export interface CatalogIndex {
  items: readonly IndexedCatalogItem[]
  byId: ReadonlyMap<string, IndexedCatalogItem>
  categories: Record<Category, CategorySummary>
}

/** Catalog metadata is replaced as a whole; derived counts never need deep reactivity. */
export function indexCatalog(items: readonly CatalogItem[], groupOrder: Catalog['groups']): CatalogIndex {
  const categories: Record<Category, CategorySummary> = {
    item: { count: 0, groups: [] },
    plant: { count: 0, groups: [] },
    block: { count: 0, groups: [] },
  }
  const counts: Record<Category, Map<string, number>> = { item: new Map(), plant: new Map(), block: new Map() }
  const byId = new Map<string, IndexedCatalogItem>()
  const indexed = items.map(item => {
    const entry = { ...item, search: catalogSearchText(item) }
    // Keep the first match, as the previous Array.find lookups did.
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
    categories[item.category].count++
    if (item.group !== undefined) {
      const groups = counts[item.category]
      groups.set(item.group, (groups.get(item.group) ?? 0) + 1)
    }
    return entry
  })
  for (const category of ['item', 'plant', 'block'] as const) {
    categories[category].groups = (groupOrder[category] ?? []).flatMap(name => {
      const count = counts[category].get(name) ?? 0
      return count ? [{ name, count }] : []
    })
  }
  return { items: indexed, byId, categories }
}

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

/** Prepare once per query change, then reuse for every catalog entry. */
export function prepareCatalogSearch(query: string): (search: string) => boolean {
  const words = normalize(query).split(' ')
  return search => words.every(word => search.includes(word))
}
