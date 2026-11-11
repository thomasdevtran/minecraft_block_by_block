<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import CommunityPostForm from '../components/CommunityPostForm.vue'
import CommunityReportForm from '../components/CommunityReportForm.vue'
import { COMMUNITY_CATEGORIES, communityDate, listCommunityReplies, loadCommunityTopic, type CommunityReply, type CommunityTopic } from '../lib/communityDiscussions'
import { supabase } from '../lib/supabase'

const props = defineProps<{ topicId: string }>()
const topic = ref<CommunityTopic | null>(null)
const topicLoading = ref(false)
const topicError = ref('')
const retryTopic = ref(0)
const replies = ref<CommunityReply[]>([])
const page = ref(0)
const reloadReplies = ref(0)
const repliesLoading = ref(false)
const repliesError = ref('')
const moreReplies = ref(false)
const posted = ref(false)

watch([() => props.topicId, retryTopic], async ([id], _previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  topic.value = null
  posted.value = false
  page.value = 0
  topicError.value = ''
  if (!supabase) return
  topicLoading.value = true
  try {
    const result = await loadCommunityTopic(id)
    if (current) topic.value = result
  } catch (failure) {
    if (current) topicError.value = failure instanceof Error ? failure.message : 'Could not load this topic.'
  } finally {
    if (current) topicLoading.value = false
  }
}, { immediate: true })

watch([() => topic.value?.id, page, reloadReplies], async ([id, currentPage], _previous, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  replies.value = []
  repliesError.value = ''
  moreReplies.value = false
  repliesLoading.value = Boolean(id)
  if (!id) return
  try {
    const result = await listCommunityReplies(id, currentPage)
    if (!current) return
    replies.value = result.items
    moreReplies.value = result.hasMore
  } catch (failure) {
    if (current) repliesError.value = failure instanceof Error ? failure.message : 'Could not load replies.'
  } finally {
    if (current) repliesLoading.value = false
  }
}, { immediate: true })

function replyPosted() {
  posted.value = true
  page.value = 0
  reloadReplies.value++
}
</script>

<template>
  <div class="container topic-page">
    <RouterLink to="/community">← Community</RouterLink>
    <p v-if="!supabase" class="notice">Discussions are not available yet. Please check back later.</p>
    <p v-else-if="topicLoading" role="status">Loading topic…</p>
    <div v-else-if="topicError" class="notice">
      <p role="alert">{{ topicError }}</p>
      <button class="btn" type="button" @click="retryTopic++">Try again</button>
    </div>
    <template v-else-if="topic">
      <article class="original-post">
        <p class="eyebrow muted">{{ COMMUNITY_CATEGORIES[topic.category] }}</p>
        <h1>{{ topic.title }}</h1>
        <p class="muted">{{ topic.author ? `@${topic.author.username}` : 'Deleted account' }} · <time :datetime="topic.created_at">{{ communityDate(topic.created_at) }}</time></p>
        <p class="post-body">{{ topic.body }}</p>
        <CommunityReportForm :topic-id="topic.id" />
      </article>
      <section aria-labelledby="replies-heading">
        <h2 id="replies-heading">Replies</h2>
        <p v-if="topic.locked" class="notice">This topic is locked. New replies are closed.</p>
        <CommunityPostForm v-else :topic-id="topic.id" :return-to="`/community/${topic.id}`" @posted="replyPosted" />
        <p v-if="posted" role="status">Reply posted.</p>
        <p v-if="repliesLoading" role="status">Loading replies…</p>
        <div v-else-if="repliesError" class="notice">
          <p role="alert">{{ repliesError }}</p>
          <button class="btn" type="button" @click="reloadReplies++">Try again</button>
        </div>
        <template v-else>
          <p v-if="!replies.length" class="muted">{{ page ? 'No replies on this page.' : 'No replies yet.' }}</p>
          <template v-else>
            <p class="muted">Newest replies first</p>
            <ol class="replies">
              <li v-for="reply in replies" :key="reply.id" class="card">
                <p class="muted">{{ reply.author ? `@${reply.author.username}` : 'Deleted account' }} · <time :datetime="reply.created_at">{{ communityDate(reply.created_at) }}</time></p>
                <p class="post-body">{{ reply.body }}</p>
                <CommunityReportForm :topic-id="topic.id" :reply-id="reply.id" />
              </li>
            </ol>
          </template>
          <nav v-if="page || moreReplies" class="pages" aria-label="Reply pages">
            <button class="btn" type="button" :disabled="page === 0" @click="page--">Previous</button>
            <span>Page {{ page + 1 }}</span>
            <button class="btn" type="button" :disabled="!moreReplies" @click="page++">Next</button>
          </nav>
        </template>
      </section>
    </template>
    <p v-else class="notice">This topic could not be found.</p>
  </div>
</template>

<style scoped>
.topic-page { max-width: 800px; padding-block: 24px; }
.original-post { margin-block: 24px; overflow-wrap: anywhere; }
.post-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.replies { list-style: none; padding: 0; display: grid; gap: 12px; }
.replies li { padding: 14px 18px; }
.replies p { margin-block: 0 8px; }
.replies p:last-child { margin: 0; }
.pages { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-block: 20px; }
</style>
