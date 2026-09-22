<script setup lang="ts">
defineProps<{ src?: string; alt: string }>()
</script>

<template>
  <div class="craft-photo">
    <img v-if="src" :src="src" :alt="alt" loading="lazy" />
    <div v-else class="photo-placeholder" role="img" :aria-label="`${alt}: craft photo coming soon`">
      <svg width="38" height="38" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 9h7l2-3h6l2 3h7v17H4V9Z" stroke="currentColor" stroke-width="1.5" /><circle cx="16" cy="17" r="5" stroke="currentColor" stroke-width="1.5" /></svg>
      <strong>Room for a real-life build</strong>
      <span>Craft photo coming soon</span>
    </div>
  </div>
</template>

<style scoped>
.craft-photo { aspect-ratio: 16 / 10; overflow: hidden; border-radius: 8px; background: var(--surface-2); }
.craft-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-placeholder { height: calc(100% - 24px); margin: 12px; border: 1px dashed var(--ink-soft); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink-soft); text-align: center; padding: 16px; }
.photo-placeholder strong { font-size: .95rem; color: var(--ink); }
.photo-placeholder span { font-size: .8rem; }
</style>
