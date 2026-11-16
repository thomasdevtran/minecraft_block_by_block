import { computed, shallowRef, watch } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { accountsEnabled, requireSupabase, sessionStorageKey, whenSupabaseLoads } from './supabase'
import { syncAccountSkin } from './skinStore'
import { readStored, writeStored } from './storage'

export const session = shallowRef<Session | null>(null)
export const authReady = shallowRef(!accountsEnabled)
export const user = computed(() => session.value?.user ?? null)
export const authError = shallowRef('')
export const recoveringPassword = shallowRef(false)

whenSupabaseLoads((client) => {
  client.auth.onAuthStateChange((event, value) => {
    const previousUser = session.value?.user.id
    session.value = value
    syncAccountSkin(value?.user.id)
    authReady.value = true
    if (value) authError.value = ''
    if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
    else if (!value || value.user.id !== previousUser) recoveringPassword.value = false
  })
  void client.auth.getSession().then(({ error }) => {
    if (error) authError.value = error.message
    authReady.value = true
  }).catch(() => {
    authError.value = 'Could not restore your sign-in. Please sign in again.'
    authReady.value = true
  })
})

/**
 * Whether this visit needs the account library straight away: a session saved in this browser, or
 * an email link (confirmation or password reset) that carries tokens in the address.
 */
function signInPending(): boolean {
  try {
    if (localStorage.getItem(sessionStorageKey) !== null) return true
  } catch {
    // Storage blocked: no saved session can exist.
  }
  return typeof location !== 'undefined' && /[#?&](access_token|refresh_token|code|error_description)=/.test(location.href)
}

if (accountsEnabled) {
  // Signed-out visitors are known to be signed out without loading anything.
  if (!signInPending()) authReady.value = true
  else void requireSupabase().catch(() => {
    authError.value = 'Could not restore your sign-in. Check your connection and reload the page.'
    authReady.value = true
  })
}

// ---------------------------------------------------------------------------------------------
// Age screen
// ---------------------------------------------------------------------------------------------

/**
 * True when someone born in this month and year is 13 or older on `today`. Only the month and year
 * are asked, so the month of a 13th birthday still counts as under 13. The database applies the
 * same rule (craft_private.at_least_13); this copy decides before anything is sent.
 */
export function oldEnough(month: number, year: number, today = new Date()): boolean {
  return year + 13 < today.getUTCFullYear() || (year + 13 === today.getUTCFullYear() && month < today.getUTCMonth() + 1)
}

/** Kept after an under-13 answer so the form can't simply be tried again. Holds no birth date. */
const DECLINED_KEY = 'account:age-declined'
export const ageDeclined = shallowRef(readStored(DECLINED_KEY, false))
export function declineAccount(): void {
  ageDeclined.value = true
  writeStored(DECLINED_KEY, true)
}

/**
 * The signed-in account's age check: 'passed' (or 'not-required' while the database predates the
 * check), 'failed', 'needed' for accounts made before it existed, 'unknown' while loading, and
 * 'error' when it couldn't be loaded (the server still enforces it either way).
 */
export type AgeCheck = 'unknown' | 'needed' | 'passed' | 'failed' | 'not-required' | 'error'
export const ageCheck = shallowRef<AgeCheck>('unknown')
let ageRequest = 0

async function loadAgeCheck(accountId: string | undefined): Promise<void> {
  const token = ++ageRequest
  ageCheck.value = 'unknown'
  if (!accountId) return
  try {
    const { data, error } = await (await requireSupabase()).rpc('my_age_screen')
    if (token !== ageRequest) return
    if (error?.code === 'PGRST202' || error?.code === '42883') ageCheck.value = 'not-required'
    else if (error) throw error
    else ageCheck.value = data === true ? 'passed' : data === false ? 'failed' : 'needed'
  } catch {
    if (token === ageRequest) ageCheck.value = 'error'
  }
}
watch(() => user.value?.id, (id) => void loadAgeCheck(id))
export const retryAgeCheck = () => loadAgeCheck(user.value?.id)

/** Records the answer for an account that doesn't have one yet. Returns whether it passed. */
export async function confirmAge(month: number, year: number): Promise<boolean> {
  const account = user.value
  if (!account) throw new Error('Sign in to continue.')
  const { data, error } = await (await requireSupabase())
    .rpc('confirm_age', { expected_user_id: account.id, birth_month: month, birth_year: year })
  if (error) throw new Error(error.code === '23514' ? 'Enter a valid birth month and year.' : 'Could not save your answer. Please try again.')
  if (user.value?.id !== account.id) throw new Error('Your sign-in changed. Please try again.')
  ageCheck.value = data ? 'passed' : 'failed'
  return data === true
}
