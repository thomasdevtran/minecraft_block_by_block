import { ref, watch } from 'vue'
import { readStored, writeStored } from './storage'

/*
 * Build options shared across pages: the texture look, the reader's cube size, whether guides keep
 * the screen on, and the settings a build link carries (?paints=8&hollow=1&simple=0).
 */

// ---------------------------------------------------------------------------------------------
// Texture look
// ---------------------------------------------------------------------------------------------

/** Which textures to show: today's, or the classic look from before the 1.14 texture update. */
export type Look = 'current' | 'classic'

const LOOK_KEY = 'prefs:look'

/** Shared across pages, so switching in the catalog also switches the guides. */
export const look = ref<Look>(readStored<Look>(LOOK_KEY, 'current') === 'classic' ? 'classic' : 'current')
watch(look, (v) => writeStored(LOOK_KEY, v))

/** The texture switch's choices, shared by the catalog and the item guides. */
export const LOOK_OPTIONS: { value: Look; label: string }[] = [
  { value: 'current', label: 'New textures' },
  { value: 'classic', label: 'Old textures' },
]

// ---------------------------------------------------------------------------------------------
// Cube size
// ---------------------------------------------------------------------------------------------

export type LengthUnit = 'cm' | 'in'
export interface CubeSize { value: number; unit: LengthUnit }

/** Craft cubes from tiny beads to big wooden blocks; anything outside is almost certainly a typo. */
export const CUBE_SIZE_LIMITS: Record<LengthUnit, { min: number; max: number }> = {
  cm: { min: 0.5, max: 10 },
  in: { min: 0.2, max: 4 },
}

export function isCubeSize(value: unknown): value is CubeSize {
  if (!value || typeof value !== 'object') return false
  const { value: size, unit } = value as Partial<CubeSize>
  if (unit !== 'cm' && unit !== 'in') return false
  return typeof size === 'number' && Number.isFinite(size) &&
    size >= CUBE_SIZE_LIMITS[unit].min && size <= CUBE_SIZE_LIMITS[unit].max
}

const CUBE_SIZE_KEY = 'prefs:cube-size'
const storedCubeSize = readStored<unknown>(CUBE_SIZE_KEY, null)

/** The size of the reader's own cubes, used for the finished size. Remembered on this device. */
export const cubeSize = ref<CubeSize>(isCubeSize(storedCubeSize) ? storedCubeSize : { value: 1, unit: 'cm' })
watch(cubeSize, (v) => writeStored(CUBE_SIZE_KEY, v), { deep: true })

// ---------------------------------------------------------------------------------------------
// Keep the screen on
// ---------------------------------------------------------------------------------------------

const KEEP_AWAKE_KEY = 'prefs:keep-awake'

/** Whether guides keep the screen awake while open (see useWakeLock). Remembered on this device. */
export const keepScreenOn = ref(readStored<unknown>(KEEP_AWAKE_KEY, false) === true)
watch(keepScreenOn, (v) => writeStored(KEEP_AWAKE_KEY, v))

// ---------------------------------------------------------------------------------------------
// Settings in build links
// ---------------------------------------------------------------------------------------------

/** A paint count from a link, kept to the slider's 2–32 range; anything else uses `fallback`. */
export function paintLimit(value: unknown, fallback: number): number {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isInteger(number) && number >= 2 && number <= 32 ? number : fallback
}

/** A '1' / '0' switch from a link; anything else uses `fallback`. */
export function flag(value: unknown, fallback: boolean): boolean {
  return value === '1' ? true : value === '0' ? false : fallback
}
