<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BuildModel } from '../engine/model'
import type { Guide } from '../engine/steps'
import { rolesForStep } from '../lib/roles'
import { readStored, writeStored } from '../lib/storage'
import { useNearViewport } from '../lib/visibility'
import StepInstructions from './StepInstructions.vue'
import GuidePrint from './GuidePrint.vue'
import { rememberBuild } from '../lib/recentBuild'
import { showToast } from '../lib/toast'

// three.js is ~570 KB, far bigger than the rest of the site put together. Loading it lazily lets
// the written steps — which are the actual instructions — paint without waiting for the 3D.
const VoxelPreview = defineAsyncComponent(() => import('./VoxelPreview.vue'))

const props = defineProps<{ model: BuildModel; guide: Guide; storageKey: string; title: string; resumePath: string; skinHash?: string }>()

/** 0 is the materials overview; step N is guide.steps[N - 1]. */
const index = ref(0)
const total = computed(() => props.guide.steps.length + 1)
const step = computed(() => (index.value === 0 ? null : props.guide.steps[index.value - 1]))
const roles = computed(() => rolesForStep(props.model, props.guide, step.value))
const panel = ref<HTMLElement | null>(null)
const printing = ref(false)
const shareUrl = ref('')
const stages = computed(() => [
  { label: 'Materials', index: 0 },
  ...(['paint', 'build', 'assemble'] as const).flatMap(kind => {
    const first = props.guide.steps.findIndex(s => s.kind === kind)
    return first < 0 ? [] : [{ label: { paint: 'Paint', build: 'Build', assemble: 'Assemble' }[kind], index: first + 1 }]
  }),
])
const currentStage = computed(() => stages.value.filter(s => s.index <= index.value).at(-1)?.label)

watch(
  () => props.storageKey,
  (key) => {
    const saved = readStored<unknown>(`progress:${key}`, 0)
    index.value = typeof saved === 'number' && Number.isInteger(saved) ? Math.max(0, Math.min(saved, total.value - 1)) : 0
  },
  { immediate: true },
)
watch(index, (i) => {
  writeStored(`progress:${props.storageKey}`, i)
  rememberBuild({ title: props.title, path: props.resumePath, step: i, total: total.value - 1, skinHash: props.skinHash })
})
watch(total, (t) => (index.value = Math.min(index.value, t - 1)))

