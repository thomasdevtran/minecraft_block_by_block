import type { CatalogItem } from './catalog'

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

export function catalogSearchText(item: CatalogItem): string {
  return normalize([item.name, item.id, item.category, item.group, GROUP_KEYWORDS[item.group ?? ''], ...(item.aliases ?? [])].filter(Boolean).join(' '))
}

export function matchesCatalogSearch(search: string, query: string): boolean {
  return normalize(query).split(' ').every(word => search.includes(word))
}
