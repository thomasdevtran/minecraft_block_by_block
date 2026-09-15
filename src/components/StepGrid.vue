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
</template>

<style scoped>
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
