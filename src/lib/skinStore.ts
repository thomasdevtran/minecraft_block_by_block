import { ref } from 'vue'
import type { SkinModelType } from '../engine/skin'
import { readStored, writeStored } from './storage'

export interface LoadedSkin {
  /** The skin PNG as a data URL, so it survives a page refresh. */
  dataUrl: string
  model: SkinModelType
  /** Username or file name, for headings. */
  label: string
}

const KEY = 'skin:current'

export const currentSkin = ref<LoadedSkin | null>(readStored<LoadedSkin | null>(KEY, null))

export function setSkin(skin: LoadedSkin): void {
  currentSkin.value = skin
  writeStored(KEY, skin)
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
  const res = await fetch(`/api/skin/${encodeURIComponent(username.trim())}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Lookup failed (${res.status}).`)
  }
  return {
    dataUrl: await blobToDataUrl(await res.blob()),
    model: res.headers.get('X-Skin-Model') === 'slim' ? 'slim' : 'classic',
    label: res.headers.get('X-Skin-Username') ?? username.trim(),
  }
}
