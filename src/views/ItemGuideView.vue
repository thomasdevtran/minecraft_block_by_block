<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import GuideViewer from '../components/GuideViewer.vue'
import PaintControls from '../components/PaintControls.vue'
import { checkConnectivity } from '../engine/connectivity'
import { itemToModel } from '../engine/item'
import { loadPixels, type PixelImage } from '../engine/pixels'
import { buildGuide } from '../engine/steps'
import { loadCatalog, textureUrl, type CatalogItem } from '../lib/catalog'
import { readStored, writeStored } from '../lib/storage'

const props = defineProps<{ id: string }>()

const item = ref<CatalogItem | null>(null)
const pixels = shallowRef<PixelImage | null>(null)
const error = ref('')
const maxPaints = ref(readStored('prefs:item:maxPaints', 12))
watch(maxPaints, (v) => writeStored('prefs:item:maxPaints', v))

watch(
  () => props.id,
  async (id) => {
    item.value = null
    pixels.value = null
    error.value = ''
    try {
      const catalog = await loadCatalog()
      const found = catalog.items.find((i) => i.id === id)
      if (!found) throw new Error(`There's no item called “${id}”.`)
      item.value = found
      document.title = `${found.name} · Block by Block`
      pixels.value = await loadPixels(textureUrl(found))
    } catch (e) {
      error.value = (e as Error).message
    }
  },
  { immediate: true },
)

const model = computed(() =>
  pixels.value ? itemToModel(pixels.value, { maxPaints: maxPaints.value, simplePaint: false }) : null,
)
const guide = computed(() => (model.value ? buildGuide(model.value) : null))
const connectivity = computed(() => (model.value ? checkConnectivity(model.value.voxels) : null))
</script>

<template>
  <div class="container">
    <RouterLink to="/" class="back muted">← All items</RouterLink>
    <p v-if="error" class="notice">{{ error }}</p>

    <template v-if="item">
      <header class="head">
        <img :src="textureUrl(item)" alt="" class="pixelated" width="64" height="64" />
        <div>
          <h1>{{ item.name }}</h1>
          <p class="muted">
            Lay the cubes flat and glue each row to the one below it. One pixel = one cube, so any cube size works.
          </p>
        </div>
      </header>

      <PaintControls v-model:max-paints="maxPaints" />

      <p v-if="connectivity && connectivity.pieces > 1" class="notice">
        <strong>Heads up:</strong> some cubes only touch at their corners, so this build falls into
        {{ connectivity.pieces }} separate pieces. Glue it onto a backing board, or add filler cubes at
        {{ connectivity.bridgeSpots.length }} spots where a cube would join two pieces.
      </p>

      <GuideViewer v-if="model && guide" :model="model" :guide="guide" :storage-key="`item:${item.id}:${maxPaints}`" />
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
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
  padding: 8px;
  width: 80px;
  height: 80px;
  flex: none;
}

.head p {
  margin: 0;
}

.notice {
  margin-bottom: 16px;
}
</style>
