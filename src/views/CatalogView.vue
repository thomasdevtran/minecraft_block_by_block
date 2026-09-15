<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BlockIcon from '../components/BlockIcon.vue'
import ViewToggle from '../components/ViewToggle.vue'
import { blockUrl, buildStyles, loadCatalog, textureUrl, type Catalog, type CatalogItem, type Category } from '../lib/catalog'
import { look as sharedLook } from '../lib/look'

const look = computed({ get: () => sharedLook.value, set: (v) => (sharedLook.value = v) })
const LOOKS = [
  { value: 'current' as const, label: 'New textures', hint: '' },
  { value: 'classic' as const, label: 'Old textures', hint: '' },
]

const items = ref<CatalogItem[]>([])
const groupOrder = ref<Catalog['groups']>({})
const version = ref('')
const classicVersion = ref('')
const error = ref('')
const query = ref('')
const TABS: [Category | 'all', string][] = [
  ['all', 'All'],
  ['block', 'Blocks'],
  ['plant', 'Plants'],
  ['item', 'Items'],
]
const category = ref<Category | 'all'>('all')
/** Selected sub-group (Flowers, Ores…), or null for the whole tab. */
const group = ref<string | null>(null)

function selectCategory(value: Category | 'all') {
  category.value = value
  group.value = null
}

onMounted(async () => {
  try {
    const catalog = await loadCatalog()
    items.value = catalog.items
    groupOrder.value = catalog.groups ?? {}
    version.value = catalog.version
    classicVersion.value = catalog.classicVersion
  } catch (e) {
    error.value = (e as Error).message
  }
})

/** Scrolls to the item list. Works on every click, not just the first. */
function scrollToCatalog() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById('catalog')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  // Put keyboard focus in the search box, but don't pop up the on-screen keyboard on phones.
  if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelector<HTMLInputElement>('#catalog input[type="search"]')?.focus({ preventScroll: true })
  }
}

const FEATURED =['grass_block', 'poppy', 'diamond_ore', 'tnt', 'cornflower', 'diamond_sword']

const featured = computed(() =>
  FEATURED.map((id) => items.value.find((i) => i.id === id)).filter((i): i is CatalogItem => !!i),
)

const TAB_LABELS: Record<Category, string> = { block: 'blocks', plant: 'plants', item: 'items' }

/** Sub-groups of the current tab that have at least one item, with counts. */
const groups = computed(() => {
  if (category.value === 'all') return []
  const inTab = items.value.filter((i) => i.category === category.value)
  return (groupOrder.value[category.value] ?? [])
    .map((name) => ({ name, count: inTab.filter((i) => i.group === name).length }))
    .filter((g) => g.count > 0)
})
const tabCount = computed(() => items.value.filter((i) => i.category === category.value).length)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value.filter(
    (i) =>
      (category.value === 'all' || i.category === category.value) &&
      (group.value === null || i.group === group.value) &&
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
          <a href="#catalog" class="btn primary" @click.prevent="scrollToCatalog">Browse items</a>
          <RouterLink to="/skin" class="btn">Build a player skin</RouterLink>
        </div>
      </div>
      <div v-if="featured.length" class="featured">
        <RouterLink v-for="item in featured" :key="item.id" :to="`/item/${item.id}`" class="feat" :title="item.name">
          <BlockIcon v-if="item.block" :src="blockUrl(item, look)!" :size="40" />
          <img v-else :src="textureUrl(item, look)" :alt="item.name" class="pixelated" width="64" height="64" />
        </RouterLink>
      </div>
    </section>

    <section id="catalog">
      <div class="toolbar">
        <h2>Items</h2>
        <div class="filters">
          <input v-model="query" type="search" :placeholder="`Search ${items.length ? items.length.toLocaleString() : ''} items…`" aria-label="Search items" />
          <ViewToggle v-model="look" :options="LOOKS" label="Textures" compact :title="`Old textures come from Minecraft ${classicVersion}`" />
          <div class="tabs" role="tablist">
            <button
              v-for="[value, label] in TABS"
              :key="value"
              role="tab"
              :aria-selected="category === value"
              :class="['tab', { active: category === value }]"
              @click="selectCategory(value)"
            >
              {{ label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="category !== 'all' && groups.length" class="chips" aria-label="Filter by type">
        <button :class="['chip', { active: group === null }]" :aria-pressed="group === null" @click="group = null">
          All {{ TAB_LABELS[category] }} <span class="count">{{ tabCount }}</span>
        </button>
        <button
          v-for="g in groups"
          :key="g.name"
          :class="['chip', { active: group === g.name }]"
          :aria-pressed="group === g.name"
          @click="group = g.name"
        >
          {{ g.name }} <span class="count">{{ g.count }}</span>
        </button>
      </div>

      <p v-if="error" class="notice">{{ error }}</p>
      <p v-else-if="items.length && !filtered.length" class="muted">No items match “{{ query }}”.</p>

      <ul class="grid">
        <li v-for="item in filtered" :key="item.id">
          <RouterLink :to="`/item/${item.id}`" class="tile card">
            <span v-if="buildStyles(item)" class="badge" title="Build styles you can pick on the guide page">
              {{ buildStyles(item) }}
            </span>
            <BlockIcon v-if="item.block" :src="blockUrl(item, look)!" />
            <img v-else :src="textureUrl(item, look)" alt="" class="pixelated" width="48" height="48" loading="lazy" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="version" class="muted small">
        Textures from Minecraft {{ version }}<template v-if="look === 'classic'">, with old textures from {{ classicVersion }} where they changed</template>.
      </p>
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 16px;
}

.chip {
  font: 600 0.9rem var(--sans);
  padding: 0.4em 0.85em;
  border-radius: 999px;
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}

.chip:hover {
  border-color: var(--accent);
}

.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

.chip .count {
  font-weight: 500;
  opacity: 0.7;
  margin-left: 0.2em;
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

.tile {
  position: relative;
}

.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font: 700 0.62rem var(--sans);
  letter-spacing: 0.03em;
  padding: 0.1em 0.45em;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--ink);
}

.tile:hover {
  border-color: var(--accent);
}

.small {
  font-size: 0.85rem;
}
</style>
