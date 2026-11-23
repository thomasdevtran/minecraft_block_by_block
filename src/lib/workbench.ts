import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { BuildModel } from '../engine/model'
import { CUBE_SIZE_LIMITS, isCubeSize, type CubeSize, type LengthUnit } from './buildSettings'

/*
 * Tools for the reader's workbench while a guide is open: how big the build comes out with their
 * cubes, and keeping the screen awake while their hands are full. Only guide pages load this
 * module, so the homepage and other pages never download it.
 */

// ---------------------------------------------------------------------------------------------
// Finished size
// ---------------------------------------------------------------------------------------------

/** The finished build's size in cubes: width (x), depth (z) and height (y), assembled. */
export function buildDimensions(model: BuildModel) {
  if (!model.voxels.length) return { wide: 0, deep: 0, tall: 0 }
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const v of model.voxels) {
    min.x = Math.min(min.x, v.x); max.x = Math.max(max.x, v.x)
    min.y = Math.min(min.y, v.y); max.y = Math.max(max.y, v.y)
    min.z = Math.min(min.z, v.z); max.z = Math.max(max.z, v.z)
  }
  return { wide: max.x - min.x + 1, deep: max.z - min.z + 1, tall: max.y - min.y + 1 }
}

const CM_PER_INCH = 2.54
const oneDecimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

/**
 * How big the build comes out with the reader's cubes: plain multiplication, so it's exact for
 * the cubes alone (glue lines add a little). Gives the size in the chosen unit and the other one.
 * Flat builds list wide × tall; everything else wide × deep × tall.
 */
export function finishedSize(model: BuildModel, cube: CubeSize) {
  const { wide, deep, tall } = buildDimensions(model)
  const flat = deep === 1
  const counts = flat ? [wide, tall] : [wide, deep, tall]
  const other: LengthUnit = cube.unit === 'cm' ? 'in' : 'cm'
  const otherValue = cube.unit === 'cm' ? cube.value / CM_PER_INCH : cube.value * CM_PER_INCH
  const measure = (size: number, unit: LengthUnit) =>
    `${counts.map((n) => oneDecimal.format(n * size)).join(' × ')} ${unit}`
  return {
    flat,
    cubes: counts.join(' × '),
    size: measure(cube.value, cube.unit),
    other: measure(otherValue, other),
    axes: flat ? 'wide × tall, one cube thick' : 'wide × deep × tall',
  }
}

/** The same cube size in `unit`, to two decimals and kept within that unit's limits. */
export function convertCubeSize(size: CubeSize, unit: LengthUnit): CubeSize {
  if (unit === size.unit) return size
  const converted = Math.round((unit === 'in' ? size.value / CM_PER_INCH : size.value * CM_PER_INCH) * 100) / 100
  const { min, max } = CUBE_SIZE_LIMITS[unit]
  return { value: Math.min(max, Math.max(min, converted)), unit }
}

/**
 * The guide's cube-size field. `size` is buildSettings' remembered cubeSize, passed in like
 * useWakeLock's choice. The field keeps what the reader typed; `size` only changes when the text
 * is a size in range, so a half-typed "1." never flashes a wrong result.
 */
export function useCubeSizeField(size: Ref<CubeSize>) {
  const draft = ref(String(size.value.value))
  const invalid = ref(false)
  const limits = computed(() => CUBE_SIZE_LIMITS[size.value.unit])

  function type(text: string) {
    draft.value = text
    const next = { value: Number(text.trim().replace(',', '.')), unit: size.value.unit }
    invalid.value = text.trim() !== '' && !isCubeSize(next)
    if (isCubeSize(next)) size.value = next
  }
  function settle() {
    draft.value = String(size.value.value)
    invalid.value = false
  }
  /** Switching units converts the size, so the finished size stays the same until the reader edits it. */
  function changeUnit(unit: LengthUnit) {
    if (unit === size.value.unit) return
    size.value = convertCubeSize(size.value, unit)
    settle()
  }

  return { draft, invalid, limits, type, settle, changeUnit }
}

// ---------------------------------------------------------------------------------------------
// Keep the screen on
// ---------------------------------------------------------------------------------------------

/**
 * Holds a screen wake lock while `wanted` and the page is visible. Builders have glue on their
 * hands, and phones lock after half a minute. Browsers drop the lock whenever the page is hidden,
 * so `resume()` asks again when the reader comes back. `acquire()` reports whether it worked:
 * battery saver and some browsers refuse.
 */
export function createWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  let held: WakeLockSentinel | null = null
  let pending: Promise<boolean> | null = null
  let wanted = false

  async function request(): Promise<boolean> {
    try {
      const lock = await navigator.wakeLock.request('screen')
      // Released or switched off while the request was in flight.
      if (!wanted) {
        await lock.release()
        return false
      }
      held = lock
      lock.addEventListener('release', () => { if (held === lock) held = null })
      return true
    } catch {
      return false
    }
  }

  return {
    supported,
    get held() { return held !== null },
    acquire(): Promise<boolean> {
      wanted = true
      if (!supported || document.visibilityState !== 'visible') return Promise.resolve(false)
      if (held) return Promise.resolve(true)
      pending ??= request().finally(() => { pending = null })
      return pending
    },
    async release() {
      wanted = false
      const lock = held
      held = null
      await lock?.release().catch(() => {})
    },
    /** Call when the page becomes visible again. */
    resume(): Promise<boolean> {
      return wanted && !held ? this.acquire() : Promise.resolve(held !== null)
    },
  }
}

/**
 * The guide's "Keep screen on" switch. `remembered` is the stored choice (buildSettings'
 * keepScreenOn, passed in so the caller decides what is remembered); the lock itself only lasts
 * while the calling component is mounted, so leaving the guide lets the screen sleep.
 * `toggle()` resolves to false when the browser refused, so the caller can say so.
 */
export function useWakeLock(remembered: Ref<boolean>) {
  const lock = createWakeLock()
  const enabled = ref(lock.supported && remembered.value)
  const onVisibility = () => { if (document.visibilityState === 'visible') void lock.resume() }

  onMounted(async () => {
    if (!lock.supported) return
    document.addEventListener('visibilitychange', onVisibility)
    // A remembered choice is tried quietly; if the browser refuses, the switch shows as off.
    if (enabled.value && !(await lock.acquire())) enabled.value = false
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    void lock.release()
  })

  async function toggle(): Promise<boolean> {
    const on = !enabled.value
    enabled.value = on
    remembered.value = on
    if (!on) {
      await lock.release()
      return true
    }
    if (await lock.acquire()) return true
    enabled.value = false
    remembered.value = false
    return false
  }

  return { supported: lock.supported, enabled, toggle }
}
