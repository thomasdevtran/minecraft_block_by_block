<script setup lang="ts">
import { computed, ref } from 'vue'
import { textOn, type PaletteEntry } from '../engine/palette'
import type { StepGrid } from '../engine/steps'
import { activeRow } from '../lib/guide'

const props = defineProps<{ grid: StepGrid; palette: PaletteEntry[] }>()

const CELL = 40
const PLAIN_CUBE = '—'
const enlarged = ref(false)

const cells = computed(() =>
  props.grid.cells.map((c) => {
    const fill = c.paint === null ? 'var(--plain-cube)' : props.palette[c.paint].hex
    return {
      ...c,
      fill,
      text: c.paint === null ? '#3b2f20' : textOn(props.palette[c.paint].hex),
      label: c.recipe ?? PLAIN_CUBE,
    }
  }),
)

const width = computed(() => props.grid.cols * CELL)
const height = computed(() => props.grid.rows * CELL)
const fontSize = computed(() => (cells.value.some((c) => c.label.length > 1) ? 15 : 19))
const hasSupports = computed(() => cells.value.some(c => c.support))
const row = computed(() => activeRow(props.grid.cells, props.grid.cols))
const textRows = computed(() => {
  const rows = new Map<number, string[]>()
  for (const cell of [...props.grid.cells].filter((cell) => cell.state === 'now').sort((a, b) => a.row - b.row || a.col - b.col)) {
    const row = rows.get(cell.row) ?? []
    const label = cell.recipe ? `cube ${cell.recipe}` : 'plain filler cube'
    row.push(`column ${cell.col + 1}: ${label}${cell.support ? ' (support)' : ''}`)
    rows.set(cell.row, row)
  }
  return [...rows].map(([row, cubes]) => `Row ${row + 1}: ${cubes.join('; ')}.`)
})
</script>

<template>
  <section v-if="row" class="row-focus" aria-label="Enlarged current row">
    <strong>Add this row · left to right</strong>
    <p class="muted">Numbers show columns. Dashed spaces stay empty.</p>
    <div class="row-scroll" role="region" tabindex="0" aria-label="Current row; use the arrow keys to scroll sideways">
      <div v-for="(cell, col) in row" :key="col" class="row-column">
        <span class="visually-hidden">Column {{ col + 1 }}: {{ cell ? (cell.recipe ? `cube ${cell.recipe}` : 'plain filler cube') : 'leave empty' }}.</span>
        <span class="column-number" aria-hidden="true">{{ col + 1 }}</span>
        <span aria-hidden="true" :class="['row-cube', { gap: !cell }]" :style="cell ? { background: cell.paint === null ? 'var(--plain-cube)' : palette[cell.paint]!.hex, color: cell.paint === null ? '#3b2f20' : textOn(palette[cell.paint]!.hex) } : {}">
          {{ cell ? (cell.recipe ?? PLAIN_CUBE) : '' }}
        </span>
      </div>
    </div>
  </section>
  <!-- Title and zoom share one row, and the key sits under the map: two rows fewer above the map,
       which is what kept Next on screen. -->
  <div class="map-head">
    <h3>Placement map</h3>
    <!-- One fixed label plus the pressed state; a label that also flipped was read as "Fit map, pressed". -->
    <button type="button" class="btn map-zoom" :aria-pressed="enlarged" @click="enlarged = !enlarged">Enlarge map</button>
  </div>
  <p v-if="enlarged" class="zoom-hint muted">Scroll across and down to see the whole map.</p>
  <figure class="step-grid">
    <div :class="['map-window', { enlarged }]" :tabindex="enlarged ? 0 : undefined" :role="enlarged ? 'region' : undefined" :aria-label="enlarged ? 'Enlarged placement map; scroll to explore' : undefined">
    <svg
      :viewBox="`-2 -2 ${width + 4} ${height + 4}`"
      :style="{ maxWidth: enlarged ? 'none' : `${Math.max(grid.cols * 48, 220)}px`, width: enlarged ? `${width}px` : '100%', maxHeight: enlarged ? 'none' : undefined }"
      role="img"
      :aria-label="`Placement map: ${grid.cols} columns by ${grid.rows} rows. ${grid.cells.filter(cell => cell.state === 'now').length} cubes to add. Bottom edge: ${grid.bottomLabel}. Open Cube positions below for exact text instructions.`"
    >
      <g v-for="r in grid.rows" :key="`r${r}`">
        <rect
          v-for="c in grid.cols"
          :key="`e${r}-${c}`"
          :x="(c - 1) * CELL"
          :y="(r - 1) * CELL"
          :width="CELL"
          :height="CELL"
          class="empty"
        />
      </g>
      <g v-for="cell in cells" :key="`${cell.col}-${cell.row}`" :class="['cell', cell.state]">
        <rect :x="cell.col * CELL" :y="cell.row * CELL" :width="CELL" :height="CELL" :fill="cell.fill" />
        <text
          v-if="cell.state === 'now'"
          :x="cell.col * CELL + CELL / 2"
          :y="cell.row * CELL + CELL / 2"
          :fill="cell.text"
          :font-size="fontSize"
        >
          {{ cell.label }}
        </text>
        <text
          v-if="cell.support"
          :x="cell.col * CELL + 32"
          :y="cell.row * CELL + 8"
          :fill="cell.text"
          font-size="13"
        >+</text>
      </g>
    </svg>
    </div>
    <figcaption>
      <strong>▼ {{ grid.bottomLabel }}</strong>
      <span class="grid-key">Letters = painted cubes · {{ PLAIN_CUBE }} = plain cube (no paint) · dashed = leave empty · faded = already built<span v-if="hasSupports"> · + = support cube</span></span>
    </figcaption>
  </figure>
  <details class="grid-text">
    <summary>Cube positions (text version)</summary>
    <p>Rows count from the top of the grid; columns count from the left. Only cubes added in this step are listed. The bottom edge is {{ grid.bottomLabel.toLowerCase() }}.</p>
    <ul><li v-for="row in textRows" :key="row">{{ row }}</li></ul>
  </details>
