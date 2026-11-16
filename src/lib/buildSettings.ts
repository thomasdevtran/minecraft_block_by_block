import { ref, watch } from 'vue'
import { readStored, writeStored } from './storage'

/*
 * Build options shared across pages: the texture look, and the settings a build link carries
 * (?paints=8&hollow=1&simple=0).
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
