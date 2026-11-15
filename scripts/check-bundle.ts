/**
 * Fails when the JavaScript every visitor downloads before the first page renders grows past the
 * budget. That is the entry script plus the chunks index.html preloads; lazy route chunks and
 * the three.js preview are not counted. Run after `npm run build`.
 *
 *   npx tsx scripts/check-bundle.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Gzipped bytes. Raise it on purpose, never just to make CI pass. */
const BUDGET = 85 * 1024

const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const urls = [
  ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
  ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
].map((match) => match[1])

if (!urls.length) throw new Error('No entry script found in dist/index.html. Run `npm run build` first.')

let total = 0
for (const url of new Set(urls)) {
  const size = gzipSync(readFileSync(join(dist, url.replace(/^\//, '')))).length
  total += size
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${url}`)
}
const summary = `Startup JavaScript: ${(total / 1024).toFixed(1)} KB gzipped (budget ${(BUDGET / 1024).toFixed(0)} KB).`
if (total > BUDGET) {
  console.error(summary)
  process.exit(1)
}
console.log(summary)
