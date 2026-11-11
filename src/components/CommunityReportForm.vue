<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { user } from '../lib/auth'
import { REPORT_REASONS, reportCommunityContent, type ReportReason } from '../lib/communityModeration'

const props = defineProps<{ topicId: string; replyId?: string }>()
const reason = ref<ReportReason>('spam')
const details = ref('')
const busy = ref(false)
const error = ref('')
const sent = ref(false)
let generation = 0
onScopeDispose(() => { generation++ })
watch([() => user.value?.id, () => props.topicId, () => props.replyId], () => {
  generation++
  reason.value = 'spam'
  details.value = ''
  error.value = ''
  sent.value = false
  busy.value = false
})

async function submit() {
  if (busy.value || sent.value) return
  const token = generation
  busy.value = true
  error.value = ''
  try {
    await reportCommunityContent(props.replyId ? { replyId: props.replyId } : { topicId: props.topicId }, reason.value, details.value)
    if (token === generation) { sent.value = true; details.value = '' }
  } catch (failure) {
    if (token === generation) error.value = failure instanceof Error ? failure.message : 'Could not submit your report.'
  } finally {
    if (token === generation) busy.value = false
  }
}
</script>

<template>
  <details class="report-form">
    <summary>{{ replyId ? 'Report reply' : 'Report topic' }}</summary>
    <p v-if="!user"><RouterLink :to="{ path: '/account', query: { next: `/community/${topicId}` } }">Sign in</RouterLink> to report content.</p>
    <p v-else-if="!user.email_confirmed_at">Confirm your email before reporting content.</p>
    <p v-else-if="sent" role="status">Report received. Moderators will review it.</p>
    <form v-else @submit.prevent="submit">
      <p class="muted">Your report is private to moderators. Please avoid sharing personal information.</p>
      <fieldset :disabled="busy">
        <label>Reason
          <select v-model="reason"><option v-for="(label, value) in REPORT_REASONS" :key="value" :value="value">{{ label }}</option></select>
        </label>
        <label>Details (optional)<textarea v-model="details" rows="3" maxlength="1000" /></label>
        <button class="btn" type="submit">{{ busy ? 'Sending…' : 'Send report' }}</button>
      </fieldset>
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
    </form>
  </details>
</template>

<style scoped>
.report-form { margin-block: 12px; font-size: 0.9rem; }
.report-form summary { cursor: pointer; min-height: 32px; display: list-item; padding-block: 6px; color: var(--ink-soft); }
.report-form form { max-width: 560px; }
.report-form fieldset { padding: 0; margin: 0; border: 0; min-width: 0; display: grid; gap: 12px; }
.report-form label { display: grid; gap: 6px; font-weight: 600; }
.report-form :is(select, textarea) { width: 100%; font: inherit; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
.report-form textarea { resize: vertical; }
.report-form button { justify-self: start; }
</style>
