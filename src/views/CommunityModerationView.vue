<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { authReady, user } from '../lib/auth'
import { communityDate } from '../lib/communityDiscussions'
import { isCommunityModerator, loadCommunityReportQueue, REPORT_REASONS, reviewCommunityReport, type CommunityReport, type ReviewAction } from '../lib/communityModeration'
import { supabase } from '../lib/supabase'

const filter = ref<'open' | 'reviewed'>('open')
const page = ref(0)
const retry = ref(0)
const allowed = ref(false)
const loading = ref(false)
const reports = ref<CommunityReport[]>([])
const hasMore = ref(false)
const error = ref('')
const notice = ref('')
const busy = ref('')
const notes = ref<Record<string, string>>({})
let generation = 0

watch(() => user.value?.id, () => { notes.value = {}; notice.value = ''; busy.value = '' })
watch([authReady, () => user.value?.id, () => user.value?.email_confirmed_at, filter, page, retry], async (_value, _old, onCleanup) => {
  const token = ++generation
  let current = true
  onCleanup(() => { current = false; generation++ })
  reports.value = []
  hasMore.value = false
  allowed.value = false
  error.value = ''
  loading.value = false
  if (!supabase || !authReady.value || !user.value) return
  loading.value = true
  try {
    const moderator = await isCommunityModerator()
    if (!current || token !== generation) return
    allowed.value = moderator
    if (!moderator) return
    const result = await loadCommunityReportQueue(filter.value === 'reviewed', page.value)
    if (!current || token !== generation) return
    reports.value = result.items
    hasMore.value = result.hasMore
  } catch (failure) {
    if (current && token === generation) error.value = failure instanceof Error ? failure.message : 'Could not load the report queue.'
  } finally {
    if (current && token === generation) loading.value = false
  }
}, { immediate: true })

async function review(report: CommunityReport, action: ReviewAction) {
  if (busy.value) return
  const token = generation
  busy.value = report.report_id
  error.value = ''
  notice.value = ''
  try {
    await reviewCommunityReport(report, action, notes.value[report.report_id] ?? '')
    if (token !== generation) return
    delete notes.value[report.report_id]
    notice.value = action === 'hide' ? 'Content hidden and report reviewed.' : action === 'restore' ? 'Content restored.' : 'Report dismissed.'
    retry.value++
  } catch (failure) {
    if (token === generation) error.value = failure instanceof Error ? failure.message : 'Could not save the review.'
  } finally {
    if (busy.value === report.report_id) busy.value = ''
  }
}
</script>

<template>
  <div class="container moderation-page">
    <RouterLink to="/community">← Community</RouterLink>
    <h1>Report queue</h1>
    <p>Review reported content. Every decision is recorded for moderators.</p>
    <p v-if="!supabase" class="notice">Reporting and moderation are not available yet.</p>
    <p v-else-if="!authReady || loading" role="status">Checking the report queue…</p>
    <p v-else-if="!user" class="notice"><RouterLink to="/account?next=/community/moderation">Sign in</RouterLink> with a moderator account.</p>
    <p v-else-if="!allowed && !error" class="notice">Moderator access required.</p>
    <div v-if="error" class="notice">
      <p role="alert">{{ error }}</p>
      <button class="btn" type="button" :disabled="!!busy" @click="retry++">Refresh queue</button>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="allowed">
      <div class="queue-tools">
        <label>Show
          <select v-model="filter" :disabled="!!busy" @change="page = 0">
            <option value="open">Needs review</option><option value="reviewed">Reviewed reports</option>
          </select>
        </label>
        <button class="btn" type="button" :disabled="!!busy || loading" @click="retry++">Refresh</button>
      </div>
      <p v-if="!loading && !error && !reports.length" class="notice">{{ filter === 'open' ? 'No reports need review.' : 'No reviewed reports on this page.' }}</p>
      <ol class="report-list" aria-label="Reports">
        <li v-for="report in reports" :key="report.report_id" class="card">
          <p class="eyebrow muted">{{ report.reply_id ? 'Reported reply' : 'Reported topic' }} · {{ REPORT_REASONS[report.reason] }}</p>
          <h2>{{ report.content_title }}</h2>
          <p class="muted">By {{ report.author_name ? `@${report.author_name}` : 'Deleted account' }} · {{ report.content_hidden ? 'Hidden' : 'Visible' }}</p>
          <p v-if="report.reply_id && report.topic_hidden" class="notice">The parent topic is hidden. Restoring this reply will not make the topic public.</p>
          <p class="plain-text">{{ report.content_body }}</p>
          <RouterLink :to="`/community/${report.topic_id}`">Open topic</RouterLink>
          <div class="report-details">
            <p class="muted">Reported by {{ report.reporter_name ? `@${report.reporter_name}` : 'Community member' }} · <time :datetime="report.reported_at">{{ communityDate(report.reported_at) }}</time></p>
            <p v-if="report.details" class="plain-text">{{ report.details }}</p>
          </div>
          <template v-if="report.resolution">
            <p><strong>{{ report.resolution === 'hidden' ? 'Content hidden' : report.resolution === 'restored' ? 'Content restored' : 'Dismissed' }}</strong><template v-if="report.reviewed_at"> · {{ communityDate(report.reviewed_at) }}</template><template v-if="report.reviewer_name"> · @{{ report.reviewer_name }}</template></p>
            <p v-if="report.moderator_note" class="plain-text">{{ report.moderator_note }}</p>
          </template>
          <form v-if="!report.resolution || report.resolution === 'hidden'" @submit.prevent>
            <label :for="`note-${report.report_id}`">Moderator note (optional)</label>
            <textarea :id="`note-${report.report_id}`" v-model="notes[report.report_id]" rows="2" maxlength="1000" :disabled="!!busy" />
            <div class="review-actions">
              <template v-if="!report.resolution">
                <button class="btn" type="button" :disabled="!!busy" @click="review(report, 'dismiss')">Dismiss report</button>
                <button class="btn primary" type="button" :disabled="!!busy" @click="review(report, 'hide')">{{ report.reply_id ? 'Hide reply' : 'Hide topic' }}</button>
              </template>
              <button v-else class="btn" type="button" :disabled="!!busy" @click="review(report, 'restore')">{{ report.reply_id ? 'Restore reply' : 'Restore topic' }}</button>
              <span v-if="busy === report.report_id" role="status">Saving review…</span>
            </div>
          </form>
        </li>
      </ol>
      <nav v-if="page || hasMore" class="queue-tools" aria-label="Report pages">
        <button class="btn" type="button" :disabled="!page || !!busy" @click="page--">Previous</button>
        <span>Page {{ page + 1 }}</span>
        <button class="btn" type="button" :disabled="!hasMore || !!busy" @click="page++">Next</button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.moderation-page { max-width: 880px; padding-block: 24px; }
.queue-tools, .review-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-block: 16px; }
.queue-tools label, .report-list form { display: grid; gap: 6px; }
.report-list { list-style: none; display: grid; gap: 20px; margin: 0; padding: 0; }
.report-list > li { padding: 20px; overflow-wrap: anywhere; }
.report-list h2 { font: 700 1.25rem var(--sans); margin-block: 8px; }
.report-details { border-block: 1px solid var(--line); margin-top: 16px; }
.plain-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.moderation-page :is(select, textarea) { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
.report-list textarea { width: 100%; resize: vertical; }
</style>
