import catalogData from '../../public/data/items.json'
import { describe, expect, it } from 'vitest'
import type { Catalog } from './catalog'
import { catalogSearchText, matchesCatalogSearch } from './catalogSearch'

const catalog = catalogData as Catalog
const find = (query: string) => catalog.items.filter(item => matchesCatalogSearch(catalogSearchText(item), query)).map(item => item.id)

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
