<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BlockIcon from '../components/BlockIcon.vue'
import BuildDemo from '../components/BuildDemo.vue'
import ViewToggle from '../components/ViewToggle.vue'
import CraftPhoto from '../components/CraftPhoto.vue'
import { showcasePhoto, starterBuilds, starterPaintLimit } from '../lib/site'
import { currentSkin } from '../lib/skinStore'
import { hashString, readRecentBuild } from '../lib/storage'
import { blockUrl, loadCatalog, textureUrl, type Category } from '../lib/catalog'
import { indexCatalog, prepareCatalogSearch } from '../lib/catalogIndex'
import { LOOK_OPTIONS, look } from '../lib/buildSettings'
import { useNearViewport } from '../lib/dom'
import { loadDemoModel } from '../lib/demo'

const route = useRoute()
const router = useRouter()

const catalogIndex = shallowRef(indexCatalog([], {}))
const items = computed(() => catalogIndex.value.items)
const version = ref('')
const classicVersion = ref('')
const error = ref('')
const loading = ref(true)
const TABS: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'block', label: 'Blocks' },
  { value: 'plant', label: 'Plants' },
  { value: 'item', label: 'Items' },
]

/**
 * The search and filters live in the URL (?q=sword&kind=item&type=Combat), so Back from a guide,
 * a refresh or a shared link reopens the same list instead of the whole catalog.
 */
function filtersFromUrl() {
  const text = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')
  const kind = text('kind') as Category | 'all'
  const valid = TABS.some((tab) => tab.value === kind)
  return { q: text('q'), kind: valid ? kind : 'all', type: valid && kind !== 'all' ? text('type') || null : null }
}
const initial = filtersFromUrl()
const query = ref(initial.q)
const category = ref<Category | 'all'>(initial.kind)
/** Selected sub-group (Flowers, Ores…), or null for the whole tab. */
const group = ref<string | null>(initial.type)

let urlTimer: ReturnType<typeof setTimeout> | undefined
watch([query, category, group], () => {
  clearTimeout(urlTimer)
  // Typing updates the address once per pause rather than on every key.
  urlTimer = setTimeout(() => {
    if (route.name !== 'catalog') return
    const next = {
      ...route.query,
      q: query.value.trim() || undefined,
      kind: category.value === 'all' ? undefined : category.value,
      type: group.value ?? undefined,
    }
    const same = (['q', 'kind', 'type'] as const).every((key) => (route.query[key] ?? undefined) === next[key])
    if (!same) void router.replace({ query: next, hash: route.hash })
  }, 300)
})
/** The other direction: the header's Items link (a plain "/") clears the filters. */
watch(() => route.query, () => {
  if (route.name !== 'catalog') return
  const wanted = filtersFromUrl()
  if (wanted.q === query.value.trim() && wanted.kind === category.value && wanted.type === group.value) return
  clearTimeout(urlTimer)
  query.value = wanted.q
  category.value = wanted.kind
  group.value = wanted.type
})
onBeforeUnmount(() => clearTimeout(urlTimer))

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
    catalogIndex.value = indexCatalog(catalog.items, catalog.groups ?? {})
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

/** Catalog items in the "One pixel, one cube" demo, in picker order. Steve follows them. */
const FEATURED = ['rose', 'poppy', 'diamond_ore', 'axolotl_bucket']

const featured = computed(() =>
  FEATURED.flatMap(id => {
    const item = catalogIndex.value.byId.get(id)
    return item ? [item] : []
  }),
)
const recent = readRecentBuild()
const resumable = computed(() => recent && (!recent.skinHash ||
  (currentSkin.value && hashString(currentSkin.value.dataUrl) === recent.skinHash)) &&
  (recent.skinHash || items.value.some(item => recent.path.startsWith(`/item/${item.id}?`))) ? recent : null)
