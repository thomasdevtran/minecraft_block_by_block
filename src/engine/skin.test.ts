import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { loadPixels } from './pixels'
import { loadSkinPixels, readSkinPng } from './skin'

vi.mock('./pixels', async (importOriginal) => ({ ...await importOriginal<typeof import('./pixels')>(), loadPixels: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('skin image boundary', () => {
  it.each([32, 64])('accepts a supported 64×%i PNG', async height => {
    const blob = new Blob([new Uint8Array(PNG.sync.write(new PNG({ width: 64, height })))], { type: 'image/png' })
    expect(await readSkinPng(blob)).toBe(blob)
  })

  it('rejects oversized files before decoding pixels', async () => {
    await expect(loadSkinPixels(new Blob([new Uint8Array(1024 * 1024 + 1)]))).rejects.toThrow('1 MB')
    expect(loadPixels).not.toHaveBeenCalled()
  })

  it('rejects image dimensions forged into a small PNG before decoding pixels', async () => {
    const bytes = PNG.sync.write(new PNG({ width: 64, height: 64 }))
    bytes.writeUInt32BE(1_000_000, 16)
    await expect(loadSkinPixels(new Blob([new Uint8Array(bytes)]))).rejects.toThrow('64×64 or 64×32')
    expect(loadPixels).not.toHaveBeenCalled()
  })

  it.each([new Uint8Array(0), new Uint8Array(33), new TextEncoder().encode('<svg onload="bad()"></svg>')])('rejects invalid PNG content', async bytes => {
    await expect(loadSkinPixels(new Blob([bytes]))).rejects.toThrow('valid PNG')
    expect(loadPixels).not.toHaveBeenCalled()
  })

  it('reads a saved skin data URL without a network request', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const bytes = PNG.sync.write(new PNG({ width: 64, height: 64 }))
    const blob = await readSkinPng(`data:image/png;base64,${bytes.toString('base64')}`)
    expect(blob.size).toBe(bytes.length)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed data URL contents', async () => {
    await expect(readSkinPng('data:image/png;base64,%%%not-base64')).rejects.toThrow('valid skin PNG')
  })

  it('rejects a URL supplied in place of local skin data before making a request', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(readSkinPng('https://elsewhere.test/image.png')).rejects.toThrow('valid skin PNG')
    expect(fetch).not.toHaveBeenCalled()
  })
})
