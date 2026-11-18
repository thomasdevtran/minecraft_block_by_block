/** Informational CPU comparison; no browser latency or CI timing threshold is implied. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { catalogSearchText, indexCatalog, prepareCatalogSearch } from '../src/lib/catalogIndex.ts'

const catalog = JSON.parse(readFileSync('public/data/items.json', 'utf8'))
const queries = ['', 'diamond sword', 'armour', 'underwater', 'music disc', 'DIAMOND_ORE', 'no match qxz']
const categories = ['item', 'plant', 'block']
const legacyMatches = (search, query) => query.toLowerCase()
  .replace(/[_—–-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').every(word => search.includes(word))

function medianMs(work) {
  work()
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now()
    work()
    return performance.now() - start
  }).sort((a, b) => a - b)
  return Number(samples[3].toFixed(3))
}

function compare(items) {
  const entries = items.map(item => ({ ...item, search: catalogSearchText(item) }))
  const index = indexCatalog(items, catalog.groups)
  for (const query of queries) {
    const matches = prepareCatalogSearch(query)
    assert.deepEqual(index.items.filter(item => matches(item.search)).map(item => item.id),
      entries.filter(item => legacyMatches(item.search, query)).map(item => item.id))
  }
  const legacyGroups = category => {
    const inTab = entries.filter(item => item.category === category)
    return (catalog.groups[category] ?? []).map(name => ({ name, count: inTab.filter(item => item.group === name).length })).filter(group => group.count)
  }
  for (const category of categories) assert.deepEqual(index.categories[category].groups, legacyGroups(category))
  // Consume all results so these timings include the same filtering/lookup work.
  let checksum = 0
  const searchBeforeMs = medianMs(() => {
    for (let repeat = 0; repeat < 15; repeat++) for (const query of queries) {
      const text = query.trim().toLowerCase()
      checksum += entries.filter(item => legacyMatches(item.search, text)).length
    }
  })
  const searchAfterMs = medianMs(() => {
    for (let repeat = 0; repeat < 15; repeat++) for (const query of queries) {
      const matches = prepareCatalogSearch(query)
      checksum += index.items.filter(item => matches(item.search)).length
    }
  })
  const groupsBeforeMs = medianMs(() => {
    for (let repeat = 0; repeat < 100; repeat++) for (const category of categories) checksum += legacyGroups(category).length
  })
  const groupsAfterMs = medianMs(() => {
    for (let repeat = 0; repeat < 100; repeat++) for (const category of categories) checksum += index.categories[category].groups.length
  })
  return { items: items.length,
    indexBuildBeforeMs: medianMs(() => { checksum += items.map(item => ({ ...item, search: catalogSearchText(item) })).length }),
    indexBuildAfterMs: medianMs(() => { checksum += indexCatalog(items, catalog.groups).items.length }),
    searchBeforeMs, searchAfterMs, groupsBeforeMs, groupsAfterMs, checksum }
}

const synthetic = Array.from({ length: 10_000 }, (_, i) => ({ ...catalog.items[i % catalog.items.length], id: `fixture_${i}` }))
const report = { node: process.version, queries, searchRepeats: 15, groupRepeats: 100, medianSamples: 7,
  scope: 'Node metadata CPU only; synthetic fixture is not a shipped catalog', results: [compare(catalog.items), compare(synthetic)] }
mkdirSync('performance/runs', { recursive: true })
writeFileSync('performance/runs/catalog-processing.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
