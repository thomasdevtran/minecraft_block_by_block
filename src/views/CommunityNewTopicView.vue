<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import CommunityPostForm from '../components/CommunityPostForm.vue'
import { supabase } from '../lib/supabase'

const router = useRouter()
function openTopic(id: string) {
  void router.push({ name: 'community-topic', params: { topicId: id } })
}
</script>

<template>
  <div class="container new-topic-page">
    <RouterLink to="/community">← Community</RouterLink>
    <h1>New topic</h1>
    <p>Pick the category that fits your post. For build help, include the guide name and the step you’re on.</p>
    <CommunityPostForm v-if="supabase" return-to="/community/new" @posted="openTopic" />
    <p v-else class="notice">Discussions are not available yet. Please check back later.</p>
  </div>
</template>

<style scoped>
.new-topic-page { max-width: 720px; padding-block: 24px; }
.new-topic-page h1 { margin-block: 20px 8px; }
</style>
