<script setup lang="ts">
import { computed } from 'vue'
import type { Photo } from '../lib/site'

/**
 * `sizes` tells the browser how wide the photo shows, so it can pick the smallest WebP copy.
 * `priority` is for the photo at the top of the page: it is the largest thing on the first screen,
 * so it loads straight away instead of lazily.
 */
const props = defineProps<{ photo?: Photo; alt: string; sizes?: string; priority?: boolean }>()
const srcset = computed(() =>
  props.photo?.webp?.map((width) => `${props.photo!.jpg.replace(/\.jpe?g$/i, `-${width}.webp`)} ${width}w`).join(', '),
)
</script>

<template>
  <div class="craft-photo">
    <picture v-if="photo">
      <source v-if="srcset" type="image/webp" :srcset="srcset" :sizes="sizes ?? '100vw'" />
      <img
        :src="photo.jpg"
        :alt="alt"
        width="1600"
        height="1000"
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : undefined"
        decoding="async"
      />
    </picture>
    <div v-else class="photo-placeholder" role="img" :aria-label="`${alt}: craft photo coming soon`">
      <svg width="38" height="38" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 9h7l2-3h6l2 3h7v17H4V9Z" stroke="currentColor" stroke-width="1.5" /><circle cx="16" cy="17" r="5" stroke="currentColor" stroke-width="1.5" /></svg>
      <strong>Room for a real-life build</strong>
      <span>Craft photo coming soon</span>
    </div>
  </div>
</template>

<style scoped>
.craft-photo { aspect-ratio: 16 / 10; overflow: hidden; border-radius: 8px; background: var(--surface-2); }
.craft-photo picture { display: block; height: 100%; }
.craft-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-placeholder { height: calc(100% - 24px); margin: 12px; border: 1px dashed var(--ink-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink-soft); text-align: center; padding: 16px; }
.photo-placeholder strong { font-size: .95rem; color: var(--ink); }
.photo-placeholder span { font-size: .8rem; }
</style>
