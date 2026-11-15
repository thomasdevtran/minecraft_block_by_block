<script setup lang="ts">
import { ref, useId, watch } from 'vue'

const maxPaints = defineModel<number>('maxPaints', { required: true })

/**
 * What the slider shows while it moves. Rebuilding the guide is too heavy to do on every pixel of
 * a drag, so the real value still only changes when the slider is released (or on each key press),
 * but the number beside it now follows the thumb instead of sitting still until release.
 */
const draft = ref(maxPaints.value)
watch(maxPaints, (value) => (draft.value = value))

const id = useId()
const read = (event: Event) => Number((event.target as HTMLInputElement).value)
</script>

<template>
  <div class="controls card">
    <div class="slider">
      <!-- The live number is hidden from the accessible name: the slider already announces its
           value, and a name that changes on every step would be read out again each time. -->
      <label :for="`${id}-range`">Max paint colors: <strong aria-hidden="true">{{ draft }}</strong></label>
      <input
        :id="`${id}-range`"
        :value="draft"
        type="range"
        min="2"
        max="32"
        :aria-describedby="`${id}-hint`"
        @input="draft = read($event)"
        @change="maxPaints = read($event)"
      />
      <small :id="`${id}-hint`" class="muted">Fewer colors are easier to paint. More colors look closer to the game.</small>
    </div>
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
