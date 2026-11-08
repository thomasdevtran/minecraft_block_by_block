import { computed, shallowRef } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { syncAccountSkin } from './skinStore'

export const session = shallowRef<Session | null>(null)
export const authReady = shallowRef(!supabase)
export const user = computed(() => session.value?.user ?? null)
export const authError = shallowRef('')
export const recoveringPassword = shallowRef(false)

if (supabase) {
  supabase.auth.onAuthStateChange((event, value) => {
    const previousUser = session.value?.user.id
    session.value = value
    syncAccountSkin(value?.user.id)
    authReady.value = true
    if (value) authError.value = ''
    if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
    else if (!value || value.user.id !== previousUser) recoveringPassword.value = false
  })
  void supabase.auth.getSession().then(({ error }) => {
    if (error) authError.value = error.message
    authReady.value = true
  }).catch(() => {
    authError.value = 'Could not restore your sign-in. Please sign in again.'
    authReady.value = true
  })
}
