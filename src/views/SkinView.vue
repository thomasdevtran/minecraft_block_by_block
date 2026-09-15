<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { loadPixels } from '../engine/pixels'
import { validateSkin } from '../engine/skin'
import { blobToDataUrl, currentSkin, fetchSkinByUsername, setSkin, type LoadedSkin } from '../lib/skinStore'

const router = useRouter()
const username = ref('')
const loading = ref(false)
const error = ref('')
const dragging = ref(false)

async function useSkin(skin: LoadedSkin) {
  const problem = validateSkin(await loadPixels(skin.dataUrl))
  if (problem) throw new Error(problem)
  setSkin(skin)
  router.push('/skin/guide')
}

async function lookup() {
  if (!username.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await useSkin(await fetchSkinByUsername(username.value))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function upload(file: File | undefined) {
  if (!file) return
  error.value = ''
  if (file.type !== 'image/png') {
    error.value = 'Skins are PNG files. Please choose a .png image.'
    return
  }
  try {
    const dataUrl = await blobToDataUrl(file)
    const pixels = await loadPixels(dataUrl)
    // Slim skins leave the 4th column of each arm's front texture empty.
    const slim = pixels.height === 64 && pixels.data[(20 * 64 + 54) * 4 + 3] === 0
    await useSkin({ dataUrl, model: slim ? 'slim' : 'classic', label: file.name.replace(/\.png$/i, '') })
  } catch (e) {
    error.value = (e as Error).message
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  upload(e.dataTransfer?.files[0])
}
</script>

<template>
  <div class="container narrow">
    <h1>Build a player skin</h1>
    <p class="lead muted">
      Turn any Minecraft skin into a cube figure: 16 cubes wide and 32 tall. You get the paint list, then build each
      body part layer by layer and put the character together.
    </p>

    <div class="options">
      <form class="card option" @submit.prevent="lookup">
        <h2>Look up a player</h2>
        <p class="muted">Use the skin of any Java Edition player.</p>
        <div class="row">
          <input
            v-model="username"
            type="text"
            placeholder="Username, e.g. jeb_"
            maxlength="16"
            autocomplete="off"
            spellcheck="false"
            aria-label="Minecraft username"
          />
          <button class="btn primary" :disabled="loading || !username.trim()">
            {{ loading ? 'Looking up…' : 'Get skin' }}
          </button>
        </div>
      </form>

      <label
        :class="['card', 'option', 'drop', { dragging }]"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <h2>Upload a skin file</h2>
        <p class="muted">Drop a 64×64 skin PNG here, or click to choose one.</p>
        <span class="btn">Choose PNG…</span>
        <input type="file" accept="image/png" class="visually-hidden" @change="upload(($event.target as HTMLInputElement).files?.[0])" />
      </label>
    </div>

    <p v-if="error" class="notice error-box" role="alert">{{ error }}</p>

    <div v-if="currentSkin" class="resume card">
      <img :src="currentSkin.dataUrl" alt="" class="pixelated" width="64" height="64" />
      <div>
        <strong>Continue with {{ currentSkin.label }}</strong>
        <p class="muted">Your progress on this skin is saved.</p>
      </div>
      <RouterLink to="/skin/guide" class="btn">Open guide →</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 860px;
}

.lead {
  font-size: 1.1rem;
}

.options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 24px 0 16px;
}

@media (max-width: 680px) {
  .options {
    grid-template-columns: minmax(0, 1fr);
  }
}

.option {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.row {
  display: flex;
  gap: 8px;
  width: 100%;
  margin-top: auto;
}

.row input {
  flex: 1;
}

.drop {
  cursor: pointer;
  border-style: dashed;
}

.drop .btn {
  margin-top: auto;
}

.drop.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.error-box {
  border-color: var(--error);
}

.resume {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  flex-wrap: wrap;
}

.resume img {
  background: var(--surface-2);
  border-radius: 6px;
}

.resume div {
  flex: 1;
  min-width: 160px;
}

.resume p {
  margin: 0;
  font-size: 0.9rem;
}
</style>