const starterStats = ref<Record<string, { cubes: number; paints: number }>>({})
const starterSection = ref<HTMLElement | null>(null)
const startersNear = useNearViewport(starterSection, '200px')
const starters = computed(() => starterBuilds.flatMap(entry => {
  const item = catalogIndex.value.byId.get(entry.id)
  return item ? [{ ...entry, item, stats: starterStats.value[entry.id] }] : []
}))
watch([catalogIndex, startersNear], async ([index, near], _, onCleanup) => {
  if (!near || !index.items.length) return
  let current = true
  onCleanup(() => { current = false })
  // Cards and links work without the optional counts, including when a resource fails.
  await Promise.allSettled(starterBuilds.map(async entry => {
    if (starterStats.value[entry.id]) return
    const item = index.byId.get(entry.id)
    if (!item) return
    const model = await loadDemoModel(item, '2d')
    if (current) starterStats.value[entry.id] = { cubes: model.voxels.length, paints: model.palette.length }
  }))
})

const TAB_LABELS: Record<Category, string> = { block: 'blocks', plant: 'plants', item: 'items' }

const categorySummary = computed(() => category.value === 'all' ? null : catalogIndex.value.categories[category.value])
const groups = computed(() => categorySummary.value?.groups ?? [])
const tabCount = computed(() => categorySummary.value?.count ?? 0)
const searchMatches = computed(() => prepareCatalogSearch(query.value))

const filtered = computed(() => {
  const matches = searchMatches.value
  return items.value.filter(
    (i) =>
      (category.value === 'all' || i.category === category.value) &&
      (group.value === null || i.group === group.value) &&
      matches(i.search),
  )
})

// Unrendered tiles have no texture to fetch, including CSS cube backgrounds.
const PAGE = 60
/**
 * How far "Show more" had got is kept in this history entry rather than the URL, so returning with
 * Back reopens the same rows and the browser can restore the scroll position into them.
 */
const savedShown = Number((history.state as { catalogShown?: unknown } | null)?.catalogShown)
const shown = ref(Number.isInteger(savedShown) && savedShown > PAGE ? savedShown : PAGE)
const visible = computed(() => filtered.value.slice(0, shown.value))
const hasMore = computed(() => shown.value < filtered.value.length)
// Reset on a new search or filter only; the catalog arriving must not undo a restored count.
watch([() => query.value.trim(), category, group], () => (shown.value = PAGE))
watch(shown, (count) => history.replaceState({ ...history.state, catalogShown: count }, ''))
const showMore = () => (shown.value += PAGE)

// Keep a deliberate page boundary: automatic endless loading makes the footer hard to reach.

