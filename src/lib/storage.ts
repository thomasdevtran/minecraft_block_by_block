/** localStorage wrappers that quietly do nothing when storage is blocked (private windows, etc). */

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return matchesShape(parsed, fallback) ? parsed as T : fallback
  } catch {
    return fallback
  }
}

function matchesShape(value: unknown, fallback: unknown): boolean {
  if (fallback === null) return true // Nullable structured records validate at their owning module.
  if (typeof value !== typeof fallback) return false
  if (typeof fallback === 'number') return Number.isFinite(value)
  if (typeof fallback === 'object') {
    if (value === null || Array.isArray(value)) return false
    return Object.entries(fallback).every(([key, sample]) => matchesShape((value as Record<string, unknown>)[key], sample))
  }
  return true
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Progress just won't be remembered.
  }
}

/** Short stable hash for building storage keys from large strings. */
export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ---------------------------------------------------------------------------------------------
// Most recent build (the homepage's "Continue your build" card)
// ---------------------------------------------------------------------------------------------

export interface RecentBuild { title: string; path: string; step: number; total: number; skinHash?: string }
const RECENT_KEY = 'progress:recent'

/** The last guide opened on this device, or null when the record is missing or doesn't validate. */
export function readRecentBuild(): RecentBuild | null {
  const value = readStored<RecentBuild | null>(RECENT_KEY, null)
  if (!value || typeof value.title !== 'string' || value.title.length > 200 ||
      typeof value.path !== 'string' || !/^\/(item\/[a-z0-9_]+|skin\/guide)(\?[^#]*)?$/.test(value.path) ||
      !Number.isInteger(value.step) || !Number.isInteger(value.total) || value.total < 1 || value.step < 0 || value.step > value.total ||
      (value.skinHash !== undefined && typeof value.skinHash !== 'string')) return null
  return value
}

export function rememberBuild(value: RecentBuild) { writeStored(RECENT_KEY, value) }

// ---------------------------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------------------------

/** Clear only this app's build records, preserving privacy preferences and unrelated data. */
export function clearBuildData(): boolean {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    for (const key of keys) {
      if (key && (key.startsWith('prefs:') || key.startsWith('progress:') || key === 'skin:current')) localStorage.removeItem(key)
    }
    return true
  } catch { return false }
}
