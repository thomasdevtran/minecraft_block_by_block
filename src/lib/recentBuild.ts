import { readStored, writeStored } from './storage'

export interface RecentBuild { title: string; path: string; step: number; total: number; skinHash?: string }
const KEY = 'progress:recent'

export function readRecentBuild(): RecentBuild | null {
  const value = readStored<RecentBuild | null>(KEY, null)
  if (!value || typeof value.title !== 'string' || value.title.length > 200 ||
      typeof value.path !== 'string' || !/^\/(item\/[a-z0-9_]+|skin\/guide)(\?[^#]*)?$/.test(value.path) ||
      !Number.isInteger(value.step) || !Number.isInteger(value.total) || value.total < 1 || value.step < 0 || value.step > value.total ||
      (value.skinHash !== undefined && typeof value.skinHash !== 'string')) return null
  return value
}

export function rememberBuild(value: RecentBuild) { writeStored(KEY, value) }
