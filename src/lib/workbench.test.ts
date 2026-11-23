import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildModel } from '../engine/model'
import type { Voxel } from '../engine/voxels'
import { ref } from 'vue'
import { isCubeSize, type CubeSize } from './buildSettings'
import { buildDimensions, convertCubeSize, createWakeLock, finishedSize, useCubeSizeField } from './workbench'

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

describe('cube size field', () => {
  it('converts between units to two decimals, within the new unit’s limits', () => {
    expect(convertCubeSize({ value: 1, unit: 'cm' }, 'in')).toEqual({ value: 0.39, unit: 'in' })
    expect(convertCubeSize({ value: 0.75, unit: 'in' }, 'cm')).toEqual({ value: 1.91, unit: 'cm' })
    expect(convertCubeSize({ value: 0.5, unit: 'cm' }, 'in')).toEqual({ value: 0.2, unit: 'in' })
    expect(convertCubeSize({ value: 4, unit: 'in' }, 'cm')).toEqual({ value: 10, unit: 'cm' })
    const same = { value: 2, unit: 'cm' as const }
    expect(convertCubeSize(same, 'cm')).toBe(same)
  })

  it('keeps half-typed text in the field and only stores sizes in range', () => {
    const size = ref<CubeSize>({ value: 1, unit: 'cm' })
    const field = useCubeSizeField(size)
    field.type('1,5')
    expect(size.value).toEqual({ value: 1.5, unit: 'cm' })
    expect(field.invalid.value).toBe(false)
    field.type('25')
    expect(field.draft.value).toBe('25')
    expect(field.invalid.value).toBe(true)
    expect(size.value.value).toBe(1.5)
    field.type('')
    expect(field.invalid.value).toBe(false)
    field.settle()
    expect(field.draft.value).toBe('1.5')
  })

  it('converts the stored size when the unit changes and resets the text', () => {
    const size = ref<CubeSize>({ value: 2.54, unit: 'cm' })
    const field = useCubeSizeField(size)
    field.type('99')
    field.changeUnit('in')
    expect(size.value).toEqual({ value: 1, unit: 'in' })
    expect(field.draft.value).toBe('1')
    expect(field.invalid.value).toBe(false)
    expect(field.limits.value).toEqual({ min: 0.2, max: 4 })
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
