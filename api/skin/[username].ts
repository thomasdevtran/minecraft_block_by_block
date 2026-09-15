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

  const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`)
  if (profileRes.status === 204 || profileRes.status === 404) {
    throw new SkinLookupError(404, `No Minecraft player is named "${username}".`)
  }
  if (!profileRes.ok) throw new SkinLookupError(502, 'Mojang’s player lookup is not responding. Try again soon.')
  const profile = (await profileRes.json()) as { id: string; name: string }

  const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`)
  if (!sessionRes.ok) throw new SkinLookupError(502, 'Mojang’s skin server is not responding. Try again soon.')
  const session = (await sessionRes.json()) as { properties: { name: string; value: string }[] }
  const encoded = session.properties.find((p) => p.name === 'textures')?.value
  const textures = encoded
    ? (JSON.parse(atob(encoded)) as { textures: { SKIN?: { url: string; metadata?: { model?: string } } } })
    : null
  const skin = textures?.textures.SKIN
  if (!skin) throw new SkinLookupError(404, `${profile.name} is using a default skin, so there is no custom skin to build.`)

  const pngRes = await fetch(skin.url.replace(/^http:/, 'https:'))
  if (!pngRes.ok) throw new SkinLookupError(502, 'Could not download the skin image.')

  return {
    png: await pngRes.arrayBuffer(),
    model: skin.metadata?.model === 'slim' ? 'slim' : 'classic',
    username: profile.name,
  }
}

export async function GET(request: Request): Promise<Response> {
  const username = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '')
  try {
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
    const status = err instanceof SkinLookupError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
