/**
 * GET /api/skin/:username → the player's skin PNG, with the arm style in `X-Skin-Model`.
 * Mojang's API doesn't allow browser requests (CORS), so the site asks this function instead.
 * The Vite dev server also uses `lookupSkin` so lookups work with `npm run dev`.
 */

const USERNAME = /^[A-Za-z0-9_]{1,16}$/

export class SkinLookupError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface SkinLookup {
  png: ArrayBuffer
  model: 'classic' | 'slim'
  username: string
}

export async function lookupSkin(username: string): Promise<SkinLookup> {
  if (!USERNAME.test(username)) {
    throw new SkinLookupError(400, 'Minecraft usernames are 1–16 letters, numbers or underscores.')
  }

  const signal = AbortSignal.timeout(10000)
  const options = { signal, redirect: 'error' as const }
  const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`, options)
  if (profileRes.status === 204 || profileRes.status === 404) {
    throw new SkinLookupError(404, `No Minecraft player is named "${username}".`)
  }
  if (!profileRes.ok) throw new SkinLookupError(502, 'Mojang’s player lookup is not responding. Try again soon.')
  const profile = (await profileRes.json()) as { id: string; name: string }
  if (!/^[a-f0-9]{32}$/i.test(profile.id) || !USERNAME.test(profile.name)) throw new SkinLookupError(502, 'The player service returned an invalid profile.')

  const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`, options)
  if (!sessionRes.ok) throw new SkinLookupError(502, 'Mojang’s skin server is not responding. Try again soon.')
  const session = (await sessionRes.json()) as { properties: { name: string; value: string }[] }
  const encoded = session.properties.find((p) => p.name === 'textures')?.value
  const textures = encoded
    ? (JSON.parse(atob(encoded)) as { textures: { SKIN?: { url: string; metadata?: { model?: string } } } })
    : null
  const skin = textures?.textures.SKIN
  if (!skin) throw new SkinLookupError(404, `${profile.name} is using a default skin, so there is no custom skin to build.`)

  const skinUrl = new URL(skin.url.replace(/^http:/, 'https:'))
  if (skinUrl.protocol !== 'https:' || skinUrl.hostname !== 'textures.minecraft.net' || skinUrl.port || skinUrl.username || skinUrl.password || !/^\/texture\/[a-f0-9]+$/i.test(skinUrl.pathname) || skinUrl.search || skinUrl.hash) {
    throw new SkinLookupError(502, 'The skin service returned an unsupported image URL.')
  }
  const pngRes = await fetch(skinUrl, options)
  if (!pngRes.ok) throw new SkinLookupError(502, 'Could not download the skin image.')
  if (!pngRes.headers.get('content-type')?.startsWith('image/png')) throw new SkinLookupError(502, 'The skin service did not return a PNG.')
  const reader = pngRes.body?.getReader()
  if (!reader) throw new SkinLookupError(502, 'The skin image is empty.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024 * 1024) {
        await reader.cancel()
        throw new SkinLookupError(502, 'The skin image is too large.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const header = new DataView(bytes.buffer)
  if (size < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(12) !== 0x49484452 || header.getUint32(16) !== 64 || ![32, 64].includes(header.getUint32(20))) {
    throw new SkinLookupError(502, 'The skin service returned an invalid skin PNG.')
  }
  const png = bytes.buffer

  return {
    png,
    model: skin.metadata?.model === 'slim' ? 'slim' : 'classic',
    username: profile.name,
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    let username: string
    try { username = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '') }
    catch { throw new SkinLookupError(400, 'Invalid username encoding.') }
    const skin = await lookupSkin(username)
    return new Response(skin.png, {
      headers: {
        'Content-Type': 'image/png',
        'X-Skin-Model': skin.model,
        'X-Skin-Username': skin.username,
        'Access-Control-Expose-Headers': 'X-Skin-Model, X-Skin-Username',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    const status = err instanceof SkinLookupError ? err.status : 502
    const message = err instanceof SkinLookupError ? err.message : 'The skin service is unavailable. Try again, or upload a PNG from your device.'
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
