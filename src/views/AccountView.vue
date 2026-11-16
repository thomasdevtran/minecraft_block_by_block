<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CommunityUsername from '../components/CommunityUsername.vue'
import { isCommunityReturnPath } from '../lib/communityDiscussions'
import {
  ageCheck, ageDeclined, authError, authReady, confirmAge, declineAccount, oldEnough, recoveringPassword, retryAgeCheck, user,
} from '../lib/auth'
import { SITE } from '../lib/site'
import { accountsEnabled, requireSupabase } from '../lib/supabase'

const route = useRoute()
const router = useRouter()
const mode = ref<'signin' | 'signup' | 'reset'>('signin')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
watch(() => user.value?.id, () => { password.value = '' })

/*
 * Neutral age screen. Everyone creating an account is asked for a birth month and year, with
 * nothing pre-filled and nothing said beforehand about what an answer leads to. Under 13: no account
 * is created and nothing is sent anywhere; the browser only remembers that the question was answered,
 * so the form doesn't come straight back. Accounts made before the screen existed answer it once.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const thisYear = new Date().getFullYear()
const birthMonth = ref('')
const birthYear = ref('')
function readBirth(): { month: number; year: number } {
  const month = Number(birthMonth.value)
  const yearText = birthYear.value.trim()
  const year = Number(yearText)
  if (!month || !/^\d{4}$/.test(yearText) || year < 1900 || year > thisYear) {
    throw new Error('Choose your birth month and enter the four-digit year you were born.')
  }
  return { month, year }
}
function clearForm() {
  email.value = password.value = birthMonth.value = birthYear.value = ''
}

const signedIn = computed(() => !!user.value && !recoveringPassword.value)
/** A signed-in account that hasn't answered the age question yet. */
const askingAge = computed(() => signedIn.value && ageCheck.value === 'needed')
const ageOk = computed(() => ageCheck.value === 'passed' || ageCheck.value === 'not-required')
const declined = computed(() => !user.value && mode.value === 'signup' && ageDeclined.value)
const declinedNote = ref<HTMLElement>()

const heading = computed(() => recoveringPassword.value ? 'Choose a new password'
  : askingAge.value ? 'One quick question'
  : signedIn.value ? 'Your account'
  : mode.value === 'signup' ? 'Create your account' : mode.value === 'reset' ? 'Reset your password' : 'Sign in')
const submitLabel = computed(() => busy.value ? 'Please wait…' : recoveringPassword.value ? 'Update password'
  : askingAge.value ? 'Continue' : mode.value === 'reset' ? 'Send reset link' : heading.value)
