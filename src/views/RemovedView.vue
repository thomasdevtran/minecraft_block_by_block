<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { buildStyles, loadRemoved, textureUrl, type RemovedItem } from '../lib/catalog'

const items = ref<RemovedItem[]>([])
const error = ref('')

onMounted(async () => {
  document.title = 'Removed items · Block by Block'
  try {
    items.value = (await loadRemoved()).items
  } catch (e) {
    error.value = (e as Error).message
  }
})
</script>

<template>
  <div class="container">
    <h1>Removed from the game</h1>
    <p class="lead muted">
      Items and textures that used to be in Minecraft but aren't anymore, taken straight from the old versions of the
      game. For the old look of blocks and items that are still around, use the Old/New switch on their guides.
    </p>

    <p v-if="error" class="notice">{{ error }}</p>

    <ul class="list">
      <li v-for="item in items" :key="item.id">
        <RouterLink :to="`/removed/${item.id}`" class="card entry">
          <img :src="textureUrl(item)" alt="" class="pixelated" width="64" height="64" />
          <div>
            <h2>{{ item.name }}</h2>
            <p>{{ item.note }}</p>
            <p class="meta muted">
              From {{ item.source }}<template v-if="buildStyles(item)"> · {{ buildStyles(item) }}</template>
            </p>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.lead {
  font-size: 1.05rem;
  max-width: 46em;
}

.list {
  list-style: none;
  padding: 0;
  margin: 24px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 12px;
}

.entry {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
  color: var(--ink);
  text-decoration: none;
  height: 100%;
}

.entry:hover {
  border-color: var(--accent);
}

.entry img {
  flex: none;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 6px;
  width: 76px;
  height: 76px;
}

.entry h2 {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.entry p {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}

.meta {
  font-size: 0.85rem !important;
}
</style>
