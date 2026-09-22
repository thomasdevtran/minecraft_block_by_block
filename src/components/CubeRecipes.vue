<script setup lang="ts">
import type { PaletteEntry } from '../engine/palette'
import type { Recipe } from '../engine/steps'
import type { Face } from '../engine/voxels'
defineProps<{ entries: { recipe: Recipe | null; count: number }[]; palette: PaletteEntry[]; expanded?: boolean }>()
const faces: { key: Face; label: string; position: string }[] = [
  { key: 'top', label: 'Top', position: '2 / 1' },
  { key: 'left', label: 'Left', position: '1 / 2' },
  { key: 'front', label: 'Front', position: '2 / 2' },
  { key: 'right', label: 'Right', position: '3 / 2' },
  { key: 'back', label: 'Back', position: '4 / 2' },
  { key: 'bottom', label: 'Bottom', position: '2 / 3' },
]
</script>

<template>
  <ul class="cube-recipes">
    <li v-for="entry in entries" :key="entry.recipe?.id ?? 'plain'">
      <span class="cube-code">{{ entry.recipe?.id ?? '—' }}</span>
      <strong class="quantity">{{ entry.count }}×</strong>
      <span v-if="!entry.recipe">Plain filler cube · no paint</span>
      <span v-else-if="entry.recipe.uniform !== null" class="paint-label">
        <span class="swatch" aria-hidden="true" :style="{ background: palette[entry.recipe.uniform]!.hex }"></span>
        {{ palette[entry.recipe.uniform]!.name }} <span class="muted">#{{ palette[entry.recipe.uniform]!.id }} · all sides</span>
      </span>
      <details v-else class="face-details" :open="expanded">
        <summary>Cube {{ entry.recipe.id }} · view painted sides</summary>
        <p class="muted">Unfolded cube. Match the front and top before placing it.</p>
        <div class="face-net">
          <div v-for="face in faces" :key="face.key" class="face" :style="{ gridArea: face.position.split(' / ').reverse().join(' / ') }">
            <strong>{{ face.label }}</strong>
            <template v-if="entry.recipe.faces[face.key] !== undefined">
              <span class="swatch" aria-hidden="true" :style="{ background: palette[entry.recipe.faces[face.key]!]!.hex }"></span>
              <span>#{{ palette[entry.recipe.faces[face.key]!]!.id }} {{ palette[entry.recipe.faces[face.key]!]!.name }}</span>
            </template>
            <span v-else class="muted">Hidden · no paint needed</span>
          </div>
        </div>
      </details>
    </li>
  </ul>
</template>

<style scoped>
.cube-recipes { list-style: none; padding: 0; margin: 0 0 20px; display: grid; gap: 8px; }
li { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--line); padding: 10px; border-radius: 8px; font-size: .95rem; }
.cube-code { display: grid; place-items: center; min-width: 36px; min-height: 36px; padding: 4px; background: var(--ink); color: var(--bg); border-radius: 5px; font-weight: 800; }
.quantity { min-width: 2.5em; font-variant-numeric: tabular-nums; }
.paint-label { flex: 1; min-width: 150px; }
.paint-label .muted { font-size: .85rem; }
.face-details { flex: 1 1 100%; }
summary { cursor: pointer; color: var(--accent); font-weight: 600; padding: 10px 0; min-height: 44px; }
.face-details p { margin: 8px 0; font-size: .85rem; }
.face-net { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; }
.face { border: 1px solid var(--line); border-radius: 4px; padding: 6px 3px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; font-size: .72rem; overflow-wrap: anywhere; }
.face .swatch { margin: 0; }
@media print { .face-details > * { display: block; } .face-details .face-net { display: grid; } }
</style>