const nextPath = computed(() => {
  const path = route.query.next
  return typeof path === 'string' && (isCommunityReturnPath(path) || /^\/(library|item\/[a-z0-9_]+|skin(?:\/guide)?)(?:\?[^#]*)?$/.test(path)) ? path : '/library'
})

function switchMode(next: 'signin' | 'signup' | 'reset') {
  mode.value = next
  error.value = ''
  message.value = ''
}

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (askingAge.value) return await answerAge()
    const client = await requireSupabase()
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
      const birth = readBirth()
      if (!oldEnough(birth.month, birth.year)) {
        declineAccount()
        clearForm()
        // The form (and the button that had focus) is replaced by the note; take focus there.
        await nextTick()
        declinedNote.value?.focus()
        return
      }
      // The database checks the answer again, records only that it passed, and drops the date.
      const result = await client.auth.signUp({
        email: email.value.trim(), password: password.value,
        options: { emailRedirectTo: new URL('/account', location.origin).href, data: { birth_month: birth.month, birth_year: birth.year } },
      })
      if (result.error) throw result.error
      clearForm()
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

async function answerAge() {
  const birth = readBirth()
  const passed = await confirmAge(birth.month, birth.year)
  clearForm()
  if (passed) {
    message.value = 'Thanks! You’re all set.'
    return
  }
  // The account stays, so a parent can ask for it to be deleted, but it can't be used here.
  declineAccount()
  await (await requireSupabase()).auth.signOut({ scope: 'local' })
  message.value = `Thanks for telling us. This account can’t be used, but every build guide works without signing in. A parent or guardian can email ${SITE.operator.email} to delete it.`
}

async function signOut() {
  busy.value = true
  error.value = ''
  try {
    const { error: failure } = await (await requireSupabase()).auth.signOut({ scope: 'local' })
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
    <p class="eyebrow">Your crafting table</p>
    <h1>{{ heading }}</h1>
    <p v-if="!askingAge">Save your builds and open them on another device.</p>
    <p v-if="!accountsEnabled" class="notice">Accounts are being set up. Please check back soon.</p>
    <p v-else-if="!authReady" role="status">Checking your sign-in…</p>
    <template v-else>
      <p v-if="signedIn">Signed in as <strong>{{ user!.email }}</strong>.</p>

      <p v-if="declined" ref="declinedNote" class="notice" tabindex="-1">
        Thanks for telling us. You can’t create an account here, but every build guide works without one, and your
        progress is saved on this device.
      </p>
      <form v-else-if="!signedIn || askingAge" class="account-form card" @submit.prevent="submit">
        <p v-if="askingAge" class="muted">We ask everyone this once.</p>
        <label v-if="!recoveringPassword && !askingAge">Email
          <input v-model="email" type="email" autocomplete="email" required maxlength="254" :disabled="busy" />
        </label>
        <label v-if="!askingAge && (mode !== 'reset' || recoveringPassword)">Password
          <input v-model="password" type="password" :autocomplete="mode === 'signup' || recoveringPassword ? 'new-password' : 'current-password'" :minlength="mode === 'signup' || recoveringPassword ? 8 : 1" required :disabled="busy" />
        </label>
        <p v-if="mode === 'signup' && !askingAge && !recoveringPassword" class="muted">Use at least 8 characters. Your saved builds are private to your account.</p>
        <!-- Nothing is pre-selected and no year is suggested, so the answer is the person's own. -->
        <fieldset v-if="askingAge || (mode === 'signup' && !recoveringPassword)" class="birth" :disabled="busy">
          <legend>When were you born?</legend>
          <div class="birth-fields">
            <label>Month
              <select v-model="birthMonth" required autocomplete="bday-month">
                <option value="" disabled>Choose a month</option>
                <option v-for="(name, i) in MONTHS" :key="name" :value="String(i + 1)">{{ name }}</option>
              </select>
            </label>
            <label>Year
              <input v-model="birthYear" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="bday-year" />
            </label>
          </div>
          <p class="muted small">Your birthday itself isn’t saved.</p>
        </fieldset>
        <button class="btn primary" :disabled="busy">{{ submitLabel }}</button>
      </form>

      <template v-if="signedIn && !askingAge">
        <p v-if="ageCheck === 'failed'" class="notice">
          This account can’t save builds or use Community. Every build guide still works without signing in. A parent or
          guardian can email <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a> to delete it.
        </p>
        <p v-else-if="ageCheck === 'unknown'" role="status">Checking your account…</p>
        <div v-else-if="ageCheck === 'error'" class="notice error-box">
          <p role="alert">Couldn’t check your account. Check your connection and try again.</p>
          <button type="button" class="btn" @click="retryAgeCheck">Try again</button>
        </div>
        <div class="account-actions">
          <RouterLink v-if="ageOk" class="btn primary" :to="nextPath">{{ isCommunityReturnPath(nextPath) ? 'Return to Community' : 'Continue to your builds' }}</RouterLink>
          <button type="button" class="btn" :disabled="busy" @click="signOut">Sign out</button>
        </div>
        <CommunityUsername
          v-if="ageOk"
          :key="`${user!.id}:${user!.email_confirmed_at ?? ''}`"
          :email-confirmed="Boolean(user!.email_confirmed_at)"
        />
      </template>

      <div v-if="!user && !recoveringPassword" class="account-actions">
        <button type="button" class="link-button" :disabled="busy" @click="switchMode(mode === 'signup' ? 'signin' : 'signup')">{{ mode === 'signup' ? 'Already have an account? Sign in' : 'Create an account' }}</button>
        <button type="button" class="link-button" :disabled="busy" @click="switchMode(mode === 'reset' ? 'signin' : 'reset')">{{ mode === 'reset' ? 'Back to sign in' : 'Forgot your password?' }}</button>
      </div>
    </template>
    <p v-if="error || authError" class="notice error-box" role="alert">{{ error || authError }}</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p class="muted">Read how account information and saved images are stored in our <RouterLink to="/privacy">privacy notice</RouterLink>.</p>
  </div>
</template>

<style scoped>
.account-page { max-width: 640px; padding-block: 32px; }
.account-form { display: grid; gap: 20px; padding: 24px; margin-block: 24px; }
.account-form > p { margin: 0; }
.account-form label { display: grid; gap: 8px; font-weight: 600; }
.account-form input { width: 100%; }
.birth { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 10px; }
.birth legend { font-weight: 600; padding: 0; margin-bottom: 10px; }
.birth-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; }
.birth-fields select { width: 100%; }
.birth .small { margin: 0; font-size: .85rem; }
.account-actions { display: flex; flex-wrap: wrap; gap: 16px; margin-block: 20px; }
</style>
