import { computed, shallowRef } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const session = shallowRef<Session | null>(null)
export const authReady = shallowRef(!supabase)
export const user = computed(() => session.value?.user ?? null)
export const authError = shallowRef('')
export const recoveringPassword = shallowRef(false)

if (supabase) {
  supabase.auth.onAuthStateChange((event, value) => {
    session.value = value
    authReady.value = true
    if (value) authError.value = ''
    if (event === 'PASSWORD_RECOVERY') recoveringPassword.value = true
  })
  void supabase.auth.getSession().then(({ error }) => {
    if (error) authError.value = error.message
    authReady.value = true
  }).catch(() => {
    authError.value = 'Could not restore your sign-in. Please sign in again.'
    authReady.value = true
  })
}
