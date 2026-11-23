<script setup lang="ts">
import type { Guide, Recipe } from '../engine/steps'
import type { BuildModel } from '../engine/model'
import { textOn } from '../engine/palette'
import type { Face } from '../engine/voxels'
import StepInstructions from './StepInstructions.vue'
import CubeRecipes from './CubeRecipes.vue'
/**
 * `guide` prints the whole guide; `labels` prints one cut-out label per cube tray. `size` is the
 * finished-size sentence the Materials step shows, so the printout matches the screen.
 */
const props = defineProps<{ title: string; guide: Guide; model: BuildModel; mode: 'guide' | 'labels'; size: string }>()

const FACE_NAMES: [Face, string][] = [['front', 'front'], ['back', 'back'], ['left', 'left'], ['right', 'right'], ['top', 'top'], ['bottom', 'bottom']]

/** A label's paints, each with the sides that use it, so a mixed cube's label is complete on its own. */
function labelPaints(recipe: Recipe) {
  const sides = new Map<number, string[]>()
  for (const [face, name] of FACE_NAMES) {
    const paint = recipe.faces[face]
    if (paint !== undefined) sides.set(paint, [...(sides.get(paint) ?? []), name])
  }
  return [...sides].map(([paint, faces]) => ({
    paint: props.model.palette[paint]!,
    sides: recipe.uniform !== null ? 'all sides' : faces.join(', '),
  }))
}
/** One-paint cubes show their paint in the letter tile, like the tray they'll sit in. */
function tileStyle(recipe: Recipe) {
  if (recipe.uniform === null) return {}
  const hex = props.model.palette[recipe.uniform]!.hex
  return { background: hex, color: textOn(hex) }
}
</script>

<template>
  <article v-if="mode === 'guide'" class="guide-print">
    <h1>{{ title }}</h1>
    <p>Block by Cube · Full build guide</p>
    <h2>Materials</h2>
    <p>{{ guide.materials.totalCubes.toLocaleString() }} equal-size cubes · {{ model.palette.length }} paint colors · suitable glue · paintbrush · labeled trays</p>
    <p>{{ size }}</p>
    <p v-if="guide.materials.plainCubes">{{ guide.materials.plainCubes }} cubes are hidden filler and need no paint.</p>
    <p v-if="guide.materials.backingBoard">Gather a flat backing board and glue suitable for the board and cubes. The separate pieces attach to the board.</p>
    <p>Match paints as closely as you can; screen colors are a reference. Small parts: keep away from children under three. Children need adult supervision.</p>
    <CubeRecipes :entries="guide.recipes.map(recipe => ({ recipe, count: recipe.count }))" :palette="model.palette" expanded />
    <section v-for="(step, i) in guide.steps" :key="i" class="print-step">
      <p>Step {{ i + 1 }} of {{ guide.steps.length }}</p>
      <StepInstructions :step="step" :recipes="guide.recipes" :palette="model.palette" printable />
    </section>
  </article>

  <article v-else class="guide-print tray-labels">
    <h1>{{ title }}: tray labels</h1>
    <p>Cut along the dashed lines and put one label on each tray. The letters match the guide's steps.</p>
    <ul>
      <li v-for="recipe in guide.recipes" :key="recipe.id" class="tray-label">
        <span class="tile" :class="{ mixed: recipe.uniform === null }" :style="tileStyle(recipe)">{{ recipe.id }}</span>
        <div class="details">
          <strong>{{ recipe.count.toLocaleString() }} {{ recipe.count === 1 ? 'cube' : 'cubes' }}</strong>
          <ul class="paints">
            <li v-for="{ paint, sides } in labelPaints(recipe)" :key="paint.id">
              <span class="swatch" :style="{ background: paint.hex }"></span>#{{ paint.id }} {{ paint.name }} · {{ sides }}
            </li>
          </ul>
          <span class="build">{{ title }}</span>
        </div>
      </li>
      <li v-if="guide.materials.plainCubes" class="tray-label">
        <span class="tile plain">—</span>
        <div class="details">
          <strong>{{ guide.materials.plainCubes.toLocaleString() }} plain {{ guide.materials.plainCubes === 1 ? 'cube' : 'cubes' }}</strong>
          <ul class="paints"><li>No paint: hidden filler</li></ul>
          <span class="build">{{ title }}</span>
        </div>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.guide-print { display: none; }
@media print {
  .guide-print { display: block; }
  h1, h2 { font-family: var(--sans); }
  .print-step { break-before: page; }
  :deep(.cube-recipes li) { break-inside: avoid; }

  /* Three labels across a Letter or A4 page. Dashed edges are the cut lines; each label stays
     whole across page breaks. Colors print because the global print rules keep exact colors. */
  .tray-labels h1 { font-size: 14pt; margin: 0 0 2mm; }
  .tray-labels > p { margin: 0 0 5mm; font-size: 9pt; }
  .tray-labels > ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px dashed #777;
    border-left: 1px dashed #777;
  }
  .tray-label {
    display: flex;
    gap: 3mm;
    align-items: flex-start;
    padding: 4mm;
    border-right: 1px dashed #777;
    border-bottom: 1px dashed #777;
    break-inside: avoid;
    font-size: 9pt;
    line-height: 1.3;
  }
  .tile {
    flex: none;
    display: grid;
    place-items: center;
    width: 14mm;
    height: 14mm;
    border: 1px solid #333;
    border-radius: 2mm;
    font: 800 18pt var(--sans);
  }
  .tile.mixed { background: #111; color: #fff; }
  .tile.plain { background: var(--plain-cube); color: #111; }
  .details { min-width: 0; display: grid; gap: 1mm; }
  .details strong { font-size: 11pt; }
  .paints { list-style: none; padding: 0; margin: 0; }
  .swatch { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.5mm; border: 1px solid #333; vertical-align: -0.3mm; }
  .build { color: #555; font-size: 8pt; }
}
</style>
