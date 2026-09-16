<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import GuideViewer from '../components/GuideViewer.vue'
import PaintControls from '../components/PaintControls.vue'
import ViewToggle from '../components/ViewToggle.vue'
import { itemToModel } from '../engine/item'
import { loadPixels, pixelsToDataUrl, type PixelImage } from '../engine/pixels'
import { skinFront, skinToModel, validateSkin, type SkinOptions } from '../engine/skin'
import { buildGuide } from '../engine/steps'
import { currentSkin, setSkin } from '../lib/skinStore'
import { setPageMeta } from '../lib/meta'
import { hashString, readStored, writeStored } from '../lib/storage'

const pixels = shallowRef<PixelImage | null>(null)
const prefs = reactive(
  readStored('prefs:skin', { hollow: true, overlay: true, simplePaint: true, maxPaints: 16 }),
)
watch(prefs, (v) => writeStored('prefs:skin', v))

const loadError = ref('')
let skinLoad = 0

watch(
  () => currentSkin.value?.dataUrl,
  async (url) => {
    const token = ++skinLoad
    pixels.value = null
    loadError.value = ''
    setPageMeta(currentSkin.value ? `${currentSkin.value.label}'s skin build guide` : 'Skin build guide', undefined, true)
    try {
      const loaded = url ? await loadPixels(url) : null
      if (token !== skinLoad) return
      if (loaded && validateSkin(loaded)) throw new Error('Invalid saved skin')
      pixels.value = loaded
    } catch {
      if (token !== skinLoad) return
      pixels.value = null
      loadError.value = "This saved skin couldn't be opened. Look it up or upload it again."
    }
  },
  { immediate: true },
)

const armModel = computed({
  get: () => currentSkin.value?.model ?? 'classic',
  set: (model) => currentSkin.value && setSkin({ ...currentSkin.value, model }),
})

const route = useRoute()
const router = useRouter()

const VIEWS = [
  { value: '2d' as const, label: '2D', hint: 'Flat, from the front' },
  { value: '3d' as const, label: '3D', hint: 'Standing figure' },
]
/** The 3D figure by default; `?view=2d` builds the character flat, seen from the front. */
const view = computed<'2d' | '3d'>({
  get: () => (route.query.view === '2d' ? '2d' : '3d'),
  set: (v) => router.replace({ query: { ...route.query, view: v } }),
})

const options = computed<SkinOptions>(() => ({ ...prefs, model: armModel.value }))
const front = computed(() => (pixels.value ? skinFront(pixels.value, options.value) : null))
const frontUrl = computed(() => (front.value ? pixelsToDataUrl(front.value) : ''))
const model = computed(() => {
  if (view.value === '2d') return front.value ? itemToModel(front.value, { maxPaints: prefs.maxPaints, simplePaint: false }) : null
  return pixels.value ? skinToModel(pixels.value, options.value) : null
})
const guide = computed(() => (model.value ? buildGuide(model.value) : null))
const storageKey = computed(() => {
  if (!currentSkin.value) return ''
  const skin = `skin:${hashString(currentSkin.value.dataUrl)}`
  return view.value === '2d'
    ? `${skin}:flat:${armModel.value}:${prefs.overlay}:${prefs.maxPaints}`
    : `${skin}:${hashString(JSON.stringify(options.value))}`
})
</script>

<template>
  <div class="container">
    <RouterLink to="/skin" class="back muted">← Choose another skin</RouterLink>

    <div v-if="!currentSkin" class="notice">
      <h1>Choose a skin to begin</h1>
      No skin loaded yet. <RouterLink to="/skin">Look one up or upload a file</RouterLink> to get started.
    </div>

    <div v-else-if="loadError" class="notice error-box" role="alert">
      {{ loadError }} <RouterLink to="/skin">Choose a skin</RouterLink>
    </div>

    <template v-else>
      <header class="head">
        <img v-if="view === '2d' && frontUrl" :src="frontUrl" alt="Character, front view" class="pixelated" width="48" height="96" />
        <img v-else :src="currentSkin.dataUrl" alt="Skin file" class="pixelated" width="96" height="96" />
        <div class="head-text">
          <h1>{{ currentSkin.label }}</h1>
          <p v-if="view === '2d'" class="muted">
            The whole character laid flat, seen from the front: 16 cubes wide and 32 tall. Lay the cubes on the table
            and glue each row to the one below it, starting at the feet.
          </p>
          <p v-else class="muted">
            Paint the cubes first, then build each body part from the bottom up. The grid is a top-down view of each
            layer, with the character's front at the bottom.
          </p>
        </div>
        <ViewToggle v-model="view" :options="VIEWS" />
      </header>

      <PaintControls v-model:max-paints="prefs.maxPaints">
        <div class="toggles">
          <label v-if="view === '3d'" class="toggle">
            <input v-model="prefs.hollow" type="checkbox" />
            Hollow parts (uses far fewer cubes)
          </label>
          <label class="toggle">
            <input v-model="prefs.overlay" type="checkbox" />
            Include hat, jacket and sleeve layer
          </label>
          <label v-if="view === '3d'" class="toggle">
            <input v-model="prefs.simplePaint" type="checkbox" />
            One color per cube (easier; corners less exact)
          </label>
        </div>
        <div class="toggles">
          <span class="muted small">Arm style</span>
          <label class="toggle">
            <input v-model="armModel" type="radio" value="classic" />
            Classic (4 cubes wide)
          </label>
          <label class="toggle">
            <input v-model="armModel" type="radio" value="slim" />
            Slim (3 cubes wide)
          </label>
        </div>
      </PaintControls>

      <!-- Same reserved box as the item guide, so the steps arriving doesn't shove the page down. -->
      <div class="guide-slot">
        <GuideViewer v-if="model && guide" :model="model" :guide="guide" :storage-key="storageKey" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.guide-slot {
  min-height: var(--guide-h);
}

.head {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}

.head img {
  background: var(--surface-2);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  flex: none;
}

.head {
  flex-wrap: wrap;
}

.head-text {
  flex: 1;
  min-width: 220px;
}

.head p {
  margin: 0;
  max-width: 44em;
}

.small {
  font-size: 0.85rem;
}
</style>
