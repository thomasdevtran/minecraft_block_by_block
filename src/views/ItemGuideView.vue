<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BlockIcon from '../components/BlockIcon.vue'
import GuideViewer from '../components/GuideViewer.vue'
import PaintControls from '../components/PaintControls.vue'
import ViewToggle from '../components/ViewToggle.vue'
import { blockToModel } from '../engine/block'
import { checkConnectivity } from '../engine/connectivity'
import { flowerToModel, pottedSprite } from '../engine/flower'
import { itemToModel } from '../engine/item'
import { loadPixels, type PixelImage } from '../engine/pixels'
import { buildGuide } from '../engine/steps'
import { assetUrl, blockUrl, loadCatalog, textureUrl, type BuildableItem } from '../lib/catalog'
import { look } from '../lib/look'
import { setPageMeta } from '../lib/meta'
import { readStored, writeStored } from '../lib/storage'
import NotFoundView from './NotFoundView.vue'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()

const item = ref<BuildableItem | null>(null)
/** Pot textures for today's and the classic look. */
const potUrls = ref<{ current: string; classic: string } | null>(null)
const classicVersion = ref('')
const flatPixels = shallowRef<PixelImage | null>(null)
const blockPixels = shallowRef<PixelImage | null>(null)
const potPixels = shallowRef<PixelImage | null>(null)
const error = ref('')
const maxPaints = ref(readStored('prefs:item:maxPaints', 12))
watch(maxPaints, (v) => writeStored('prefs:item:maxPaints', v))
const blockPrefs = reactive(readStored('prefs:block', { hollow: true, simplePaint: true }))
watch(blockPrefs, (v) => writeStored('prefs:block', v))

const has3d = computed(() => !!(item.value?.block || item.value?.flower))
const canPot = computed(() => !!item.value?.flower?.pottable)

/** Blocks open in 3D and flowers in 2D, unless the link says otherwise. */
const view = computed<'2d' | '3d'>({
  get: () => {
    if (!has3d.value) return '2d'
    const asked = route.query.view
    if (asked === '2d' || asked === '3d') return asked
    return item.value?.block ? '3d' : '2d'
  },
  set: (v) => router.replace({ query: { ...route.query, view: v } }),
})
const potted = computed(() => canPot.value && route.query.pot === '1')
const togglePot = () => router.replace({ query: { ...route.query, pot: potted.value ? undefined : '1' } })

const VIEWS = computed(() => [
  { value: '2d' as const, label: '2D', hint: 'Flat, one side' },
  { value: '3d' as const, label: '3D', hint: item.value?.flower ? 'Crossed, like in game' : 'Full block' },
])

/** The texture set in use; only items with a classic look can switch. */
const activeLook = computed(() => (item.value?.classic ? look.value : 'current'))

const notFound = ref(false)
const loading = ref(false)
/** Bumped on every load so a slow response for an earlier item can't overwrite a newer one. */
let loadToken = 0

async function loadItem(id: string) {
  const token = ++loadToken
  item.value = null
  potUrls.value = null
  notFound.value = false
  error.value = ''
  loading.value = true
  try {
    const catalog = await loadCatalog()
    if (token !== loadToken) return
    const found = catalog.items.find((i) => i.id === id) ?? null
    potUrls.value = { current: assetUrl(catalog.pot), classic: assetUrl(catalog.classicPot) }
    classicVersion.value = catalog.classicVersion
    if (!found) {
      notFound.value = true
      setPageMeta('Item not found', undefined, true)
      return
    }
    item.value = found
    setPageMeta(`How to build ${found.name}`, `Step-by-step guide and paint list for building a Minecraft ${found.name} out of real cubes.`)
  } catch {
    if (token === loadToken) error.value = "Couldn't load the item list. Check your connection and try again."
  } finally {
    if (token === loadToken && !item.value) loading.value = false
  }
}