async function jump(value: number) {
  index.value = Math.max(0, Math.min(total.value - 1, value))
  await nextTick()
  panel.value?.querySelector<HTMLElement>(`[data-step="${index.value}"] h2`)?.focus({ preventScroll: true })
  panel.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
const go = (delta: number) => jump(index.value + delta)
async function printGuide() {
  printing.value = true
  await nextTick()
  window.print()
}
function beforePrint() { printing.value = true }
function afterPrint() { printing.value = false }
onMounted(() => {
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', beforePrint)
  window.removeEventListener('afterprint', afterPrint)
})
async function shareBuild() {
  const path = props.skinHash ? '/skin' : props.resumePath
  const url = new URL(path, window.location.origin).href
  try {
    await navigator.clipboard.writeText(url)
    showToast(props.skinHash ? 'Skin builder link copied. Your uploaded skin stays on this device.' : 'Build link copied, including your build settings.')
  } catch {
    shareUrl.value = url
  }
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    void printGuide()
    return
  }
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, select, textarea, button, a, summary, [tabindex]:not([tabindex="-1"])'))) return
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    go(e.key === 'ArrowRight' ? 1 : -1)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/**
 * Some browsers and older phones have no usable WebGL. The written steps still work without it.
 * The probe creates a real GPU context, so it releases it straight away — browsers only allow a
 * handful at once, and a leaked one here would eventually starve the actual preview.
 */
function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

const previewCard = ref<HTMLElement | null>(null)
// On wide screens the card is already on screen, so this resolves straight after the first paint.
// On phones the preview sits below the steps, so three.js waits until it is scrolled towards.
const previewNear = useNearViewport(previewCard, '200px')
/** Probed only once the reader is heading for the preview, so it never runs on pages that scroll past. */
const webglOk = ref(true)
watch(previewNear, (near) => near && (webglOk.value = hasWebGL()), { immediate: true })
const showPreview = computed(() => previewNear.value && webglOk.value)

const stageLabel = computed(() => {
  const s = step.value
  if (!s) return 'Materials'
  return s.kind === 'paint' ? 'Paint' : s.kind === 'build' ? 'Build' : 'Assemble'
})

const paintRows = computed(() =>
  props.model.palette.map((p, i) => ({ ...p, ...props.guide.materials.perPaint[i] })),
)
const showFaces = computed(() => props.model.kind === 'skin')
</script>

<template>
  <section class="guide">
    <div class="guide-tools">
      <nav class="stages" aria-label="Build stages">
        <button v-for="stage in stages" :key="stage.label" class="stage-button" :aria-current="currentStage === stage.label ? 'step' : undefined" @click="jump(stage.index)">{{ stage.label }}</button>
      </nav>
      <div class="utility-actions">
        <button class="btn" @click="printGuide">Print full guide</button>
        <button class="btn" @click="shareBuild">{{ skinHash ? 'Copy skin builder link' : 'Copy build link' }}</button>
      </div>
    </div>
    <label v-if="shareUrl" class="share-fallback">Copy this link <input readonly :value="shareUrl" @focus="($event.target as HTMLInputElement).select()" /></label>
    <label class="step-picker">Jump to a step
      <select :value="index" @change="jump(Number(($event.target as HTMLSelectElement).value))">
        <option :value="0">Materials · What you need</option>
        <option v-for="(s, i) in guide.steps" :key="i" :value="i + 1">{{ i + 1 }}. {{ s.title }}</option>
      </select>
    </label>
    <div
      class="progress"
      role="progressbar"
      aria-label="Build progress"
      :aria-valuenow="index"
      :aria-valuemin="0"
      :aria-valuemax="Math.max(1, total - 1)"
      :aria-valuetext="`Step ${index} of ${total - 1}`"
    >
      <div class="bar" :style="{ transform: `scaleX(${index / Math.max(1, total - 1)})` }"></div>
    </div>

    <div class="layout">
      <div ref="panel" class="panel card" role="region" aria-label="Current step">
        <div class="step-meta" role="status" aria-atomic="true">
          <span class="stage">{{ stageLabel }}</span>
          <span class="muted">{{ index === 0 ? 'Before you start' : `Step ${index} of ${total - 1}` }}</span>
        </div>

        <!-- Fades each step in. Enter-only, with no `mode="out-in"`: that holds the old step on
             screen for the whole leave transition, which would add its duration to every Next
             click — the one interaction on this page that has to stay instant. Height changes
             here follow a click, so they're excluded from the layout-shift score. -->
        <Transition name="step">
        <div :key="index" class="step-body" :data-step="index">
        <!-- Materials overview -->
        <template v-if="!step">
          <h2 tabindex="-1">What you need</h2>
          <p>Gather your cubes, paint, brush and glue. Use labeled trays to keep each cube type together.</p>
          <p class="safety-note muted">Use equal-size craft cubes, suitable paint and glue. Small parts are a choking hazard; keep away from children under three. Children need adult supervision. <a href="/terms#safety">Build safely</a>.</p>
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
            <caption class="visually-hidden">Paint colors and cube quantities for this build</caption>
            <thead>
              <tr>
                <th scope="col">Paint</th>
                <th scope="col" class="num">Cubes</th>
                <th v-if="showFaces" scope="col" class="num">Sides</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in paintRows" :key="p.id">
                <td>
                  <span class="swatch" aria-hidden="true" :style="{ background: p.hex }"></span>
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

        <StepInstructions v-else :step="step" :recipes="guide.recipes" :palette="model.palette" />

        </div>
        </Transition>

        <div class="nav desktop-nav">
          <button class="btn" :disabled="index === 0" @click="go(-1)">← Back</button>
          <button class="btn primary" :disabled="index === total - 1" @click="go(1)">
            {{ index === 0 ? 'Start painting' : 'Next step' }} →
          </button>
        </div>
        <div v-if="index === total - 1" class="finish-card">
          <h2>You made it, one cube at a time.</h2>
          <p>Let the glue dry, then find a spot for your build. Share the guide so a friend can try it too.</p>
          <button class="btn primary" @click="shareBuild">{{ skinHash ? 'Share the skin builder' : 'Share this build' }}</button>
        </div>
      </div>

      <div ref="previewCard" class="preview card">
        <p class="preview-title">{{ step ? 'Your build so far' : 'The finished build' }}</p>
        <!-- The stage always exists and always fills the card, so the message, the gap while the
             3D chunk downloads, and the finished canvas all occupy the same box. Without it the
             card collapses for those few hundred milliseconds and the hint below jumps twice. -->
        <div class="preview-stage">
          <VoxelPreview v-if="showPreview" :model="model" :roles="roles" :description="`${title}: ${step ? step.title : 'finished build'}. Exact cube positions are available in the written instructions.`" />
          <p v-else class="preview-placeholder muted">
            {{ webglOk ? 'Loading 3D preview…' : "This browser can't show the 3D preview. Every cube is written out in the steps." }}
          </p>
        </div>
        <span class="hint muted hint-desktop">Drag to rotate · scroll to zoom · ← → keys change steps</span>
        <span class="hint muted hint-touch">Swipe sideways to rotate · pinch to zoom</span>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Step navigation">
      <button class="btn" :disabled="index === 0" @click="go(-1)">← Back</button>
      <span>{{ index }} / {{ total - 1 }}</span>
      <button class="btn primary" :disabled="index === total - 1" @click="go(1)">{{ index === 0 ? 'Start' : 'Next' }} →</button>
    </nav>
    <GuidePrint v-if="printing" :title="title" :model="model" :guide="guide" />
  </section>
</template>

<style scoped>
.guide-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.stages, .utility-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.stage-button { border: 1px solid var(--line); background: var(--surface); color: var(--ink-soft); border-radius: 6px; padding: 10px 14px; min-height: 44px; cursor: pointer; font-weight: 600; }
.stage-button[aria-current] { background: var(--accent-soft); color: var(--ink); border-color: var(--accent); }
.utility-actions .btn { font-size: .85rem; }
.step-picker { display: flex; align-items: center; gap: 12px; font-size: .9rem; margin-bottom: 16px; }
.step-picker select { min-width: 0; max-width: 100%; flex: 1; padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); }
.share-fallback { display: grid; gap: 8px; margin-bottom: 16px; }
.panel { scroll-margin-top: 16px; }
.panel h2 { font-family: var(--sans); letter-spacing: 0; }
.mobile-nav { display: none; }
.preview-title { margin: 0; padding: 14px 16px 0; font-weight: 600; font-size: .9rem; }
.finish-card { border-top: 1px solid var(--line); padding-top: 20px; margin-top: 20px; }
.finish-card h2 { font-size: 1.2rem; line-height: 1.4; }
@media (max-width: 860px) {
  .guide { padding-bottom: 85px; }
  .desktop-nav { display: none !important; }
  .mobile-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 30; align-items: center; gap: 12px; background: var(--surface); border-top: 1px solid var(--line); padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
  .mobile-nav .btn { flex: 1; }
  .mobile-nav span { font-size: .8rem; white-space: nowrap; }
  .step-picker { flex-direction: column; align-items: stretch; gap: 6px; }
}
.safety-note { font-size: 0.85rem; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.progress {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 16px;
}

/* Scaled rather than resized: animating `width` is a layout change on every step, animating
   `transform` is not. Starts full width and shrinks to the current fraction from the left. */
.bar {
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform var(--dur-2) var(--ease-out);
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

/* Flex, not block, so the headings and paragraphs inside keep the same non-collapsing margins
   they had as direct children of .panel. */
.step-body {
  display: flex;
  flex-direction: column;
}

/* Enter only. With no leave transition defined the outgoing step is removed immediately, so the
   new one is never waiting behind it and the two never overlap in the layout. */
.step-enter-active {
  transition: opacity var(--dur-1) var(--ease-out);
}

.step-enter-from {
  opacity: 0;
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
  font: 700 1.6rem var(--sans);
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

.preview {
  position: sticky;
  top: 16px;
  height: var(--guide-h);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* The height itself comes from --guide-h, which shrinks at this same breakpoint in style.css. */
@media (max-width: 860px) {
  .preview {
    position: static;
  }
}

.preview-stage {
  flex: 1;
  position: relative;
  min-height: 0;
}

/* Overlaid rather than in flow, so swapping it for the canvas can't move anything. */
.preview-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 1rem;
  text-align: center;
  font-size: 0.9rem;
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

}
</style>
