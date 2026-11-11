<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { authReady, user } from '../lib/auth'
import { COMMUNITY_CATEGORIES, createCommunityReply, createCommunityTopic, type CommunityCategory } from '../lib/communityDiscussions'
import { loadMyCommunityProfile } from '../lib/communityProfiles'

const props = defineProps<{ returnTo: string; topicId?: string }>()
const emit = defineEmits<{ posted: [id: string] }>()
const accountLink = computed(() => ({ path: '/account', query: { next: props.returnTo } }))
const username = ref('')
const checkingProfile = ref(false)
const profileError = ref('')
const category = ref<CommunityCategory>('help')
const title = ref('')
const body = ref('')
const saving = ref(false)
const error = ref('')
let generation = 0
onScopeDispose(() => { generation++ })

async function loadProfile() {
  if (!authReady.value || !user.value?.email_confirmed_at) return
  const token = generation
  checkingProfile.value = true
  profileError.value = ''
  try {
    const profile = await loadMyCommunityProfile()
    if (token === generation) username.value = profile?.username ?? ''
  } catch (failure) {
    if (token === generation) profileError.value = failure instanceof Error ? failure.message : 'Could not check your username.'
  } finally {
    if (token === generation) checkingProfile.value = false
  }
}

watch([authReady, () => user.value?.id, () => user.value?.email_confirmed_at, () => props.topicId], () => {
  generation++
  username.value = ''
  title.value = ''
  body.value = ''
  error.value = ''
  profileError.value = ''
  checkingProfile.value = false
  saving.value = false
  void loadProfile()
}, { immediate: true })

async function submit() {
  if (saving.value || !username.value) return
  const token = generation
  saving.value = true
  error.value = ''
  try {
    const id = props.topicId
      ? await createCommunityReply(props.topicId, body.value)
      : await createCommunityTopic(category.value, title.value, body.value)
    if (token !== generation) return
    body.value = ''
    title.value = ''
    emit('posted', id)
  } catch (failure) {
    if (token === generation) error.value = failure instanceof Error ? failure.message : 'Could not publish your post. Please try again.'
  } finally {
    if (token === generation) saving.value = false
  }
}
</script>

<template>
  <p v-if="!authReady || checkingProfile" role="status">Checking your account…</p>
  <p v-else-if="!user" class="notice"><RouterLink :to="accountLink">Sign in</RouterLink> to {{ topicId ? 'reply' : 'start a topic' }}.</p>
  <p v-else-if="!user.email_confirmed_at" class="notice">Confirm your email before posting.</p>
  <div v-else-if="profileError" class="notice">
    <p role="alert">{{ profileError }}</p>
    <button class="btn" type="button" @click="loadProfile">Try again</button>
  </div>
  <p v-else-if="!username" class="notice"><RouterLink :to="accountLink">Choose a community username</RouterLink> on your Account page before posting.</p>
  <form v-else class="card post-form" @submit.prevent="submit">
    <p class="muted">Posting as <strong>@{{ username }}</strong>. Your post will be public.</p>
    <fieldset :disabled="saving">
      <template v-if="!topicId">
        <label>Category
          <select v-model="category">
            <option v-for="(label, value) in COMMUNITY_CATEGORIES" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <label>Title<input v-model="title" required minlength="5" maxlength="120" /></label>
      </template>
      <label>{{ topicId ? 'Your reply' : 'Message' }}
        <textarea v-model="body" :rows="topicId ? 4 : 7" required :maxlength="topicId ? 2000 : 4000" />
      </label>
      <button class="btn primary" type="submit">{{ saving ? 'Posting…' : topicId ? 'Post reply' : 'Post topic' }}</button>
    </fieldset>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.post-form { padding: 20px; }
.post-form > p:first-child { margin-top: 0; }
.post-form fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 16px; }
.post-form label { display: grid; gap: 6px; font-weight: 600; }
.post-form :is(input, select, textarea) { width: 100%; padding: 10px; font: inherit; font-weight: 400; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
.post-form textarea { resize: vertical; }
.post-form button { justify-self: start; }
</style>
