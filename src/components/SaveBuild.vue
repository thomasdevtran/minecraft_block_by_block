<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { authReady, user } from '../lib/auth'
import { currentSkin } from '../lib/skinStore'
import { saveBuild, type SavedBuild } from '../lib/savedBuilds'
import { supabase } from '../lib/supabase'

const props = defineProps<{
  title: string; path: string; guideKey: string; step: number; total: number
  cubes: number; paints: number; skin?: boolean
}>()
const name = ref(props.title.slice(0, 100))
const saved = ref<SavedBuild | null>(null)
const busy = ref(false)
const error = ref('')
let request = 0
watch([() => props.guideKey, () => user.value?.id], () => {
  request++
  name.value = props.title.slice(0, 100)
  saved.value = null
  error.value = ''
})

async function save() {
  if (busy.value) return
  const token = ++request
  busy.value = true
  error.value = ''
  try {
    const result = await saveBuild({
      title: name.value, path: props.path, guideKey: props.guideKey, step: props.step,
      total: props.total, cubes: props.cubes, paints: props.paints,
      skin: props.skin && currentSkin.value ? { ...currentSkin.value } : undefined,
    }, saved.value)
    if (token === request) saved.value = result
  } catch (failure) {
    if (token === request) error.value = failure instanceof Error ? failure.message : 'Could not save your build. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <details v-if="supabase && authReady" class="save-build">
    <summary>{{ saved ? 'Saved to My Builds' : 'Save to My Builds' }}</summary>
    <form v-if="user" @submit.prevent="save">
      <label>Build name <input v-model="name" type="text" maxlength="100" required :disabled="busy" /></label>
      <p v-if="skin" class="muted">Saving uploads this skin to your private library so you can open it on another device.</p>
      <div class="save-actions">
        <button class="btn" :disabled="busy">{{ busy ? 'Saving…' : saved ? 'Save current step' : 'Save build and current step' }}</button>
        <RouterLink to="/library">Open My Builds</RouterLink>
      </div>
      <p v-if="saved" role="status">Saved at step {{ saved.current_step }} of {{ saved.total_steps }}. Save again to update your place.</p>
    </form>
    <p v-else><RouterLink :to="{ path: '/account', query: { next: path } }">Sign in or create an account</RouterLink> to save this build.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>

<style scoped>
.save-build { margin-bottom: 20px; padding: 12px 0; border-block: 1px solid var(--line); }
summary { cursor: pointer; font-weight: 700; min-height: 32px; }
form { display: grid; gap: 12px; padding-top: 12px; }
label { display: grid; gap: 6px; }
input { max-width: 100%; box-sizing: border-box; }
.save-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
@media print { .save-build { display: none; } }
</style>
