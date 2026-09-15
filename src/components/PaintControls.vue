<script setup lang="ts">
const maxPaints = defineModel<number>('maxPaints', { required: true })
</script>

<template>
  <div class="controls card">
    <label class="slider">
      <span>
        Max paint colors: <strong>{{ maxPaints }}</strong>
      </span>
      <input v-model.lazy.number="maxPaints" type="range" min="2" max="32" />
      <small class="muted">Fewer colors are easier to paint. More colors look closer to the game.</small>
    </label>
    <slot />
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  align-items: flex-start;
  padding: 14px 18px;
  margin-bottom: 16px;
}

.slider {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: min(280px, 100%);
}

input[type='range'] {
  accent-color: var(--accent);
  width: 100%;
}

small {
  font-size: 0.8rem;
}

:slotted(label.toggle) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  cursor: pointer;
}

:slotted(label.toggle input) {
  accent-color: var(--accent);
  width: 1.1rem;
  height: 1.1rem;
}

:slotted(.toggles) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
