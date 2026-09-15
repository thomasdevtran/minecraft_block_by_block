<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import GuideViewer from '../components/GuideViewer.vue'
import PaintControls from '../components/PaintControls.vue'
import { loadPixels, type PixelImage } from '../engine/pixels'
import { skinToModel, type SkinOptions } from '../engine/skin'
import { buildGuide } from '../engine/steps'
import { currentSkin, setSkin } from '../lib/skinStore'
import { hashString, readStored, writeStored } from '../lib/storage'

const pixels = shallowRef<PixelImage | null>(null)
const prefs = reactive(
  readStored('prefs:skin', { hollow: true, overlay: true, simplePaint: true, maxPaints: 16 }),
)
watch(prefs, (v) => writeStored('prefs:skin', v))

watch(
  () => currentSkin.value?.dataUrl,
  async (url) => {
    pixels.value = url ? await loadPixels(url) : null
    if (currentSkin.value) document.title = `${currentSkin.value.label} skin · Block by Block`
  },
  { immediate: true },
)

const armModel = computed({
  get: () => currentSkin.value?.model ?? 'classic',
  set: (model) => currentSkin.value && setSkin({ ...currentSkin.value, model }),
})

const options = computed<SkinOptions>(() => ({ ...prefs, model: armModel.value }))
const model = computed(() => (pixels.value ? skinToModel(pixels.value, options.value) : null))
const guide = computed(() => (model.value ? buildGuide(model.value) : null))
const storageKey = computed(() =>
  currentSkin.value ? `skin:${hashString(currentSkin.value.dataUrl)}:${hashString(JSON.stringify(options.value))}` : '',
)
</script>

<template>
  <div class="container">
    <RouterLink to="/skin" class="back muted">← Choose another skin</RouterLink>

    <div v-if="!currentSkin" class="notice">
      No skin loaded yet. <RouterLink to="/skin">Look one up or upload a file</RouterLink> to get started.
    </div>

    <template v-else>
      <header class="head">
        <img :src="currentSkin.dataUrl" alt="Skin file" class="pixelated" width="96" height="96" />
        <div>
          <h1>{{ currentSkin.label }}</h1>
          <p class="muted">
            Paint the cubes first, then build each body part from the bottom up. The grid is a top-down view of each
            layer, with the character's front at the bottom.
          </p>
        </div>
      </header>

      <PaintControls v-model:max-paints="prefs.maxPaints">
        <div class="toggles">
          <label class="toggle">
            <input v-model="prefs.hollow" type="checkbox" />
            Hollow parts (uses far fewer cubes)
          </label>
          <label class="toggle">
            <input v-model="prefs.overlay" type="checkbox" />
            Include hat, jacket and sleeve layer
          </label>
          <label class="toggle">
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

.head img {
  background: var(--surface-2);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  flex: none;
}

.head p {
  margin: 0;
  max-width: 44em;
}

.small {
  font-size: 0.85rem;
}
</style>
