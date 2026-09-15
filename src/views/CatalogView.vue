<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { loadCatalog, textureUrl, type CatalogItem } from '../lib/catalog'

const items = ref<CatalogItem[]>([])
const version = ref('')
const error = ref('')
const query = ref('')
const TABS = [
  ['all', 'All'],
  ['plant', 'Plants'],
  ['item', 'Items'],
] as const
const category = ref<(typeof TABS)[number][0]>('all')

onMounted(async () => {
  try {
    const catalog = await loadCatalog()
    items.value = catalog.items
    version.value = catalog.version
  } catch (e) {
    error.value = (e as Error).message
  }
})

const FEATURED = ['poppy', 'dandelion', 'cornflower', 'blue_orchid', 'diamond_sword', 'apple']

const featured = computed(() =>
  FEATURED.map((id) => items.value.find((i) => i.id === id)).filter((i): i is CatalogItem => !!i),
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value.filter(
    (i) =>
      (category.value === 'all' || i.category === category.value) &&
      (!q || i.name.toLowerCase().includes(q) || i.id.includes(q)),
  )
})
</script>

<template>
  <div class="container">
    <section class="hero">
      <div>
        <h1>Build Minecraft in real life, one cube at a time</h1>
        <p class="lead muted">
          Pick an item or skin. You'll get a paint list and a cube count, then one small step at a time, so you never
          have to squint at a reference picture.
        </p>
        <div class="hero-actions">
          <a href="#catalog" class="btn primary">Browse items</a>
          <RouterLink to="/skin" class="btn">Build a player skin</RouterLink>
        </div>
      </div>
      <div v-if="featured.length" class="featured">
        <RouterLink v-for="item in featured" :key="item.id" :to="`/item/${item.id}`" class="feat" :title="item.name">
          <img :src="textureUrl(item)" :alt="item.name" class="pixelated" width="64" height="64" />
        </RouterLink>
      </div>
    </section>

    <section id="catalog">
      <div class="toolbar">
        <h2>Items</h2>
        <div class="filters">
          <input v-model="query" type="search" placeholder="Search 700+ items…" aria-label="Search items" />
          <div class="tabs" role="tablist">
            <button
              v-for="[value, label] in TABS"
              :key="value"
              role="tab"
              :aria-selected="category === value"
              :class="['tab', { active: category === value }]"
              @click="category = value"
            >
              {{ label }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="error" class="notice">{{ error }}</p>
      <p v-else-if="items.length && !filtered.length" class="muted">No items match “{{ query }}”.</p>

      <ul class="grid">
        <li v-for="item in filtered" :key="item.id">
          <RouterLink :to="`/item/${item.id}`" class="tile card">
            <img :src="textureUrl(item)" alt="" class="pixelated" width="48" height="48" loading="lazy" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="version" class="muted small">Textures from Minecraft {{ version }}.</p>
    </section>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  align-items: center;
  margin-bottom: 40px;
}

@media (max-width: 760px) {
  .hero {
    grid-template-columns: 1fr;
  }
}

.lead {
  font-size: 1.1rem;
  max-width: 38em;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.featured {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.feat {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  transition: transform 0.1s;
}

.feat:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.feat img {
  width: 60%;
  height: auto;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar h2 {
  margin: 0;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filters input {
  width: min(260px, 100%);
}

.tabs {
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 3px;
}

.tab {
  font: 600 0.9rem var(--sans);
  border: none;
  background: none;
  color: var(--ink-soft);
  padding: 0.45em 0.9em;
  border-radius: 8px;
  cursor: pointer;
}

.tab.active {
  background: var(--surface);
  color: var(--ink);
}

.grid {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px 10px;
  text-decoration: none;
  color: var(--ink);
  font-size: 0.88rem;
  text-align: center;
  height: 100%;
  transition: border-color 0.1s;
}

.tile:hover {
  border-color: var(--accent);
}

.small {
  font-size: 0.85rem;
}
</style>
