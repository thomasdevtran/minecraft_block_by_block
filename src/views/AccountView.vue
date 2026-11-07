<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { authError, authReady, recoveringPassword, user } from '../lib/auth'
import { requireSupabase, supabase } from '../lib/supabase'

const route = useRoute()
const router = useRouter()
const mode = ref<'signin' | 'signup' | 'reset'>('signin')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
const heading = computed(() => recoveringPassword.value ? 'Choose a new password'
  : mode.value === 'signup' ? 'Create your account' : mode.value === 'reset' ? 'Reset your password' : 'Sign in')
const nextPath = computed(() => {
  const path = route.query.next
  return typeof path === 'string' && /^\/(library|item\/[a-z0-9_]+|skin(?:\/guide)?)(?:\?[^#]*)?$/.test(path) ? path : '/library'
})

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const client = requireSupabase()
    if (recoveringPassword.value) {
      const result = await client.auth.updateUser({ password: password.value })
      if (result.error) throw result.error
      recoveringPassword.value = false
      message.value = 'Your password was updated.'
    } else if (mode.value === 'reset') {
      const result = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: new URL('/account', location.origin).href })
      if (result.error) throw result.error
      message.value = 'If this email has an account, a password reset link is on its way.'
    } else if (mode.value === 'signup') {
      const result = await client.auth.signUp({
        email: email.value.trim(), password: password.value,
        options: { emailRedirectTo: new URL('/account', location.origin).href },
      })
      if (result.error) throw result.error
      if (result.data.session) await router.push(nextPath.value)
      else message.value = 'Check your email to confirm your account, then sign in here.'
    } else {
      const result = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
      if (result.error) throw result.error
      await router.push(nextPath.value)
    }
    password.value = ''
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not complete sign-in. Please try again.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  busy.value = true
  error.value = ''
  try {
    const { error: failure } = await requireSupabase().auth.signOut({ scope: 'local' })
    if (failure) throw failure
    message.value = 'Signed out on this device.'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not sign out. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="container account-page">
    <p class="eyebrow muted">Your crafting table</p>
    <h1>{{ user && !recoveringPassword ? 'Your account' : heading }}</h1>
    <p>Save your builds and open them on another device.</p>
    <p v-if="!supabase" class="notice">Accounts are being set up. Please check back soon.</p>
    <p v-else-if="!authReady" role="status">Checking your sign-in…</p>
    <template v-else-if="user && !recoveringPassword">
      <p>Signed in as <strong>{{ user.email }}</strong>.</p>
      <div class="account-actions">
        <RouterLink class="btn primary" :to="nextPath">Continue to your builds</RouterLink>
        <button class="btn" :disabled="busy" @click="signOut">Sign out</button>
      </div>
    </template>
    <template v-else>
      <form class="account-form card" @submit.prevent="submit">
        <label v-if="!recoveringPassword">Email
          <input v-model="email" type="email" autocomplete="email" required maxlength="254" :disabled="busy" />
        </label>
        <label v-if="mode !== 'reset' || recoveringPassword">Password
          <input v-model="password" type="password" :autocomplete="mode === 'signup' || recoveringPassword ? 'new-password' : 'current-password'" :minlength="mode === 'signup' || recoveringPassword ? 8 : 1" required :disabled="busy" />
        </label>
        <p v-if="mode === 'signup'" class="muted">Use at least 8 characters. Your saved builds are private to your account.</p>
        <button class="btn primary" :disabled="busy || !supabase">{{ busy ? 'Please wait…' : recoveringPassword ? 'Update password' : mode === 'reset' ? 'Send reset link' : heading }}</button>
      </form>
      <div v-if="!recoveringPassword" class="account-actions">
        <button class="link-button" :disabled="busy" @click="mode = mode === 'signup' ? 'signin' : 'signup'; error = ''; message = ''">{{ mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account' }}</button>
        <button class="link-button" :disabled="busy" @click="mode = mode === 'reset' ? 'signin' : 'reset'; error = ''; message = ''">{{ mode === 'reset' ? 'Back to sign in' : 'Forgot your password?' }}</button>
      </div>
    </template>
    <p v-if="error || authError" class="notice" role="alert">{{ error || authError }}</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p class="muted">Read how account information and saved images are stored in our <RouterLink to="/privacy">privacy notice</RouterLink>.</p>
  </div>
</template>

<style scoped>
.account-page { max-width: 640px; padding-block: 32px; }
.account-form { display: grid; gap: 20px; padding: 24px; margin-block: 24px; }
.account-form label { display: grid; gap: 8px; font-weight: 600; }
.account-form input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
.account-actions { display: flex; flex-wrap: wrap; gap: 16px; margin-block: 20px; }
</style>