// Keep the live region mounted and announce its final count once typing pauses.
const ANNOUNCE_DELAY_MS = 450
const resultsText = computed(() => {
  if (loading.value) return 'Loading build guides…'
  if (error.value) return ''
  const n = filtered.value.length
  const q = query.value.trim()
  return `${n.toLocaleString()} ${n === 1 ? 'build' : 'builds'}${q ? ` matching “${q}”` : ''}`
})
const announced = ref(resultsText.value)
let announceTimer: ReturnType<typeof setTimeout> | undefined
watch(resultsText, (text) => {
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => (announced.value = text), ANNOUNCE_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(announceTimer))

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
          <a href="#first-build" class="btn primary">Find a first build</a>
          <a href="#catalog" class="btn" @click.prevent="scrollToCatalog">Browse all items</a>
          <RouterLink to="/skin" class="btn">Build a player skin</RouterLink>
        </div>
        <p class="hero-note muted">Free build guides · No account needed · Unofficial fan project</p>
      </div>
      <div class="craft-showcase">
        <CraftPhoto :photo="showcasePhoto" alt="Handmade Minecraft cube crafts" sizes="(max-width: 760px) calc(100vw - 32px), 460px" priority />
      </div>
    </section>

    <!-- Straight under the hero: a returning builder's next step shouldn't sit below the demo. -->
    <section v-if="resumable" class="resume-build card" aria-labelledby="resume-title">
      <div><p class="eyebrow">Your crafting table</p><h2 id="resume-title">{{ resumable.title }}</h2><p class="muted">Last opened at step {{ resumable.step }} of {{ resumable.total }} · saved on this device</p></div>
      <RouterLink :to="resumable.path" class="btn primary">Continue your build →</RouterLink>
    </section>

    <BuildDemo v-if="featured.length" :items="featured" :look="look" />

    <section v-if="starters.length" id="first-build" ref="starterSection" class="first-build" aria-labelledby="first-build-title">
      <p class="eyebrow">Start small. Make something you love.</p>
      <h2 id="first-build-title">Pick your first project</h2>
      <p class="muted">Start with a rose, emerald or red tulip. Each is a flat build with one color per cube and a smaller paint palette.</p>
      <div class="starter-grid">
        <RouterLink v-for="starter in starters" :key="starter.id" :to="`/item/${starter.id}?view=2d&look=current&paints=${starterPaintLimit}`" class="starter card">
          <CraftPhoto :photo="starter.photo" :alt="`Handmade ${starter.item.name}`" sizes="(max-width: 640px) 110px, 370px" />
          <div class="starter-body">
            <img :src="textureUrl(starter.item, 'current')" :alt="`${starter.item.name} game texture reference`" width="40" height="40" class="pixelated" />
            <h3>{{ starter.item.name }}</h3>
            <p>{{ starter.note }}</p>
            <span v-if="starter.stats" class="starter-stats">{{ starter.stats.cubes }} cubes · {{ starter.stats.paints }} paint colors · flat build</span>
            <span v-else class="starter-stats">Flat build · up to {{ starterPaintLimit }} paint colors</span>
            <strong class="starter-link">Open build guide →</strong>
          </div>
        </RouterLink>
      </div>
    </section>

    <section id="catalog" aria-labelledby="catalog-heading" :aria-busy="loading">
      <div class="toolbar">
        <div class="toolbar-top">
          <h2 id="catalog-heading">Find your next build</h2>
          <input v-model="query" type="search" :placeholder="`Search ${items.length ? items.length.toLocaleString() : ''} items…`" aria-label="Search items" />
          <ViewToggle v-model="look" :options="LOOK_OPTIONS" label="Textures" compact :title="`Old textures come from Minecraft ${classicVersion}`" />
        </div>
        <div class="filters">
          <ViewToggle :model-value="category" :options="TABS" label="Filter by kind" compact @update:model-value="selectCategory" />
        </div>
      </div>

      <label v-if="category !== 'all' && groups.length" class="mobile-type-filter">
        <span>Filter by type</span>
        <select v-model="group">
          <option :value="null">All {{ TAB_LABELS[category] }} ({{ tabCount }})</option>
          <option v-for="g in groups" :key="g.name" :value="g.name">{{ g.name }} ({{ g.count }})</option>
        </select>
      </label>
      <div v-if="category !== 'all' && groups.length" class="chips" role="group" aria-label="Filter by type">
        <button type="button" :class="['chip', { active: group === null }]" :aria-pressed="group === null" @click="group = null">
          All {{ TAB_LABELS[category] }} <span class="count">{{ tabCount }}</span>
        </button>
        <button
          v-for="g in groups"
          :key="g.name"
          type="button"
          :class="['chip', { active: group === g.name }]"
          :aria-pressed="group === g.name"
          @click="group = g.name"
        >
          {{ g.name }} <span class="count">{{ g.count }}</span>
        </button>
      </div>

      <div v-if="error" class="notice error-box" role="alert"><span>{{ error }}</span><button type="button" class="btn" @click="fetchCatalog">Try again</button></div>
      <p v-show="!error" class="results muted" role="status">{{ announced }}</p>
      <p v-if="!loading && !error && filtered.length" class="legend muted"><span class="badge" aria-hidden="true">3D</span> also builds in three dimensions</p>

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
            <span v-if="item.block || item.flower || item.shape" class="badge" aria-hidden="true">3D</span>
            <BlockIcon v-if="item.block" :src="blockUrl(item, look)!" />
            <img v-else :src="textureUrl(item, look)" alt="" class="pixelated" width="48" height="48" loading="lazy" />
            <span>{{ item.name }}<span v-if="item.block || item.flower || item.shape" class="visually-hidden">, also builds in 3D</span></span>
          </RouterLink>
        </li>
      </ul>

      <!-- Explicit pagination keeps the footer accessible without endless scrolling. -->
      <div v-if="hasMore" class="more">
        <button type="button" class="btn" @click="showMore">
          Show more ({{ (filtered.length - shown).toLocaleString() }} left)
        </button>
      </div>

      <p v-if="version" class="muted small">
        Textures from Minecraft {{ version }}<template v-if="look === 'classic'">, with old textures from {{ classicVersion }} where they changed</template>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.resume-build { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; padding: 24px; margin-bottom: 36px; }
.resume-build .eyebrow { margin-bottom: 8px; }
.resume-build p:last-child { margin-bottom: 0; }
.first-build { margin-bottom: 48px; }
.first-build > .eyebrow { margin-bottom: 8px; }
.starter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.starter { overflow: hidden; text-decoration: none; color: var(--ink); transition: border-color .15s; }
.starter:hover { border-color: var(--accent); }
.starter :deep(.craft-photo) { border-radius: 0; }
.starter-body { padding: 20px; }
.starter-body > img { float: right; margin-left: 8px; }
.starter h3 { font: 750 1.15rem/1.4 var(--sans); }
.starter p { font-size: .9rem; color: var(--ink-soft); min-height: 3em; }
.starter-stats { display: block; font-size: .8rem; color: var(--ink-soft); margin-bottom: 20px; }
.starter-link { color: var(--accent); font-size: .9rem; }
@media (max-width: 640px) {
  .starter-grid { grid-template-columns: 1fr; }
  .starter { display: grid; grid-template-columns: 110px minmax(0, 1fr); }
  .starter :deep(.craft-photo) { aspect-ratio: auto; }
  .starter :deep(.photo-placeholder) { padding: 6px; margin: 8px; height: calc(100% - 16px); }
  .starter :deep(.photo-placeholder strong) { display: none; }
  .starter-body { padding: 16px; }
  .starter-body > img { width: 28px; height: 28px; }
  .starter-stats { margin-bottom: 12px; }
  .starter p { min-height: 0; }
}
.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  align-items: center;
  margin-bottom: 40px;
  padding: 16px 0 0;
}

