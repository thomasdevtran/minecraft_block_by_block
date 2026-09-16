<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { loadPixels } from '../engine/pixels'
import { validateSkin } from '../engine/skin'
import { blobToDataUrl, currentSkin, fetchSkinByUsername, setSkin, type LoadedSkin } from '../lib/skinStore'
import { showToast } from '../lib/toast'

const router = useRouter()
const username = ref('')
const loading = ref(false)
const uploading = ref(false)
const error = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

async function useSkin(skin: LoadedSkin) {
  const problem = validateSkin(await loadPixels(skin.dataUrl))
  if (problem) throw new Error(problem)
  setSkin(skin)
  showToast(`Loaded ${skin.label}'s skin.`)
  router.push('/skin/guide')
}

async function lookup() {
  if (loading.value || uploading.value) return
  const name = username.value.trim()
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) {
    error.value = 'Enter a Java Edition username: 1–16 letters, numbers or underscores.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await useSkin(await fetchSkinByUsername(name))
  } catch (e) {
    // fetch() itself only throws when the request never reached the server.
    error.value = e instanceof TypeError ? "Couldn't reach the skin server. Check your connection and try again." : (e as Error).message
  } finally {
    loading.value = false
  }
}

async function upload(file: File | undefined) {
  if (!file || uploading.value || loading.value) return
  error.value = ''
  if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
    error.value = `“${file.name}” isn't a PNG. Minecraft skins are .png files.`
    return
  }
  uploading.value = true
  try {
    if (file.size > 1024 * 1024) throw new Error('Choose a skin PNG smaller than 1 MB.')
    const header = new DataView(await file.slice(0, 24).arrayBuffer())
    if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(12) !== 0x49484452) {
      throw new Error('This file is not a valid PNG skin.')
    }
    if (header.getUint32(16) !== 64 || ![32, 64].includes(header.getUint32(20))) {
      throw new Error('Use a 64×64 or 64×32 skin PNG. Screenshots and larger images are not supported.')
    }
    const dataUrl = await blobToDataUrl(file)
    const pixels = await loadPixels(dataUrl).catch(() => {
      throw new Error(`“${file.name}” couldn't be opened as an image. It may be damaged.`)
    })
    // Slim skins leave the 4th column of each arm's front texture empty.
    const slim = pixels.height === 64 && pixels.data[(20 * 64 + 54) * 4 + 3] === 0
    await useSkin({ dataUrl, model: slim ? 'slim' : 'classic', label: file.name.replace(/\.png$/i, '') })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    uploading.value = false
    // Clear the input so picking the same file again still triggers a change.
    if (fileInput.value) fileInput.value.value = ''
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
      Turn a Minecraft skin file (64×64 or 64×32) into a cube figure: 16 cubes wide and 32 tall. You get the paint list, then build each
      body part layer by layer and put the character together.
    </p>

    <div class="options">
      <form class="card option" @submit.prevent="lookup">
        <h2>Look up a player</h2>
        <p class="muted">
          Build the skin of a Java Edition player. We send the username to Mojang; lookups may be cached and logged by our hosting provider. <RouterLink to="/privacy">Privacy</RouterLink>
        </p>
        <div class="row">
          <label for="skin-username" class="visually-hidden">Minecraft username</label>
          <input
            id="skin-username"
            v-model="username"
            type="text"
            placeholder="Username, e.g. jeb_"
            maxlength="16"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="search"
            aria-label="Minecraft username"
          />
          <button class="btn primary" :disabled="loading || uploading">
            {{ loading ? 'Looking up…' : 'Get skin' }}
          </button>
        </div>
      </form>

      <div
        :class="['card', 'option', 'drop', { dragging }]"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <h2>Upload a skin file</h2>
        <p class="muted">Choose or drop a 64×64 or 64×32 PNG, up to 1 MB. Your file stays on this device. Only use skins you have permission to use.</p>
        <button type="button" class="btn" :disabled="uploading || loading" @click="fileInput?.click()">
          {{ uploading ? 'Opening…' : 'Choose PNG…' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/png,.png"
          class="visually-hidden"
          tabindex="-1"
          aria-hidden="true"
          @change="upload(($event.target as HTMLInputElement).files?.[0])"
        />
      </div>
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

@media (max-width: 420px) {
  .row {
    flex-direction: column;
  }
}

.drop {
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
  overflow: hidden;
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
