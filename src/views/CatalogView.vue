<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AdSlot from '../components/AdSlot.vue'
import BlockIcon from '../components/BlockIcon.vue'
import ViewToggle from '../components/ViewToggle.vue'
import { blockUrl, buildStyles, loadCatalog, textureUrl, type Catalog, type CatalogItem, type Category } from '../lib/catalog'
import { look as sharedLook } from '../lib/look'

const look = computed({ get: () => sharedLook.value, set: (v) => (sharedLook.value = v) })
const LOOKS = [
  { value: 'current' as const, label: 'New textures', hint: '' },
  { value: 'classic' as const, label: 'Old textures', hint: '' },
]

/** `search` is folded in once at load so filtering doesn't lowercase 2,210 strings per keystroke. */
type ListItem = CatalogItem & { search: string }

const items = ref<ListItem[]>([])
const groupOrder = ref<Catalog['groups']>({})
const version = ref('')
const classicVersion = ref('')
const error = ref('')
const loading = ref(true)
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

function resetFilters() {
  query.value = ''
  selectCategory('all')
}

async function fetchCatalog() {
  loading.value = true
  error.value = ''
  try {
    const catalog = await loadCatalog()
    items.value = catalog.items.map((i) => ({ ...i, search: `${i.name} ${i.id}`.toLowerCase() }))
    groupOrder.value = catalog.groups ?? {}
    version.value = catalog.version
    classicVersion.value = catalog.classicVersion
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(fetchCatalog)

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
  FEATURED.map((id) => items.value.find((i) => i.id === id)).filter((i): i is ListItem => !!i),
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
      (!q || i.search.includes(q)),
  )
})

/**
 * The catalog is 1,105 items and ~400 of the tiles are CSS cubes whose faces are background
 * images — and background images are never lazy-loaded. Rendering the whole list therefore pulled
 * roughly 1 MB of block textures on first paint. Showing a page at a time keeps the DOM small and,
 * more importantly, means an unrendered tile has no image to fetch at all.
 */
const PAGE = 60
const shown = ref(PAGE)
const visible = computed(() => filtered.value.slice(0, shown.value))
const hasMore = computed(() => shown.value < filtered.value.length)
watch(filtered, () => (shown.value = PAGE))
const showMore = () => (shown.value += PAGE)

// Keep a deliberate page boundary: automatic endless loading makes the footer hard to reach.

</script>

<template>
  <div class="container">
    <section class="hero">
      <div>
        <p class="eyebrow">A little paint. A few cubes. Your next build.</p>
        <h1>Build Minecraft in real life, one cube at a time</h1>
        <p class="lead muted">
          Pick an item or skin. You'll get a paint list and a cube count, then one small step at a time, so you never
          have to squint at a reference picture.
        </p>
        <div class="hero-actions">
          <a href="#catalog" class="btn primary" @click.prevent="scrollToCatalog">Browse items</a>
          <RouterLink to="/skin" class="btn">Build a player skin</RouterLink>
        </div>
        <p class="hero-note muted">Free build guides · No account needed · Unofficial fan project</p>
      </div>
      <div v-if="featured.length" class="featured">
        <RouterLink
          v-for="(item, i) in featured"
          :key="item.id"
          :to="`/item/${item.id}`"
          class="feat"
          :title="item.name"
          :aria-label="`Build ${item.name}`"
          :style="{ '--i': i }"
        >
          <BlockIcon v-if="item.block" :src="blockUrl(item, look)!" :size="40" />
          <img v-else :src="textureUrl(item, look)" alt="" class="pixelated" width="64" height="64" />
          <span class="feat-label">{{ item.name }}</span>
        </RouterLink>
      </div>
    </section>

    <ol class="how-it-works" aria-label="How it works">
      <li><span aria-hidden="true">01</span><div><strong>Pick your build</strong><p>Choose a block, item, flower or player skin.</p></div></li>
      <li><span aria-hidden="true">02</span><div><strong>Get your materials</strong><p>Use the cube count and matching paint list.</p></div></li>
      <li><span aria-hidden="true">03</span><div><strong>Build at your pace</strong><p>Follow each step. Come back where you left off.</p></div></li>
    </ol>

    <section id="catalog" aria-labelledby="catalog-heading" :aria-busy="loading">
      <div class="toolbar">
        <div class="toolbar-top">
          <h2 id="catalog-heading">Find your next build</h2>
          <input v-model="query" type="search" :placeholder="`Search ${items.length ? items.length.toLocaleString() : ''} items…`" aria-label="Search items" />
          <ViewToggle v-model="look" :options="LOOKS" label="Textures" compact :title="`Old textures come from Minecraft ${classicVersion}`" />
        </div>
        <div class="filters">
          <div class="tabs" role="group" aria-label="Filter by kind">
            <button
              v-for="[value, label] in TABS"
              :key="value"
              type="button"
              :aria-pressed="category === value"
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

      <div v-if="error" class="notice error-box" role="alert"><span>{{ error }}</span><button class="btn" @click="fetchCatalog">Try again</button></div>
      <p v-else-if="loading" class="muted" role="status">Loading build guides…</p>
      <p v-else class="results muted" role="status">{{ filtered.length.toLocaleString() }} {{ filtered.length === 1 ? 'build' : 'builds' }}<template v-if="query.trim()"> matching “{{ query.trim() }}”</template><span v-if="filtered.length"> · 3D marks builds with a three-dimensional option</span></p>

      <div v-if="!loading && !error && items.length && !filtered.length" class="empty card">
        <p>
          Nothing matches <strong>“{{ query }}”</strong><template v-if="category !== 'all'"> in {{ TAB_LABELS[category] }}</template>.
        </p>
        <p class="muted">Try a shorter word, or check another kind of item.</p>
        <button type="button" class="btn" @click="resetFilters">Clear search and filters</button>
      </div>

      <ul v-if="!error" class="grid" :class="{ loading }">
        <li v-for="item in visible" :key="item.id" v-memo="[look]">
          <RouterLink :to="`/item/${item.id}`" class="tile card">
            <span v-if="item.block || item.flower" class="badge" :title="`${item.name} can also be built in 3D (${buildStyles(item)})`">3D</span>
            <BlockIcon v-if="item.block" :src="blockUrl(item, look)!" />
            <img v-else :src="textureUrl(item, look)" alt="" class="pixelated" width="48" height="48" loading="lazy" />
            <span>{{ item.name }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- Explicit pagination keeps the footer accessible without endless scrolling. -->
      <div v-if="hasMore" class="more">
        <button type="button" class="btn" @click="showMore">
          Show more ({{ (filtered.length - shown).toLocaleString() }} left)
        </button>
      </div>
      <!-- Placed below the grid and nowhere else. Renders nothing until ads are switched on in
           src/lib/ads.ts; see that file for what has to be true first. -->
      <AdSlot unit="catalog-footer" />

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
  padding: 16px 0 0;
}