async function loadTextures() {
  const token = ++loadToken
  const found = item.value
  const lookNow = activeLook.value
  flatPixels.value = null
  blockPixels.value = null
  potPixels.value = null
  if (!found || !potUrls.value) return
  error.value = ''
  loading.value = true
  try {
    const strip = blockUrl(found, lookNow)
    const loaded = await Promise.all([
      loadPixels(textureUrl(found, lookNow)),
      strip ? loadPixels(strip) : null,
      found.flower?.pottable ? loadPixels(potUrls.value[lookNow]) : null,
    ])
    if (token !== loadToken) return
    ;[flatPixels.value, blockPixels.value, potPixels.value] = loaded
  } catch {
    if (token === loadToken) error.value = `Couldn't load the textures for ${found.name}. Check your connection and try again.`
  } finally {
    if (token === loadToken) loading.value = false
  }
}

const retry = () => (item.value ? loadTextures() : loadItem(props.id))

watch(() => props.id, loadItem, { immediate: true })
watch([item, activeLook], loadTextures)

const lookModel = computed({ get: () => look.value, set: (v) => (look.value = v) })
const LOOKS = [
  { value: 'current' as const, label: 'New textures', hint: '' },
  { value: 'classic' as const, label: 'Old textures', hint: '' },
]

const model = computed(() => {
  const sprite = flatPixels.value
  const pot = potted.value ? potPixels.value : null
  if (!sprite || (potted.value && !pot)) return null
  const colors = { maxPaints: maxPaints.value, simplePaint: blockPrefs.simplePaint }

  if (view.value === '3d' && item.value?.flower) return flowerToModel(sprite, { ...colors, pot })
  if (view.value === '3d') {
    return blockPixels.value ? blockToModel(blockPixels.value, { ...colors, hollow: blockPrefs.hollow }) : null
  }
  return itemToModel(pot ? pottedSprite(sprite, pot) : sprite, { maxPaints: maxPaints.value, simplePaint: false })
})
const guide = computed(() => (model.value ? buildGuide(model.value) : null))
const connectivity = computed(() =>
  model.value && model.value.kind !== 'block' ? checkConnectivity(model.value.voxels) : null,
)
const storageKey = computed(() => {
  const parts = [`item:${props.id}`, activeLook.value, maxPaints.value, view.value, potted.value ? 'pot' : '']
  if (view.value === '3d') parts.push(blockPrefs.simplePaint ? 'simple' : 'exact')
  if (view.value === '3d' && item.value?.block) parts.push(blockPrefs.hollow ? 'hollow' : 'solid')
  return parts.join(':')
})

/** Paint-per-face only matters where a cube shows more than one color. */
const showSimplePaint = computed(() => view.value === '3d' && (!!item.value?.block || potted.value))

const description = computed(() => {
  if (view.value === '3d' && item.value?.block) {
    return 'A full 16×16×16 block. Paint the cubes, then stack them one layer at a time from the bottom up.'
  }
  if (view.value === '3d') {
    return potted.value
      ? 'Build the flower pot first, then stand the flower in it: two walls of cubes crossing in a plus shape.'
      : 'Two walls of cubes crossing in a plus shape, like the flower looks in the world. Built layer by layer from the bottom.'
  }
  return potted.value
    ? 'The flower standing in its pot, seen from the front. Lay the cubes flat and glue each row to the one below it.'
    : 'Lay the cubes flat and glue each row to the one below it. One pixel = one cube, so any cube size works.'
})
</script>

