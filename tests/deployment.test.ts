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
  it('marks only hashed or versioned files as immutable', () => {
    // /assets/ names carry Vite's content hash, and textures are requested with ?v=<game version>
    // (assetUrl in src/lib/catalog.ts). Craft photos keep their names when replaced, so they must
    // not be cached forever.
    const immutable = vercel.headers
      .filter((rule) => rule.headers.some((h) => h.key === 'Cache-Control' && h.value.includes('immutable')))
      .map((rule) => rule.source)
    expect(immutable.sort()).toEqual(['/assets/(.*)', '/textures/(.*)'])
  })

  it('requests every texture through the versioned asset URL', () => {
    const sources = ['src/components/BuildDemo.vue', 'src/views/SkinGuideView.vue', 'src/views/ItemGuideView.vue', 'src/views/CatalogView.vue']
    for (const file of sources) expect(readFileSync(file, 'utf8')).not.toMatch(/['"`]\/textures\//)
  })
})