.hero-note { font-size: 0.82rem; margin: 16px 0 0; }
.results { font-size: 0.85rem; margin: 0 0 4px; min-height: 1.5em; }
.legend { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; margin: 0 0 16px; }
.legend .badge { position: static; }

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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 16px;
}

.mobile-type-filter { display: none; }
@media (max-width: 640px) {
  .chips { display: none; }
  .mobile-type-filter { display: grid; gap: 6px; margin-bottom: 16px; font-size: .9rem; }
  .mobile-type-filter select { width: 100%; }
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
  background: var(--pressed-bg);
  border-color: var(--pressed-bg);
  color: var(--pressed-ink);
}

/* Lighter weight, not lower opacity: at 70% opacity the count on a pressed chip fell to 3.6:1. */
.chip .count {
  font-weight: 400;
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

@keyframes fade-in {
  from {
    opacity: 0;
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
  position: relative;
  transition: border-color 0.1s;
}

/* Quiet marker: hundreds of tiles carry it, so it must not compete with the item picture. A
   small outlined tag keeps it quiet while staying legible (it was ~10px plain text). Its meaning
   is in the legend above the grid and in each link's name; the old title tooltip reached only
   mouse users. */
.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 4px;
  font: 700 0.7rem/1.3 var(--sans);
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
  .toolbar-top h2 { flex-basis: 100%; }
  .toolbar-top input { max-width: none; }
}
@media (max-width: 520px) {
  .hero-actions .btn { flex: 1 1 160px; }
}
</style>
