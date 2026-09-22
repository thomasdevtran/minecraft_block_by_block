<script setup lang="ts">
import type { Guide } from '../engine/steps'
import type { BuildModel } from '../engine/model'
import StepInstructions from './StepInstructions.vue'
import CubeRecipes from './CubeRecipes.vue'
defineProps<{ title: string; guide: Guide; model: BuildModel }>()
</script>

<template>
  <article class="guide-print">
    <h1>{{ title }}</h1>
    <p>Block by Cube · Full build guide</p>
    <h2>Materials</h2>
    <p>{{ guide.materials.totalCubes.toLocaleString() }} equal-size cubes · {{ model.palette.length }} paint colors · suitable glue · paintbrush · labeled trays</p>
    <p v-if="guide.materials.plainCubes">{{ guide.materials.plainCubes }} cubes are hidden filler and need no paint.</p>
    <p>Match paints as closely as you can; screen colors are a reference. Small parts: keep away from children under three. Children need adult supervision.</p>
    <CubeRecipes :entries="guide.recipes.map(recipe => ({ recipe, count: recipe.count }))" :palette="model.palette" expanded />
    <section v-for="(step, i) in guide.steps" :key="i" class="print-step">
      <p>Step {{ i + 1 }} of {{ guide.steps.length }}</p>
      <StepInstructions :step="step" :recipes="guide.recipes" :palette="model.palette" printable />
    </section>
  </article>
</template>

<style scoped>
.guide-print { display: none; }
@media print {
  .guide-print { display: block; }
  h1, h2 { font-family: var(--sans); }
  .print-step { break-before: page; }
  :deep(.cube-recipes li) { break-inside: avoid; }
}
</style>
