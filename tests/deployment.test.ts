import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Checks that vercel.json stays in step with the files it describes. */
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const header = (source: string, key: string) =>
  vercel.headers.find((rule) => rule.source === source)?.headers.find((h) => h.key === key)?.value ?? ''

describe('content security policy', () => {
  it('allows exactly the inline theme script in index.html', () => {
    const html = readFileSync('index.html', 'utf8')
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
    expect(inline).toHaveLength(1)
    const hash = createHash('sha256').update(inline[0]).digest('base64')
    // If this fails after editing the script, put the new hash in vercel.json's script-src.
    expect(header('/(.*)', 'Content-Security-Policy')).toContain(`'sha256-${hash}'`)
  })
})

describe('caching', () => {
  type Rule = (typeof vercel.headers)[number] & { has?: { type: string; key: string }[]; missing?: { type: string; key: string }[] }
  const rules = vercel.headers as Rule[]
  const cacheControl = (rule: Rule) => rule.headers.find((h) => h.key === 'Cache-Control')?.value ?? ''
  const taggedWithV = (list?: { type: string; key: string }[]) => !!list?.some((c) => c.type === 'query' && c.key === 'v')

  it('caches for a year only files whose URL changes with their content', () => {
    // /assets/ names carry Vite's content hash. Textures and shapes are requested with
    // ?v=<asset revision> (assetUrl in src/lib/catalog.ts) and craft photos with ?v=<photo revision>
    // (CraftPhoto.vue), so those rules only apply when the query is there.
    const immutable = rules.filter((rule) => cacheControl(rule).includes('immutable'))
    expect(immutable.map((rule) => rule.source).sort()).toEqual(['/assets/(.*)', '/crafts/(.*)', '/data/shapes/(.*)', '/textures/(.*)'])
    for (const rule of immutable) if (rule.source !== '/assets/(.*)') expect(taggedWithV(rule.has), rule.source).toBe(true)
  })

  it('keeps revalidating shapes and photos requested without a revision', () => {
    for (const source of ['/data/shapes/(.*)', '/crafts/(.*)']) {
      const untagged = rules.find((rule) => rule.source === source && taggedWithV(rule.missing))
      expect(untagged, source).toBeDefined()
      expect(cacheControl(untagged!)).not.toContain('immutable')
    }
  })

  it('requests every texture through the versioned asset URL', () => {
    const sources = ['src/components/BuildDemo.vue', 'src/views/SkinGuideView.vue', 'src/views/ItemGuideView.vue', 'src/views/CatalogView.vue', 'src/lib/demo.ts']
    for (const file of sources) expect(readFileSync(file, 'utf8')).not.toMatch(/['"`]\/textures\//)
  })
})
