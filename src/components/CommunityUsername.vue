<script setup lang="ts">
import { ref } from 'vue'
import { loadMyCommunityProfile, saveMyCommunityUsername } from '../lib/communityProfiles'

const props = defineProps<{ emailConfirmed: boolean }>()
const loadState = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle')
const username = ref('')
const saving = ref(false)
const error = ref('')
const saved = ref('')

async function loadUsername() {
  if (!props.emailConfirmed || loadState.value === 'loading') return
  loadState.value = 'loading'
  error.value = ''
  try {
    username.value = (await loadMyCommunityProfile())?.username ?? ''
    loadState.value = 'ready'
  } catch (failure) {
    loadState.value = 'failed'
    error.value = failure instanceof Error ? failure.message : 'Could not load your username. Please try again.'
  }
}

function onToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open && loadState.value === 'idle') void loadUsername()
}

async function saveUsername() {
  if (!props.emailConfirmed || loadState.value !== 'ready' || saving.value) return
  saving.value = true
  error.value = ''
  saved.value = ''
  try {
    const profile = await saveMyCommunityUsername(username.value)
    username.value = profile.username
    saved.value = `Saved as @${profile.username}.`
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not save your username. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <details class="community-username card" @toggle="onToggle">
    <summary>Community username</summary>
    <p class="muted">Your username is public and will appear on your community posts. Your email stays private.</p>
    <p v-if="!emailConfirmed" class="notice">Confirm your email before choosing a username.</p>
    <p v-else-if="loadState === 'loading'" role="status">Loading your username…</p>
    <button v-else-if="loadState === 'failed'" class="btn" type="button" @click="loadUsername">Try again</button>
    <form v-else-if="loadState === 'ready'" class="username-form" @submit.prevent="saveUsername">
      <label for="community-username">Username</label>
      <input
        id="community-username"
        v-model="username"
        aria-describedby="community-username-rules"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        maxlength="24"
        placeholder="cube_builder"
        required
        :disabled="saving"
        @input="saved = ''; error = ''"
      />
      <p id="community-username-rules" class="muted">Use 3–24 letters, numbers, or underscores. Start with a letter.</p>
      <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save username' }}</button>
    </form>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <p v-if="saved" role="status">{{ saved }}</p>
  </details>
</template>

<style scoped>
.community-username { margin-block: 24px; padding: 16px 20px; }
.community-username summary { cursor: pointer; font-weight: 650; min-height: 24px; }
.username-form { display: grid; gap: 8px; }
.username-form label { font-weight: 600; }
.username-form input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
.username-form p { margin: 0 0 4px; }
.username-form button { justify-self: start; }
</style>
