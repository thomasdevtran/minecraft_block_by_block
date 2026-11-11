<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { COMMUNITY_CATEGORIES, communityDate, listCommunityTopics, type CommunityCategory, type TopicSummary } from '../lib/communityDiscussions'
import { supabase } from '../lib/supabase'

const category = ref<CommunityCategory | ''>('')
const page = ref(0)
const retry = ref(0)
const topics = ref<TopicSummary[]>([])
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')

watch([category, page, retry], async ([filter, currentPage], _previous, onCleanup) => {
  if (!supabase) return
  let current = true
  onCleanup(() => { current = false })
  loading.value = true
  error.value = ''
  topics.value = []
  hasMore.value = false
  try {
    const result = await listCommunityTopics(filter, currentPage)
    if (!current) return
    topics.value = result.items
    hasMore.value = result.hasMore
  } catch (failure) {
    if (current) error.value = failure instanceof Error ? failure.message : 'Could not load topics.'
  } finally {
    if (current) loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <div class="container community-page">
    <p class="eyebrow muted">The shared workbench</p>
    <h1>Community</h1>
    <p>Ask for build help, show what you made, or suggest the next guide.</p>
    <p v-if="!supabase" class="notice">Discussions are not available yet. Please check back later.</p>
    <div v-else class="board-tools">
      <label>Category
        <select v-model="category" @change="page = 0">
          <option value="">All categories</option>
          <option v-for="(label, value) in COMMUNITY_CATEGORIES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <RouterLink v-if="!loading && !error" class="btn primary" to="/community/new">New topic</RouterLink>
    </div>
    <p v-if="loading" role="status">Loading topics…</p>
    <div v-else-if="error" class="notice">
      <p role="alert">{{ error }}</p>
      <button class="btn" type="button" @click="retry++">Try again</button>
    </div>
    <template v-else-if="supabase">
      <p v-if="!topics.length" class="notice">{{ page ? 'No topics on this page.' : 'No topics here yet. Start a conversation with New topic.' }}</p>
      <ul v-else class="topic-list" aria-label="Discussion topics">
        <li v-for="topic in topics" :key="topic.id" class="card">
          <p class="eyebrow muted">{{ COMMUNITY_CATEGORIES[topic.category] }}</p>
          <h2><RouterLink :to="{ name: 'community-topic', params: { topicId: topic.id } }">{{ topic.title }}</RouterLink></h2>
          <p class="muted">{{ topic.author ? `@${topic.author.username}` : 'Deleted account' }} · <time :datetime="topic.created_at">{{ communityDate(topic.created_at) }}</time></p>
        </li>
      </ul>
      <nav v-if="page || hasMore" class="pages" aria-label="Topic pages">
        <button class="btn" type="button" :disabled="page === 0" @click="page--">Previous</button>
        <span>Page {{ page + 1 }}</span>
        <button class="btn" type="button" :disabled="!hasMore" @click="page++">Next</button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.community-page { max-width: 880px; padding-block: 24px; }
.board-tools, .pages { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-block: 24px; }
.board-tools { justify-content: space-between; }
.board-tools label { display: grid; gap: 6px; font-weight: 600; }
.board-tools select { min-height: 44px; font: inherit; color: var(--ink); background: var(--surface); border: 2px solid var(--line); border-radius: var(--radius); padding: 6px 12px; }
.pages { align-items: center; }
.topic-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.topic-list li { padding: 16px 20px; overflow-wrap: anywhere; }
.topic-list h2 { font: 700 1.2rem var(--sans); margin-block: 4px 8px; }
.topic-list p { margin-block: 0; }
</style>
