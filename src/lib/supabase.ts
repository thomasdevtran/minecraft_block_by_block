import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Accounts, My Builds and Community are configured for this build. */
export const accountsEnabled = Boolean(url && key)

/** Where supabase-js keeps a signed-in session by default; auth.ts checks it before loading anything. */
export const sessionStorageKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : ''

/*
 * The Supabase library used to ship in the first download of every page, although most visitors
 * never sign in. It now loads the first time something needs it: a sign-in, a saved build,
 * Community, or a returning visitor with a stored session.
 */
let client: Promise<SupabaseClient> | undefined
let loaded: SupabaseClient | undefined
const onLoad: ((client: SupabaseClient) => void)[] = []

export function requireSupabase(): Promise<SupabaseClient> {
  if (!url || !key) return Promise.reject(new Error('Account services are not configured. Please try again later.'))
  client ??= import('@supabase/supabase-js').then(
    ({ createClient }) => {
      loaded = createClient(url, key)
      for (const listener of onLoad) listener(loaded)
      return loaded
    },
    (failure: unknown) => {
      // A failed download (offline, or a deploy replaced the chunk) can be retried next time.
      client = undefined
      throw failure
    },
  )
  return client
}

/** Runs `listener` with the client once it has loaded (straight away if it already has). */
export function whenSupabaseLoads(listener: (client: SupabaseClient) => void): void {
  onLoad.push(listener)
  if (loaded) listener(loaded)
}
