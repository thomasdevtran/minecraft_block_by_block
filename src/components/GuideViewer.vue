<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BuildModel } from '../engine/model'
import type { Guide, Recipe } from '../engine/steps'
import type { Face } from '../engine/voxels'
import { rolesForStep } from '../lib/roles'
import { readStored, writeStored } from '../lib/storage'
import StepGrid from './StepGrid.vue'
import VoxelPreview from './VoxelPreview.vue'

const props = defineProps<{ model: BuildModel; guide: Guide; storageKey: string }>()

/** 0 is the materials overview; step N is guide.steps[N - 1]. */
const index = ref(0)
const total = computed(() => props.guide.steps.length + 1)
const step = computed(() => (index.value === 0 ? null : props.guide.steps[index.value - 1]))
const roles = computed(() => rolesForStep(props.model, props.guide, step.value))
const recipesById = computed(() => new Map(props.guide.recipes.map((r) => [r.id, r])))

watch(
  () => props.storageKey,
  (key) => {
    index.value = Math.min(readStored(`progress:${key}`, 0), total.value - 1)
  },
  { immediate: true },
)
watch(index, (i) => writeStored(`progress:${props.storageKey}`, i))
watch(total, (t) => (index.value = Math.min(index.value, t - 1)))

const go = (delta: number) => (index.value = Math.max(0, Math.min(total.value - 1, index.value + delta)))

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
  if (e.key === 'ArrowRight') go(1)
  if (e.key === 'ArrowLeft') go(-1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const stageLabel = computed(() => {
  const s = step.value
  if (!s) return 'Materials'
  return s.kind === 'paint' ? 'Paint' : s.kind === 'build' ? 'Build' : 'Assemble'
})

const FACE_LABELS: [Face, string][] = [
  ['top', 'Top'],
  ['front', 'Front'],
  ['left', 'Left side'],
  ['right', 'Right side'],
  ['back', 'Back'],
  ['bottom', 'Bottom'],
]

function faceList(recipe: Recipe) {
  return FACE_LABELS.filter(([f]) => recipe.faces[f] !== undefined).map(([f, label]) => ({
    label,
    paint: props.model.palette[recipe.faces[f]!],
  }))
}

const paintRows = computed(() =>
  props.model.palette.map((p, i) => ({ ...p, ...props.guide.materials.perPaint[i] })),
)
const showFaces = computed(() => props.model.kind === 'skin')
</script>

<template>
  <section class="guide">
    <div
      class="progress"
      role="progressbar"
      aria-label="Build progress"
      :aria-valuenow="index"
      :aria-valuemin="0"
      :aria-valuemax="total - 1"
      :aria-valuetext="`Step ${index} of ${total - 1}`"
    >
      <div class="bar" :style="{ width: `${(index / (total - 1)) * 100}%` }"></div>
    </div>

    <div class="layout">
      <!-- Screen readers announce each new step as it appears. -->
      <div class="panel card" role="region" aria-label="Current step" aria-live="polite">
        <div class="step-meta">
          <span class="stage">{{ stageLabel }}</span>
          <span class="muted">Step {{ index }} of {{ total - 1 }}</span>
        </div>

        <!-- Materials overview -->
        <template v-if="!step">
          <h2>What you need</h2>
          <div class="totals">
            <div>
              <strong>{{ guide.materials.totalCubes.toLocaleString() }}</strong>
              <span>cubes</span>
            </div>
            <div>
              <strong>{{ model.palette.length }}</strong>
              <span>paint colors</span>
            </div>
            <div>
              <strong>{{ guide.recipes.length }}</strong>
              <span>cube types</span>
            </div>
          </div>
          <p v-if="guide.materials.plainCubes" class="muted">
            {{ guide.materials.plainCubes.toLocaleString() }} of the cubes are hidden inside and don't need paint.
          </p>
          <table class="paints">
            <thead>
              <tr>
                <th>Paint</th>
                <th class="num">Cubes</th>
                <th v-if="showFaces" class="num">Sides</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in paintRows" :key="p.id">
                <td>
                  <span class="swatch" :style="{ background: p.hex }"></span>
                  <strong>#{{ p.id }}</strong> {{ p.name }}
                  <code class="muted">{{ p.hex }}</code>
                </td>
                <td class="num">{{ p.cubes }}</td>
                <td v-if="showFaces" class="num">{{ p.faces }}</td>
              </tr>
            </tbody>
          </table>
          <p class="muted small">
            Hex codes come from the game's pixels, blended where close shades were merged into one paint. Screens and
            paint don't match exactly, so treat them as a starting point and pick the nearest paint you have.
          </p>
        </template>

        <!-- Paint steps -->
        <template v-else-if="step.kind === 'paint'">
          <h2>{{ step.title }}</h2>
          <p>{{ step.text }}</p>
          <ul class="recipes">
            <li v-for="id in step.recipes" :key="id">
              <span class="letter">{{ id }}</span>
              <span class="count">{{ recipesById.get(id)!.count }}×</span>
              <span class="faces">
                <template v-if="recipesById.get(id)!.uniform !== null">
                  <span class="chip">
                    <span class="swatch" :style="{ background: model.palette[recipesById.get(id)!.uniform!].hex }"></span>
                    All sides: #{{ model.palette[recipesById.get(id)!.uniform!].id }}
                    {{ model.palette[recipesById.get(id)!.uniform!].name }}
                  </span>
                </template>
                <template v-else>
                  <span v-for="f in faceList(recipesById.get(id)!)" :key="f.label" class="chip">
                    <span class="swatch" :style="{ background: f.paint.hex }"></span>
                    {{ f.label }}: #{{ f.paint.id }} {{ f.paint.name }}
                  </span>
                </template>
              </span>
            </li>
          </ul>
        </template>

        <!-- Build steps -->
        <template v-else-if="step.kind === 'build'">
          <h2>{{ step.title }}</h2>
          <p>{{ step.text }}</p>
          <StepGrid :grid="step.grid" :palette="model.palette" />
        </template>

        <!-- Assembly steps -->
        <template v-else>
          <h2>{{ step.title }}</h2>
          <p>{{ step.text }}</p>
        </template>

        <div class="nav">
          <button class="btn" :disabled="index === 0" @click="go(-1)">← Back</button>
          <button class="btn primary" :disabled="index === total - 1" @click="go(1)">
            {{ index === 0 ? 'Start' : 'Next' }} →
          </button>
        </div>
        <p v-if="index === total - 1" class="done">🎉 That's the last step. Nice build!</p>
      </div>

      <div class="preview card">
        <VoxelPreview :model="model" :roles="roles" />
        <span class="hint muted hint-desktop">Drag to rotate · scroll to zoom · ← → keys change steps</span>
        <span class="hint muted hint-touch">Swipe sideways to rotate · pinch to zoom</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.progress {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 16px;
}

.bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.step-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
  font-size: 0.9rem;
}

