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
import { blockUrl, loadCatalog, textureUrl, type CatalogItem } from '../lib/catalog'
import { readStored, writeStored } from '../lib/storage'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()

const item = ref<CatalogItem | null>(null)
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

watch(
  () => props.id,
  async (id) => {
    item.value = null
    flatPixels.value = null
    blockPixels.value = null
    potPixels.value = null
    error.value = ''
    try {
      const catalog = await loadCatalog()
      const found = catalog.items.find((i) => i.id === id)
      if (!found) throw new Error(`There's no item called “${id}”.`)
      item.value = found
      document.title = `${found.name} · Block by Block`
      const strip = blockUrl(found)
      ;[flatPixels.value, blockPixels.value, potPixels.value] = await Promise.all([
        loadPixels(textureUrl(found)),
        strip ? loadPixels(strip) : null,
        found.flower?.pottable ? loadPixels(`/${catalog.pot}`) : null,
      ])
    } catch (e) {
      error.value = (e as Error).message
    }
  },
  { immediate: true },
)

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
  const parts = [`item:${props.id}`, maxPaints.value, view.value, potted.value ? 'pot' : '']
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
  <div class="container">
    <RouterLink to="/" class="back muted">← All items</RouterLink>
    <p v-if="error" class="notice">{{ error }}</p>

    <template v-if="item">
      <header class="head">
        <div class="icon">
          <BlockIcon v-if="view === '3d' && item.block" :src="blockUrl(item)!" :size="42" />
          <img v-else :src="textureUrl(item)" alt="" class="pixelated" width="64" height="64" />
        </div>
        <div class="head-text">
          <h1>{{ potted ? `Potted ${item.name}` : item.name }}</h1>
          <p class="muted">{{ description }}</p>
        </div>
        <div v-if="has3d" class="style-controls">
          <ViewToggle v-model="view" :options="VIEWS" />
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

      <GuideViewer v-if="model && guide" :model="model" :guide="guide" :storage-key="storageKey" />
    </template>
  </div>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 12px;
  text-decoration: none;
  font-weight: 600;
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

.style-controls {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.pot-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  font: 600 0.95rem var(--sans);
  padding: 0.5rem 0.9rem;
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
