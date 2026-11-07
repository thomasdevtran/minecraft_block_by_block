<script setup lang="ts">
import { computed, useId } from 'vue'
import type { PartInfo } from '../engine/model'

const props = defineProps<{ parts: PartInfo[]; adding: string[] }>()
const CELL = 12
const gridId = useId()

function project(view: 'front' | 'side') {
  const front = view === 'front'
  const left = Math.min(...props.parts.map(part => part.origin[front ? 0 : 2]))
  const top = Math.max(...props.parts.map(part => part.origin[1] + part.h))
  const boxes = props.parts.map(part => ({
    x: (part.origin[front ? 0 : 2] - left) * CELL,
    y: (top - part.origin[1] - part.h) * CELL,
    w: (front ? part.w : part.d) * CELL,
    h: part.h * CELL,
    label: part.name.split(' '),
    adding: props.adding.includes(part.id),
  }))
  // Legs share a side profile, as do the arms and body. The latest part takes the outline.
  const visible = new Map(boxes.map(box => [`${box.x}:${box.y}:${box.w}:${box.h}`, box]))
  return {
    view,
    name: front ? 'Front view' : 'Side view',
    width: Math.max(...boxes.map(box => box.x + box.w)) + 4,
    height: Math.max(...boxes.map(box => box.y + box.h)) + 4,
    boxes: [...visible.values()],
  }
}

const views = computed(() => [project('front'), project('side')])
</script>

<template>
  <figure class="assembly-alignment">
    <figcaption>
      <strong>Assembly alignment</strong>
      <span>Solid outline = attach now · dashed outline = already attached · each square = one cube</span>
    </figcaption>
    <div class="projections">
      <div v-for="projection in views" :key="projection.view" class="projection">
        <p>{{ projection.name }}<span v-if="projection.view === 'side'"> · Front →</span></p>
        <svg
          :viewBox="`-2 -2 ${projection.width} ${projection.height}`"
          :width="projection.width"
          :height="projection.height"
          role="img"
          :aria-label="projection.view === 'front' ? 'Front view of the parts aligned in this step' : 'Side view of the aligned parts, with the front on the right'"
        >
          <defs>
            <pattern :id="`${gridId}-${projection.view}`" :width="CELL" :height="CELL" patternUnits="userSpaceOnUse">
              <path :d="`M ${CELL} 0 H 0 V ${CELL}`" class="cube-lines" />
            </pattern>
          </defs>
          <g v-for="box in projection.boxes" :key="`${box.x}:${box.y}`" :transform="`translate(${box.x}, ${box.y})`" :class="{ adding: box.adding }">
            <rect :width="box.w" :height="box.h" class="part-fill" />
            <rect :width="box.w" :height="box.h" :fill="`url(#${gridId}-${projection.view})`" />
            <rect :width="box.w" :height="box.h" class="part-outline" />
            <text v-if="projection.view === 'front'" :x="box.w / 2" :y="box.h / 2 - (box.label.length - 1) * 6">
              <tspan v-for="(word, i) in box.label" :key="word" :x="box.w / 2" :dy="i ? 12 : 0">{{ word }}</tspan>
            </text>
          </g>
        </svg>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.assembly-alignment { margin: 4px 0 16px; }
figcaption { display: grid; gap: 4px; margin-bottom: 12px; }
figcaption span { font-size: .85rem; color: var(--ink-soft); }
.projections { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; }
.projection { min-width: 0; max-width: 100%; }
.projection p { margin: 0 0 4px; font-size: .85rem; font-weight: 600; }
svg { display: block; max-width: 100%; height: auto; }
.cube-lines { fill: none; stroke: var(--line); stroke-width: 1; }
.part-fill { fill: var(--surface); }
.part-outline { fill: none; stroke: var(--ink); stroke-width: 1; stroke-dasharray: 3 2; }
.adding .part-fill { fill: var(--accent-soft); }
.adding .part-outline { stroke-width: 2; stroke-dasharray: none; }
text {
  fill: var(--ink);
  stroke: var(--surface);
  stroke-width: 3;
  paint-order: stroke;
  text-anchor: middle;
  dominant-baseline: central;
  font: 700 11px var(--sans);
}
@media print { .assembly-alignment { break-inside: avoid; } }
</style>