.stage {
  font: 700 0.8rem var(--pixel);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.2em 0.6em;
  border-radius: 999px;
  background: var(--accent-soft);
}

.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 1rem;
}

.totals div {
  background: var(--surface-2);
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
}

.totals strong {
  font: 700 1.6rem var(--pixel);
}

.totals span {
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.paints {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  margin-bottom: 0.6rem;
}

.paints th {
  text-align: left;
  font-size: 0.8rem;
  color: var(--ink-soft);
  font-weight: 600;
  border-bottom: 2px solid var(--line);
  padding: 0.3rem 0.25rem;
}

.paints td {
  border-bottom: 1px solid var(--line);
  padding: 0.4rem 0.25rem;
}

.paints code {
  font-size: 0.8rem;
  margin-left: 0.25rem;
}

.num {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}

.small {
  font-size: 0.85rem;
}

.recipes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recipes li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.letter {
  font: 800 1.05rem var(--sans);
  min-width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--ink);
  color: var(--bg);
  padding: 0 0.3rem;
}

.count {
  font: 700 1.1rem var(--pixel);
  min-width: 3rem;
  line-height: 2.2rem;
}

.faces {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding-top: 0.35rem;
  font-size: 0.9rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
}

.nav {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 1.25rem;
}

.nav .btn {
  flex: 1;
  padding: 0.9em;
  font-size: 1.05rem;
}

.done {
  margin: 0.8rem 0 0;
  text-align: center;
  font-weight: 600;
}

.preview {
  position: sticky;
  top: 16px;
  height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 860px) {
  .preview {
    position: static;
    height: 340px;
  }
}

.preview > :first-child {
  flex: 1;
}

.hint {
  font-size: 0.8rem;
  text-align: center;
  padding: 0.4rem;
}

.hint-touch {
  display: none;
}

@media (pointer: coarse) {
  .hint-desktop {
    display: none;
  }

  .hint-touch {
    display: block;
  }
}

@media (max-width: 640px) {
  .panel {
    padding: 14px;
  }

  .totals strong {
    font-size: 1.3rem;
  }

  .recipes li {
    flex-wrap: wrap;
  }
}
</style>
