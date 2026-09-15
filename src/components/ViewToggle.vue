<script setup lang="ts" generic="T extends string">
/** Segmented 2D / 3D style picker used on the guide pages. */
defineProps<{ options: { value: T; label: string; hint: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="view-toggle" role="radiogroup" aria-label="Build style">
    <button
      v-for="o in options"
      :key="o.value"
      role="radio"
      :aria-checked="model === o.value"
      :class="{ active: model === o.value }"
      @click="model = o.value"
    >
      <strong>{{ o.label }}</strong>
      <small>{{ o.hint }}</small>
    </button>
  </div>
</template>

<style scoped>
.view-toggle {
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 4px;
  gap: 4px;
}

button {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 96px;
  padding: 0.45rem 0.9rem;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
  font: inherit;
}

button strong {
  font: 700 1.3rem var(--pixel);
  line-height: 1.1;
}

button small {
  font-size: 0.75rem;
}

button.active {
  background: var(--accent);
  color: var(--accent-ink);
}

button:focus-visible {
  outline: 3px solid var(--accent);
}
</style>
