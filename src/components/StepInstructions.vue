<script lang="ts">
import { ref } from 'vue'
/** Shared by every step, so a builder who opens the paint names keeps them open from layer to layer. */
const namesOpen = ref(false)
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { Step, Recipe } from '../engine/steps'
import type { PaletteEntry } from '../engine/palette'
import type { Face } from '../engine/voxels'
import { cubesForStep } from '../lib/guide'
import CubeRecipes from './CubeRecipes.vue'
import SkinAssemblyDiagram from './SkinAssemblyDiagram.vue'
import StepGrid from './StepGrid.vue'
/** `position` ("Step 3 of 20") is read before the title by screen readers; the print layout omits it. */
const props = defineProps<{ step: Step; recipes: Recipe[]; palette: PaletteEntry[]; printable?: boolean; position?: string }>()
const entries = computed(() => cubesForStep(props.step, props.recipes))
const sentences = computed(() => props.step.text.split(/(?<=\.)\s+/).filter(Boolean))

/**
 * Build steps list their cubes as small chips (letter, count, color) instead of a card per cube type:
 * the cards took up to 300px and pushed Next below the screen, so every step scrolled the page.
 * The full list with paint names and painted sides stays one tap away.
 */
const compactGather = computed(() => props.step.kind === 'build' && !props.printable)

const FACE_ORDER: Face[] = ['front', 'top', 'left', 'right', 'back', 'bottom']
type Entry = { recipe: Recipe | null; count: number }
function paintsOf(recipe: Recipe) {
  return [...new Set(FACE_ORDER.map((face) => recipe.faces[face]).filter((paint) => paint !== undefined))]
}
function chipFill({ recipe }: Entry) {
  if (!recipe) return 'var(--plain-cube)'
  if (recipe.uniform !== null) return props.palette[recipe.uniform]!.hex
  // Mixed cubes show their two main paints split corner to corner, front first.
  const [a, b = a] = paintsOf(recipe).map((paint) => props.palette[paint]!.hex)
  return `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`
}
function chipName({ recipe }: Entry) {
  if (!recipe) return 'plain filler cube, no paint'
  if (recipe.uniform !== null) return `${props.palette[recipe.uniform]!.name}, all sides`
  return `painted sides: ${paintsOf(recipe).map((paint) => props.palette[paint]!.name).join(', ')}`
}
</script>

<template>
  <h2 tabindex="-1"><span v-if="position" class="visually-hidden">{{ position }}: </span>{{ step.title }}</h2>
  <ul class="actions"><li v-for="line in sentences" :key="line">{{ line }}</li></ul>
  <p v-if="step.kind === 'paint'" class="paint-tip">Let the paint dry. Keep each cube type in a separate tray labeled with its letter.</p>
  <template v-if="entries.length">
    <h3>{{ step.kind === 'build' ? 'Gather for this step' : 'Your cube labels' }}</h3>
    <template v-if="compactGather">
      <div class="gather-row">
      <ul class="gather">
        <li v-for="entry in entries" :key="entry.recipe?.id ?? 'plain'" :title="`Cube ${entry.recipe?.id ?? '—'}: ${chipName(entry)}`">
          <span class="chip-code">{{ entry.recipe?.id ?? '—' }}</span>
          <span class="chip-count">{{ entry.count }}×</span>
          <span class="chip-swatch" aria-hidden="true" :style="{ background: chipFill(entry) }"></span>
          <span class="visually-hidden">{{ chipName(entry) }}</span>
        </li>
      </ul>
      <details class="gather-names" :open="namesOpen" @toggle="namesOpen = ($event.target as HTMLDetailsElement).open">
        <summary>Show paint names</summary>
        <CubeRecipes :entries="entries" :palette="palette" />
      </details>
      </div>
    </template>
    <CubeRecipes v-else :entries="entries" :palette="palette" :expanded="printable" />
  </template>
  <StepGrid v-if="step.kind === 'build'" :grid="step.grid" :palette="palette" />
  <SkinAssemblyDiagram v-else-if="step.kind === 'assemble'" :parts="step.alignedParts" :adding="step.parts" />
</template>

<style scoped>
h2 { font: 750 clamp(1.15rem, 3vw, 1.4rem)/1.4 var(--sans); letter-spacing: 0; }
h3 { font: 700 .95rem/1.4 var(--sans); margin-bottom: 8px; }
.actions { padding-left: 1.25rem; margin: 0 0 14px; line-height: 1.55; }
.actions li + li { margin-top: 4px; }
.paint-tip { padding: 12px; border-left: 3px solid var(--accent); background: var(--accent-soft); font-size: .95rem; }

/* The "Show paint names" toggle sits at the end of the chip row while closed, and takes the full
   width once open so the list under it has room. */
.gather-row { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; margin-bottom: 12px; }
.gather { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.gather li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: .9rem;
}
.chip-code {
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  background: var(--ink);
  color: var(--bg);
  border-radius: 4px;
  font-weight: 800;
}
.chip-count { font-weight: 700; font-variant-numeric: tabular-nums; }
/* The faint inset edge keeps white and very light paints visible against the card. */
.chip-swatch { width: 16px; height: 16px; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--swatch-edge); }
.gather-names { font-size: .9rem; }
.gather-names[open] { flex-basis: 100%; }
.gather-names summary { cursor: pointer; min-height: 44px; padding: 10px 0; color: var(--accent); font-weight: 600; }
</style>