<template>
  <NotFoundView v-if="notFound" :message="`There's no item called “${id}” in the catalog. It may have been renamed or removed.`" />
  <div v-else class="container">
    <RouterLink to="/" class="back muted">← All items</RouterLink>
    <div v-if="error" class="notice error-box" role="alert">
      <span>{{ error }}</span>
      <button class="btn" @click="retry">Try again</button>
    </div>
    <!-- Only while there is nothing else to show. Once the item is known the header renders, and
         the "working it out" message moves into the reserved guide slot below it — a status line
         above the header would shove the whole page down when it disappeared. -->
    <p v-else-if="loading && !item" class="loading muted" role="status">Loading guide…</p>

    <template v-if="item">
      <header class="head">
        <div class="icon">
          <BlockIcon v-if="view === '3d' && item.block" :src="blockUrl(item, activeLook)!" :size="42" />
          <img v-else :src="textureUrl(item, activeLook)" alt="" class="pixelated" width="64" height="64" />
        </div>
        <div class="head-text">
          <h1>{{ potted ? `Potted ${item.name}` : item.name }}</h1>
          <p v-if="item.note" class="item-note">
            {{ item.note }}
          </p>
          <p class="muted">{{ description }}</p>
        </div>
        <div v-if="has3d || item.classic" class="style-controls">
          <ViewToggle v-if="has3d" v-model="view" :options="VIEWS" />
          <ViewToggle
            v-if="item.classic"
            v-model="lookModel"
            :options="LOOKS"
            label="Textures"
            compact
            :title="`Old textures come from Minecraft ${classicVersion}`"
          />
          <button v-if="canPot" :class="['pot-toggle', { active: potted }]" :aria-pressed="potted" @click="togglePot">
            <span class="switch" aria-hidden="true"></span>
            In a pot
          </button>
        </div>
      </header>

      <PaintControls v-model:max-paints="maxPaints">
        <div v-if="showSimplePaint" class="toggles">
          <label v-if="item.block" class="toggle">
            <input v-model="blockPrefs.hollow" type="checkbox" />
            Hollow inside (1,352 cubes instead of 4,096)
          </label>
          <label class="toggle">
            <input v-model="blockPrefs.simplePaint" type="checkbox" />
            One color per cube (easier; edges less exact)
          </label>
        </div>
      </PaintControls>

      <p v-if="connectivity && connectivity.pieces > 1" class="notice">
        <strong>Heads up:</strong> some cubes only touch at their corners, so this build falls into
        {{ connectivity.pieces }} separate pieces.
        {{ view === '2d' ? 'Glue it onto a backing board, or add' : 'Add' }} filler cubes at
        {{ connectivity.bridgeSpots.length }} spots where a cube would join two pieces.
      </p>

      <!-- Holds the guide's height from the first paint, so the steps arriving doesn't shove the
           footer down the page. -->
      <div class="guide-slot">
        <GuideViewer v-if="model && guide" :model="model" :guide="guide" :storage-key="storageKey" />
        <p v-else-if="loading" class="loading muted" role="status">Working out the steps…</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.loading {
  margin: 12px 0;
}

/* Reserves the height the guide settles at, so the page is the same shape before and after.
   Shares --guide-h with the preview itself rather than repeating its numbers. */
.guide-slot {
  min-height: var(--guide-h);
}

.head {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}

.head {
  flex-wrap: wrap;
}

.icon {
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  width: 80px;
  height: 80px;
  flex: none;
  display: grid;
  place-items: center;
}

.icon img {
  width: 64px;
  height: 64px;
}

.head-text {
  flex: 1;
  min-width: 220px;
}

.head p {
  margin: 0;
}

.item-note {
  margin: 0.2rem 0 0.4rem !important;
  font-size: 0.95rem;
}

.style-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pot-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font: 600 0.9rem var(--sans);
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius);
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}

.pot-toggle:focus-visible {
  outline: 3px solid var(--accent);
}

.switch {
  width: 2.2rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--surface-2);
  border: 2px solid var(--line);
  position: relative;
  transition: background 0.15s;
}

.switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: var(--ink-soft);
  transition: transform 0.15s;
}

.pot-toggle.active {
  border-color: var(--accent);
}

.pot-toggle.active .switch {
  background: var(--accent);
  border-color: var(--accent);
}

.pot-toggle.active .switch::after {
  transform: translateX(0.95rem);
  background: var(--accent-ink);
}

.notice {
  margin-bottom: 16px;
}
</style>
