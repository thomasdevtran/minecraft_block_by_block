import catalogData from '../../public/data/items.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from './catalog'
import { catalogSearchText, indexCatalog, prepareCatalogSearch } from './catalogIndex'

const catalog = catalogData as Catalog
const find = (query: string) => {
  const matches = prepareCatalogSearch(query)
  return catalog.items.filter(item => matches(catalogSearchText(item))).map(item => item.id)
}

describe('catalog discovery', () => {
  it('finds weapons, food and natural multi-word item names', () => {
    expect(find('weapons')).toContain('diamond_sword')
    expect(find('food')).toContain('cookie')
    expect(find('diamond sword')).toContain('diamond_sword')
    expect(find('armour')).toContain('diamond_helmet')
    expect(find('enchanted golden apple')).toEqual(['golden_apple'])
    expect(find('not an actual item qxz')).toEqual([])
  })
  it('places recent plants in their expected groups without turning ground cover into crossed flowers', () => {
    for (const id of ['torchflower', 'pitcher_plant', 'open_eyeblossom', 'cactus_flower', 'wildflowers', 'pink_petals']) {
      expect(catalog.items.find(item => item.id === id)).toMatchObject({ category: 'plant', group: 'Flowers' })
    }
    for (const id of ['cherry_sapling', 'pale_oak_sapling', 'poplar_sapling']) expect(catalog.items.find(item => item.id === id)?.group).toBe('Saplings')
    expect(catalog.items.find(item => item.id === 'pink_petals')?.flower).toBeUndefined()
  })
  it('gives every item a valid group and gives collectibles distinct names', () => {
    for (const item of catalog.items) expect(catalog.groups[item.category]).toContain(item.group)
    const discs = catalog.items.filter(item => item.id.startsWith('music_disc_'))
    expect(new Set(discs.map(item => item.name)).size).toBe(discs.length)
    expect(catalog.items.find(item => item.id === 'music_disc_pigstep')?.name).toBe('Music Disc — Pigstep')
    expect(catalog.items.find(item => item.id === 'silence_armor_trim_smithing_template')?.name).toBe('Silence Armor Trim')
    expect(catalog.items.find(item => item.id === 'creeper_banner_pattern')?.name).toBe('Banner Pattern — Creeper Charge')
  })
})

describe('catalog index compatibility', () => {
  const index = indexCatalog(catalog.items, catalog.groups)

  it('preserves ordered search results and query normalization', () => {
    // Original predicate, kept independent of the prepared-query implementation.
    const legacyMatches = (search: string, query: string) => query.toLowerCase()
      .replace(/[_—–-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
      .every(word => search.includes(word))
    for (const query of ['', '   ', 'DIAMOND_SWORD', ' diamond  sword ', 'diamond—sword', 'diamond–sword',
      'armour', 'underwater', 'enchanted golden apple', 'music disc', 'not an actual item qxz', 'é']) {
      const matches = prepareCatalogSearch(query)
      expect(index.items.filter(item => matches(item.search)).map(item => item.id))
        .toEqual(index.items.filter(item => legacyMatches(item.search, query)).map(item => item.id))
    }
  })

  it('preserves category counts, nonempty group order, lookups and source metadata', () => {
    const before = JSON.stringify(catalog)
    for (const category of ['item', 'plant', 'block'] as const) {
      const entries = catalog.items.filter(item => item.category === category)
      expect(index.categories[category]).toEqual({
        count: entries.length,
        groups: (catalog.groups[category] ?? []).map(name => ({
          name, count: entries.filter(item => item.group === name).length,
        })).filter(group => group.count > 0),
      })
    }
    for (const item of catalog.items) expect(index.byId.get(item.id)).toEqual({ ...item, search: catalogSearchText(item) })
    expect(JSON.stringify(catalog)).toBe(before)
    expect(indexCatalog([], {}).items).toEqual([])
    const first = catalog.items[0]!
    expect(indexCatalog([first, { ...first, name: 'Duplicate' }], {}).byId.get(first.id)?.name).toBe(first.name)
  })
})

describe('asset URLs', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
  /** A fresh catalog module whose catalog request answers with `fields`. */
  async function catalogModule(fields: Partial<Catalog>) {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...catalog, ...fields }))))
    return import('./catalog')
  }

  it('tags textures and shapes with the asset revision, so changed files get new URLs', async () => {
    const { assetUrl, loadCatalog } = await catalogModule({ version: '26.3', assetRevision: 'abc123def456' })
    await loadCatalog()
    expect(assetUrl('textures/items/rose.png')).toBe('/textures/items/rose.png?v=abc123def456')
    expect(assetUrl('data/shapes/chest.json')).toBe('/data/shapes/chest.json?v=abc123def456')
  })

  it('falls back to the game version for a catalog written before revisions existed', async () => {
    const { assetUrl, loadCatalog } = await catalogModule({ version: '26.3', assetRevision: undefined })
    await loadCatalog()
    expect(assetUrl('textures/pot.png')).toBe('/textures/pot.png?v=26.3')
  })

  it('refuses in development to build an untagged URL before the catalog loads', async () => {
    const { assetUrl } = await catalogModule({})
    expect(() => assetUrl('textures/steve.png')).toThrow(/before loadCatalog/)
  })
})
