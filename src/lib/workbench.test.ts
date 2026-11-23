import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildModel } from '../engine/model'
import type { Voxel } from '../engine/voxels'
import { isCubeSize } from './buildSettings'
import { buildDimensions, createWakeLock, finishedSize } from './workbench'

afterEach(() => vi.unstubAllGlobals())

describe('finished size', () => {
  const box = (points: [number, number, number][]): BuildModel => ({
    kind: 'object', palette: [], parts: [],
    voxels: points.map(([x, y, z]) => ({ x, y, z, part: 'p', lx: 0, ly: 0, lz: 0, faces: {} as Voxel['faces'], interior: false })),
  })

  it('measures assembled extents, including negative positions such as a skin head', () => {
    expect(buildDimensions(box([[0, 0, -2], [15, 31, 5]]))).toEqual({ wide: 16, deep: 8, tall: 32 })
    expect(buildDimensions(box([]))).toEqual({ wide: 0, deep: 0, tall: 0 })
  })

  it('lists flat builds as wide × tall in both units', () => {
    const rose = box([[0, 0, 0], [5, 10, 0]])
    expect(finishedSize(rose, { value: 1, unit: 'cm' })).toEqual({
      flat: true, cubes: '6 × 11', size: '6 × 11 cm', other: '2.4 × 4.3 in', axes: 'wide × tall, one cube thick',
    })
  })

  it('lists 3D builds as wide × deep × tall and converts inches to centimetres', () => {
    const block = box([[0, 0, 0], [15, 15, 15]])
    const size = finishedSize(block, { value: 0.75, unit: 'in' })
    expect(size.size).toBe('12 × 12 × 12 in')
    expect(size.other).toBe('30.5 × 30.5 × 30.5 cm')
    expect(size.axes).toBe('wide × deep × tall')
  })

  it('only accepts cube sizes in a sensible range for their unit', () => {
    expect(isCubeSize({ value: 1.5, unit: 'cm' })).toBe(true)
    expect(isCubeSize({ value: 0.75, unit: 'in' })).toBe(true)
    expect(isCubeSize({ value: 25, unit: 'cm' })).toBe(false)
    expect(isCubeSize({ value: 5, unit: 'in' })).toBe(false)
    expect(isCubeSize({ value: Number.NaN, unit: 'cm' })).toBe(false)
    expect(isCubeSize({ value: 1, unit: 'mm' })).toBe(false)
    expect(isCubeSize('1cm')).toBe(false)
  })
})

describe('createWakeLock', () => {
  function fakeBrowser(options: { refuse?: boolean } = {}) {
    const locks: { released: boolean; release: () => Promise<void>; fire: () => void }[] = []
    const request = vi.fn(async () => {
      if (options.refuse) throw new DOMException('Battery saver', 'NotAllowedError')
      let onRelease = () => {}
      const lock = {
        released: false,
        release: vi.fn(async () => { lock.released = true; onRelease() }),
        addEventListener: (_: string, fn: () => void) => { onRelease = fn },
        fire: () => onRelease(),
      }
      locks.push(lock)
      return lock
    })
    const doc = { visibilityState: 'visible' }
    vi.stubGlobal('navigator', { wakeLock: { request } })
    vi.stubGlobal('document', doc)
    return { request, locks, doc }
  }

  it('reports no support when the browser has no wake lock', async () => {
    vi.stubGlobal('navigator', {})
    const lock = createWakeLock()
    expect(lock.supported).toBe(false)
    expect(await lock.acquire()).toBe(false)
  })

  it('holds one lock even when asked twice at once', async () => {
    const browser = fakeBrowser()
    const lock = createWakeLock()
    const [a, b] = await Promise.all([lock.acquire(), lock.acquire()])
    expect([a, b]).toEqual([true, true])
    expect(browser.request).toHaveBeenCalledTimes(1)
    expect(lock.held).toBe(true)
  })

  it('asks again when the page comes back after the browser dropped the lock', async () => {
    const browser = fakeBrowser()
    const lock = createWakeLock()
    await lock.acquire()
    browser.locks[0]!.fire() // the browser releases it when the tab is hidden
    expect(lock.held).toBe(false)
    expect(await lock.resume()).toBe(true)
    expect(browser.request).toHaveBeenCalledTimes(2)
  })

  it('does not ask again after the reader switched it off', async () => {
    const browser = fakeBrowser()
    const lock = createWakeLock()
    await lock.acquire()
    await lock.release()
    expect(browser.locks[0]!.released).toBe(true)
    expect(await lock.resume()).toBe(false)
    expect(browser.request).toHaveBeenCalledTimes(1)
  })

  it('waits for a visible page and reports refusals', async () => {
    const hidden = fakeBrowser()
    hidden.doc.visibilityState = 'hidden'
    expect(await createWakeLock().acquire()).toBe(false)
    expect(hidden.request).not.toHaveBeenCalled()

    fakeBrowser({ refuse: true })
    const refused = createWakeLock()
    expect(await refused.acquire()).toBe(false)
    expect(refused.held).toBe(false)
  })

  it('lets go of a lock that arrives after it was switched off', async () => {
    const browser = fakeBrowser()
    const lock = createWakeLock()
    const asked = lock.acquire()
    await lock.release()
    expect(await asked).toBe(false)
    expect(browser.locks[0]!.released).toBe(true)
    expect(lock.held).toBe(false)
  })
})