</template>

<style scoped>
.grid-text { margin-top: 16px; font-size: 0.88rem; }
.grid-text summary { cursor: pointer; min-height: 44px; padding: 10px 0; color: var(--accent); font-weight: 600; }
.grid-text p { margin: 8px 0; }
.grid-text ul { padding-left: 20px; overflow-wrap: anywhere; }
.grid-text li { margin-bottom: 8px; }
.step-grid {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

svg {
  width: 100%;
  height: auto;
  display: block;
  max-height: 340px;
}

.empty {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.cell rect {
  stroke: rgba(0, 0, 0, 0.55);
  stroke-width: 2;
}

.cell.done {
  opacity: 0.3;
}

.cell text {
  font-family: var(--sans);
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}

figcaption {
  display: grid;
  justify-items: center;
  gap: 2px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.row-focus { padding: 14px; background: var(--surface-2); border-radius: 8px; margin-bottom: 20px; min-width: 0; }
.row-focus p { font-size: .85rem; margin: 4px 0 12px; }
/* position: relative makes the strip the containing block of the screen-reader labels inside it.
   Without it those absolutely positioned labels escaped the scroll box and widened the whole page,
   so phones zoomed the guide out on every build step. */
.row-scroll { position: relative; display: flex; overflow-x: auto; gap: 3px; padding-bottom: 8px; }
.row-column { display: grid; justify-items: center; gap: 4px; flex: 0 0 40px; }
.column-number { font-size: .8rem; color: var(--ink-soft); }
.row-cube { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid var(--ink-soft); font-weight: 800; border-radius: 3px; }
.row-cube.gap { border-style: dashed; opacity: .5; }
.map-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.map-head h3 { font: 700 .95rem/1.4 var(--sans); margin: 0; }
.grid-key { font-size: .8rem; }
.map-zoom { font-size: .85rem; padding: 0.45em 0.9em; }
.map-zoom[aria-pressed='true'] { background: var(--pressed-bg); border-color: var(--pressed-bg); color: var(--pressed-ink); }
.map-window { width: 100%; display: grid; justify-items: center; }
.map-window.enlarged { display: block; max-height: 360px; overflow: auto; }
.zoom-hint { font-size: .85rem; }
@media (max-width: 640px) { svg { max-height: 260px; } }
/* Beside the 3D preview on shorter laptop screens the map gives up a little height, so the step's
   heading, cube list and whole map fit above the sticky Back/Next bar and Next never has to scroll. */
@media (min-width: 861px) { svg { max-height: clamp(220px, calc(100vh - 470px), 340px); } }
@media print { .row-focus, .grid-text, .map-zoom, .zoom-hint { display: none; } svg { max-height: 85mm; } }
</style>
