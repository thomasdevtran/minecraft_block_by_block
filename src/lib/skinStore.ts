import { ref } from 'vue'
import type { SkinModelType } from '../engine/skin'
import { hashString, readStored, writeStored } from './storage'
import { readRecentBuild } from './recentBuild'
import { readSkinPng } from './skinImages'

export interface LoadedSkin {
  /** The skin PNG as a data URL, so it survives a page refresh. */
  dataUrl: string
  model: SkinModelType
  /** Username or file name, for headings. */
  label: string
  /** Set when the image was opened from a private account library. */
  accountId?: string
}

const KEY = 'skin:current'

const stored = readStored<LoadedSkin | null>(KEY, null)
const validStored = stored && typeof stored.label === 'string' && typeof stored.dataUrl === 'string' &&
  stored.dataUrl.startsWith('data:image/png;base64,') && stored.dataUrl.length <= 1_400_000 &&
  (stored.model === 'classic' || stored.model === 'slim') &&
  (stored.accountId === undefined || typeof stored.accountId === 'string')
let pendingAccountSkin = validStored && stored.accountId ? stored : null
export const currentSkin = ref<LoadedSkin | null>(validStored && !stored.accountId ? stored : null)

export function setSkin(skin: LoadedSkin): void {
  pendingAccountSkin = null
  currentSkin.value = skin
  writeStored(KEY, skin)
}

/** Reveal cached account images only after sign-in is restored, and clear them on account changes. */
export function syncAccountSkin(accountId?: string): void {
  const skin = pendingAccountSkin ?? currentSkin.value
  if (!skin?.accountId) return
  if (skin.accountId === accountId) {
    if (pendingAccountSkin) setSkin(pendingAccountSkin)
    return
  }
  pendingAccountSkin = null
  currentSkin.value = null
  writeStored(KEY, null)
  if (readRecentBuild()?.skinHash === hashString(skin.dataUrl)) writeStored('progress:recent', null)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function fetchSkinByUsername(username: string): Promise<LoadedSkin> {
  const res = await fetch(`/api/skin/${encodeURIComponent(username.trim())}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Lookup failed (${res.status}).`)
  }
  return {
    dataUrl: await blobToDataUrl(await readSkinPng(await res.blob())),
    model: res.headers.get('X-Skin-Model') === 'slim' ? 'slim' : 'classic',
    label: res.headers.get('X-Skin-Username') ?? username.trim(),
  }
}
