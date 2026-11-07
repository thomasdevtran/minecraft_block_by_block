import type { SkinModelType } from '../engine/skin'
import { user as signedInUser } from './auth'
import { loadCatalog } from './catalog'
import { blobToDataUrl, setSkin, type LoadedSkin } from './skinStore'
import { requireSupabase } from './supabase'
import { writeStored } from './storage'

// Bump when generation changes cube placement, recipe labels, or step order.
export const GUIDE_ENGINE_VERSION = '1'

export interface SavedBuild {
  id: string
  user_id: string
  fingerprint: string
  title: string
  kind: 'item' | 'skin'
  item_id: string | null
  image_path: string | null
  skin_model: SkinModelType | null
  resume_path: string
  guide_key: string
  engine_version: string
  catalog_version: string | null
  current_step: number
  total_steps: number
  cube_count: number
  paint_count: number
  revision: number
  updated_at: string
}

export interface BuildToSave {
  title: string
  path: string
  guideKey: string
  step: number
  total: number
  cubes: number
  paints: number
  skin?: LoadedSkin
}

export function validateBuildPath(path: string): 'item' | 'skin' {
  if (!/^\/(item\/[a-z0-9_]+|skin\/guide)\?[^#]*$/.test(path)) throw new Error('This build link is invalid.')
  const url = new URL(path, 'https://local.invalid')
  const allowed = new Set(['view', 'look', 'paints', 'pot', 'simple', 'hollow', 'overlay', 'arm'])
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || !/^[a-z0-9]+$/.test(value)) throw new Error('This build has invalid settings.')
  }
  return url.pathname === '/skin/guide' ? 'skin' : 'item'
}

async function digest(value: string | ArrayBuffer) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function saveBuild(input: BuildToSave, previous: SavedBuild | null): Promise<SavedBuild> {
  const client = requireSupabase()
  const { data: { user }, error: authFailure } = await client.auth.getUser()
  if (authFailure || !user) throw new Error('Sign in to save this build.')
  const title = input.title.trim()
  if (!title || title.length > 100) throw new Error('Give this build a name of up to 100 characters.')
  const kind = validateBuildPath(input.path)
  if (kind === 'skin' && !input.skin) throw new Error('Choose a skin before saving.')
  let imagePath: string | null = null
  if (kind === 'skin' && input.skin) {
    if (!input.skin.dataUrl.startsWith('data:image/png;base64,') || input.skin.dataUrl.length > 1_400_000) {
      throw new Error('Choose a valid skin PNG up to 1 MB.')
    }
    const image = await fetch(input.skin.dataUrl).then(response => response.blob())
    const hash = await digest(await image.arrayBuffer())
    imagePath = `${user.id}/${hash}.png`
    const { error } = await client.storage.from('build-skins').upload(imagePath, image, { contentType: 'image/png', upsert: false })
    if (error && error.statusCode !== '409') throw error
  }
  const catalogVersion = kind === 'item' ? (await loadCatalog()).version : null
  const fingerprint = await digest(JSON.stringify([input.path, input.guideKey, imagePath, GUIDE_ENGINE_VERSION, catalogVersion]))
  const values = {
    user_id: user.id, fingerprint, title, kind,
    item_id: kind === 'item' ? input.path.split('?')[0].split('/')[2] : null,
    image_path: imagePath, skin_model: input.skin?.model ?? null,
    resume_path: input.path, guide_key: input.guideKey, engine_version: GUIDE_ENGINE_VERSION,
    catalog_version: catalogVersion, current_step: input.step, total_steps: input.total,
    cube_count: input.cubes, paint_count: input.paints,
  }
  if (previous && previous.user_id === user.id && previous.fingerprint === fingerprint) {
    const { data, error } = await client.from('saved_builds').update(values)
      .eq('id', previous.id).eq('revision', previous.revision).select().maybeSingle()
    if (error) throw error
    if (!data) throw new Error('This build changed on another device. Open My Builds to reload its saved step.')
    return data as SavedBuild
  }
  const { data, error } = await client.from('saved_builds').insert(values).select().single()
  if (error?.code === '23505') {
    const existing = await client.from('saved_builds').select().eq('fingerprint', fingerprint).single()
    if (existing.error) throw existing.error
    return existing.data as SavedBuild
  }
  if (error) throw error
  return data as SavedBuild
}

export async function openBuild(build: SavedBuild): Promise<{ path: string; updated: boolean }> {
  if (signedInUser.value?.id !== build.user_id) throw new Error('Sign in to open your saved builds.')
  validateBuildPath(build.resume_path)
  let updated = build.engine_version !== GUIDE_ENGINE_VERSION
  if (build.kind === 'item') updated ||= build.catalog_version !== (await loadCatalog()).version
  if (build.kind === 'skin') {
    if (!build.image_path || !build.skin_model) throw new Error('The saved skin is incomplete.')
    const { data, error } = await requireSupabase().storage.from('build-skins').download(build.image_path)
    if (error) throw error
    if (signedInUser.value?.id !== build.user_id) throw new Error('Your sign-in changed. Open My Builds again.')
    setSkin({ label: build.title, model: build.skin_model, dataUrl: await blobToDataUrl(data) })
  }
  writeStored(`progress:${build.guide_key}`, updated ? 0 : build.current_step)
  return { path: build.resume_path, updated }
}