.eyebrow { font-size: 0.8rem; font-weight: 700; color: var(--accent); letter-spacing: 0.05em; margin-bottom: 16px; }
.hero-note { font-size: 0.82rem; margin: 16px 0 0; }
.how-it-works { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; padding: 22px 0; margin: 0 0 36px; gap: 24px; border-block: 1px solid var(--line); }
.how-it-works li { display: flex; gap: 12px; }
.how-it-works li > span { font: 700 1.3rem var(--pixel); color: var(--accent); }
.how-it-works strong { font-size: 0.93rem; }
.how-it-works p { color: var(--ink-soft); font-size: 0.84rem; margin: 3px 0 0; }
.results { font-size: 0.85rem; margin: 0 0 16px; }

@media (max-width: 760px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 20px;
    margin-bottom: 28px;
  }

  .lead {
    font-size: 1rem;
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
  position: relative;
  padding: 16px 8px 28px;
}

.feat-label { position: absolute; bottom: 9px; font-size: 0.72rem; color: var(--ink-soft); text-align: center; }

.feat:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.feat img {
  width: 58%;
  height: auto;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

/* Heading, search and the texture switch share one line; filters sit on the next. */
.toolbar-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar h2 {
  margin: 0;
  margin-right: auto;
}

.toolbar-top input {
  flex: 1 1 220px;
  max-width: 320px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tabs {
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 3px;
}

.tab {
  min-height: 44px;
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
  min-height: 44px;
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

.empty {
  padding: 28px 20px;
  text-align: center;
  margin-bottom: 16px;
}

.empty p {
  margin: 0 0 0.4rem;
}

.empty .btn {
  margin-top: 0.6rem;
}

.grid {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

/* Holds the page height steady between first paint and the catalog arriving, so nothing jumps. */
.grid.loading {
  min-height: 60vh;
}

/* One fade for the whole grid as it fills, rather than a stagger across hundreds of tiles —
   a stagger would keep content invisible for longer and drag the LCP out with it. */
.grid:not(.loading) {
  animation: fade-in var(--dur-2) var(--ease-out);
}

.featured .feat {
  animation: rise-in var(--dur-3) var(--ease-out) backwards;
  animation-delay: calc(var(--i) * 40ms);
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

/* Skips layout and paint for rows scrolled past. `auto` remembers each row's real height, which
   is what stops the scrollbar twitching as you go. */
.grid > li {
  content-visibility: auto;
  contain-intrinsic-size: auto 148px;
}

.more {
  display: flex;
  justify-content: center;
  min-height: 1px;
  margin-bottom: 16px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 8px 14px;
  min-height: 136px;
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

/* Quiet marker: hundreds of tiles carry it, so it must not compete with the item picture. */
.badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font: 600 0.62rem var(--sans);
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.tile:hover {
  border-color: var(--accent);
}

.tile:hover .badge {
  color: var(--accent);
}

.small {
  font-size: 0.85rem;
}

@media (max-width: 760px) {
  .featured { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .feat { min-height: 64px; padding: 8px; }
  .feat-label { display: none; }
  .feat img { width: 85%; }
  .feat :deep(.block-icon) { transform: scale(0.7); }
  .how-it-works { gap: 16px; }
  .toolbar-top h2 { flex-basis: 100%; }
  .toolbar-top input { max-width: none; }
}
@media (max-width: 520px) {
  .featured { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .feat { aspect-ratio: 1.6; }
  .feat img { width: 40px; height: 40px; }
  .how-it-works { grid-template-columns: 1fr; gap: 14px; margin-bottom: 28px; }
  .hero-actions .btn { flex: 1 1 160px; }
  .results span { display: block; margin-top: 4px; }
}
</style>
