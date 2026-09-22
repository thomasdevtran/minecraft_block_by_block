<script setup lang="ts">
import { computed } from 'vue'
import type { Step, Recipe } from '../engine/steps'
import type { PaletteEntry } from '../engine/palette'
import { cubesForStep } from '../lib/guideDisplay'
import CubeRecipes from './CubeRecipes.vue'
import StepGrid from './StepGrid.vue'
const props = defineProps<{ step: Step; recipes: Recipe[]; palette: PaletteEntry[]; printable?: boolean }>()
const entries = computed(() => cubesForStep(props.step, props.recipes))
const longLegend = computed(() => props.step.kind === 'build' && entries.value.length > 6 && !props.printable)
const sentences = computed(() => props.step.text.split(/(?<=\.)\s+/).filter(Boolean))
</script>

<template>
  <h2 tabindex="-1">{{ step.title }}</h2>
  <ul class="actions"><li v-for="line in sentences" :key="line">{{ line }}</li></ul>
  <p v-if="step.kind === 'paint'" class="paint-tip">Let the paint dry. Keep each cube type in a separate tray labeled with its letter.</p>
  <template v-if="entries.length">
    <h3>{{ step.kind === 'build' ? 'Gather for this step' : 'Your cube labels' }}</h3>
    <p v-if="longLegend" class="legend-hint muted">{{ entries.length }} cube types in this layer. Scroll the list to find a letter.</p>
    <div :class="{ 'long-legend': longLegend }" :tabindex="longLegend ? 0 : undefined" :role="longLegend ? 'region' : undefined" :aria-label="longLegend ? 'Cubes for this layer; scroll for all cube types' : undefined">
      <CubeRecipes :entries="entries" :palette="palette" :expanded="printable" />
    </div>
  </template>
  <StepGrid v-if="step.kind === 'build'" :grid="step.grid" :palette="palette" />
</template>

<style scoped>
h2 { font: 750 clamp(1.15rem, 3vw, 1.4rem)/1.4 var(--sans); letter-spacing: 0; }
h3 { font: 700 .95rem/1.4 var(--sans); margin-bottom: 8px; }
.actions { padding-left: 1.25rem; margin: 0 0 16px; line-height: 1.7; }
.actions li + li { margin-top: 8px; }
.paint-tip { padding: 12px; border-left: 3px solid var(--accent); background: var(--accent-soft); font-size: .95rem; }
.legend-hint { margin: 0 0 8px; font-size: .85rem; }
.long-legend { max-height: 300px; overflow-y: auto; padding-right: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
</style>
