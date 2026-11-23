/**
 * Content revisions for files that are cached for a year.
 *
 * Textures, craft shapes and craft photos keep their file names when their pictures change, so
 * their URLs carry `?v=<revision>`: a short hash of the files' contents. Any change to any of them
 * gives a new revision, the browser and CDN fetch the new bytes, and unchanged files stay cached.
 *
 *   npm run asset-revision   # after editing a texture or shape by hand: writes the new revision
 *
 * `npm run extract` writes it too, and `npm run check:catalog` fails when it's out of date.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** What the catalog's `assetRevision` covers: everything `assetUrl()` serves. */
const CATALOG_ASSET_DIRS = ['public/textures', 'public/data/shapes']
/** What the build's photo revision covers (see vite.config.ts). */
export const PHOTO_DIRS = ['public/crafts']

const TEXT = /\.(json|svg|txt)$/i
/** Editor and OS clutter that never ships as an asset. */
const IGNORED = /^(\.|thumbs\.db$|desktop\.ini$)/i

/**
 * A 12-character hex hash of every file under `dirs`, by path (with / separators) and contents.
 * Text files are hashed with LF line endings, so a Windows checkout and CI agree.
 */
export function hashFiles(root: string, dirs: string[]): string {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.test(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'))
    }
  }
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(join(root, dir))

  const hash = createHash('sha256')
  for (const file of files.sort()) {
    const bytes = readFileSync(join(root, file))
    hash.update(`${file}\0`)
    hash.update(TEXT.test(file) ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

export const catalogAssetRevision = (root = process.cwd()) => hashFiles(root, CATALOG_ASSET_DIRS)

/** Writes the current revision into public/data/items.json, leaving everything else as it was. */
function writeCatalogRevision(root = process.cwd()): string {
  const path = join(root, 'public', 'data', 'items.json')
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const assetRevision = catalogAssetRevision(root)
  writeFileSync(path, JSON.stringify({ ...catalog, assetRevision }))
  return assetRevision
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(`Asset revision ${writeCatalogRevision()} → public/data/items.json`)
}
