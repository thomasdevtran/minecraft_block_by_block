import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hashFiles } from '../scripts/asset-revision.ts'

let root = ''
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }) })

/** A throwaway public/ folder with the given files (path → contents). */
function fixture(files: Record<string, string | Uint8Array>) {
  root = mkdtempSync(join(tmpdir(), 'asset-revision-'))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), contents)
  }
  return root
}
const dirs = ['public/textures', 'public/data/shapes']

describe('asset revision', () => {
  it('changes when any covered file changes, even with the game version unchanged', () => {
    const files = {
      'public/textures/items/rose.png': new Uint8Array([1, 2, 3]),
      'public/data/shapes/chest.json': '{"w":14}',
    }
    const before = hashFiles(fixture(files), dirs)
    expect(before).toMatch(/^[0-9a-f]{12}$/)
    rmSync(root, { recursive: true })
    expect(hashFiles(fixture({ ...files, 'public/textures/items/rose.png': new Uint8Array([1, 2, 4]) }), dirs)).not.toBe(before)
    rmSync(root, { recursive: true })
    expect(hashFiles(fixture(files), dirs)).toBe(before)
  })

  it('notices a renamed or added file, not only changed bytes', () => {
    const base = hashFiles(fixture({ 'public/textures/a.png': 'x' }), dirs)
    rmSync(root, { recursive: true })
    expect(hashFiles(fixture({ 'public/textures/b.png': 'x' }), dirs)).not.toBe(base)
    rmSync(root, { recursive: true })
    expect(hashFiles(fixture({ 'public/textures/a.png': 'x', 'public/textures/c.png': 'y' }), dirs)).not.toBe(base)
  })

  it('gives a Windows checkout and CI the same revision', () => {
    const lf = hashFiles(fixture({ 'public/data/shapes/chest.json': '{\n"w": 14\n}\n', 'public/textures/.DS_Store': 'mac', 'public/textures/Thumbs.db': 'win' }), dirs)
    rmSync(root, { recursive: true })
    expect(hashFiles(fixture({ 'public/data/shapes/chest.json': '{\r\n"w": 14\r\n}\r\n' }), dirs)).toBe(lf)
  })

  it('ignores folders that are not there', () => {
    expect(hashFiles(fixture({ 'public/textures/a.png': 'x' }), [...dirs, 'public/missing'])).toBe(hashFiles(root, dirs))
  })
})
