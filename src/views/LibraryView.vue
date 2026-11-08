<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { authReady, user } from '../lib/auth'
import { openBuild, type SavedBuild } from '../lib/savedBuilds'
import { requireSupabase, supabase } from '../lib/supabase'
import { showToast } from '../lib/toast'

const router = useRouter()
const builds = ref<SavedBuild[]>([])
const loading = ref(false)
const opening = ref('')
const error = ref('')
const loadFailed = ref(false)
const hasMore = ref(false)
const PAGE = 24
let generation = 0

async function loadMore() {
  if (!user.value || loading.value) return
  const token = generation
  loading.value = true
  error.value = ''
  loadFailed.value = false
  try {
    const start = builds.value.length
    const { data, error: failure } = await requireSupabase().from('saved_builds').select()
      .order('updated_at', { ascending: false }).order('id').range(start, start + PAGE - 1)
    if (failure) throw failure
    if (token !== generation) return
    builds.value.push(...data as SavedBuild[])
    hasMore.value = data.length === PAGE
  } catch (failure) {
    if (token === generation) {
      error.value = failure instanceof Error ? failure.message : 'Could not load your builds. Please try again.'
      loadFailed.value = true
    }
  } finally {
    if (token === generation) loading.value = false
  }
}

watch(() => user.value?.id, () => {
  generation++
  builds.value = []
  loading.value = false
  hasMore.value = false
  error.value = ''
  loadFailed.value = false
  if (user.value) void loadMore()
}, { immediate: true })

async function resume(build: SavedBuild) {
  if (opening.value) return
  opening.value = build.id
  error.value = ''
  const owner = user.value?.id
  try {
    const result = await openBuild(build)
    if (user.value?.id !== owner) return
    if (result.updated) showToast('This guide has been updated. Review Materials before continuing.')
    await router.push(result.path)
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Could not open this build. Please try again.'
  } finally {
    opening.value = ''
  }
}
</script>

<template>
  <div class="container library-page">
    <p class="eyebrow muted">Your crafting table</p>
    <h1>My Builds</h1>
    <p>Keep your projects together and open their saved steps on any device.</p>
    <p class="muted">Each account supports up to 100 saved builds and 100 private skin images, up to 1 MB each.</p>
    <p v-if="!supabase" class="notice">Accounts are being set up. Please check back soon.</p>
    <p v-else-if="!authReady" role="status">Checking your sign-in…</p>
    <p v-else-if="!user" class="notice"><RouterLink to="/account?next=/library">Sign in or create an account</RouterLink> to see your saved builds.</p>
    <template v-else>
      <div class="library-actions">
        <RouterLink class="btn" to="/">Find a build</RouterLink>
        <RouterLink class="btn" to="/skin">Upload or look up a skin</RouterLink>
        <RouterLink to="/account">Your account</RouterLink>
      </div>
      <p v-if="!loading && !error && !builds.length" class="notice">Your crafting table is ready. Open a guide and choose “Save to My Builds” to add your first project.</p>
      <ul class="saved-builds">
        <li v-for="build in builds" :key="build.id">
          <div>
            <p class="eyebrow muted">{{ build.kind === 'skin' ? 'Player skin' : 'Catalog build' }}</p>
            <h2>{{ build.title }}</h2>
            <p>{{ build.cube_count.toLocaleString() }} cubes · {{ build.paint_count }} paints · saved at step {{ build.current_step }} of {{ build.total_steps }}</p>
          </div>
          <button class="btn primary" :disabled="!!opening" @click="resume(build)">{{ opening === build.id ? 'Opening…' : 'Open build' }}</button>
        </li>
      </ul>
      <p v-if="loading" role="status">Loading your builds…</p>
      <button v-else-if="hasMore" class="btn" @click="loadMore">Load more builds</button>
      <div v-if="error" class="notice" role="alert">{{ error }} <button v-if="loadFailed" class="btn" @click="loadMore">Try again</button></div>
    </template>
  </div>
</template>

<style scoped>
.library-page { padding-block: 32px; }
.library-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-block: 24px; }
.saved-builds { list-style: none; padding: 0; margin: 0; }
.saved-builds li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding-block: 24px; border-top: 1px solid var(--line); }
.saved-builds li > div { min-width: 0; flex: 1 1 260px; overflow-wrap: anywhere; }
.saved-builds h2 { font-family: var(--sans); font-size: 1.25rem; margin-block: 4px 8px; }
</style>
