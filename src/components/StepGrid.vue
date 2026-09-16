<script setup lang="ts">
import { computed } from 'vue'
import type { PaletteEntry } from '../engine/palette'
import type { StepGrid } from '../engine/steps'
import { textOn } from '../lib/colors'

const props = defineProps<{ grid: StepGrid; palette: PaletteEntry[] }>()

const CELL = 40

const cells = computed(() =>
  props.grid.cells.map((c) => {
    const fill = c.paint === null ? 'var(--plain-cube)' : props.palette[c.paint].hex
    return {
      ...c,
      fill,
      text: c.paint === null ? '#3b2f20' : textOn(props.palette[c.paint].hex),
      label: c.recipe ?? '',
    }
  }),
)

const width = computed(() => props.grid.cols * CELL)
const height = computed(() => props.grid.rows * CELL)
const fontSize = computed(() => (cells.value.some((c) => c.label.length > 1) ? 15 : 19))
const textRows = computed(() => {
  const rows = new Map<number, string[]>()
  for (const cell of [...props.grid.cells].filter((cell) => cell.state === 'now').sort((a, b) => a.row - b.row || a.col - b.col)) {
    const row = rows.get(cell.row) ?? []
    row.push(`column ${cell.col + 1}: ${cell.recipe ? `cube ${cell.recipe}` : 'plain filler cube'}`)
    rows.set(cell.row, row)
  }
  return [...rows].map(([row, cubes]) => `Row ${row + 1}: ${cubes.join('; ')}.`)
})
</script>

<template>
  <figure class="step-grid">
    <svg
      :viewBox="`-2 -2 ${width + 4} ${height + 4}`"
      :style="{ maxWidth: `${Math.max(grid.cols * 48, 220)}px` }"
      role="img"
      :aria-label="`Grid of ${grid.cols} by ${grid.rows} cubes`"
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
      </g>
    </svg>
    <figcaption>▼ {{ grid.bottomLabel }}</figcaption>
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
  font-size: 0.85rem;
  color: var(--ink-soft);
  font-weight: 600;
}
</style>
