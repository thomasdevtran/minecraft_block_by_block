<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import type { BuildModel } from '../engine/model'
import type { Guide } from '../engine/steps'
import { rolesForStep } from '../lib/guide'
import { finishedSize, useWakeLock } from '../lib/workbench'
import { CUBE_SIZE_LIMITS, cubeSize, isCubeSize, keepScreenOn, type LengthUnit } from '../lib/buildSettings'
import { readStored, rememberBuild, writeStored } from '../lib/storage'
import { hasWebGL, useNearViewport, whenIdle } from '../lib/dom'
import StepInstructions from './StepInstructions.vue'
import { showToast } from '../lib/toast'
import SaveBuild from './SaveBuild.vue'
import { RouterLink } from 'vue-router'

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
/** What window.print() lays out: the whole guide, or the tray label sheet. Null when not printing. */
const printMode = ref<'guide' | 'labels' | null>(null)
const shareUrl = ref('')
const stages = computed(() => [
  { label: 'Materials', index: 0 },
  ...(['paint', 'build', 'assemble'] as const).flatMap(kind => {
    const first = props.guide.steps.findIndex(s => s.kind === kind)
    return first < 0 ? [] : [{ label: { paint: 'Paint', build: 'Build', assemble: 'Assemble' }[kind], index: first + 1 }]
  }),
])
const currentStage = computed(() => stages.value.filter(s => s.index <= index.value).at(-1)?.label)
/**
 * The stage track: one segment per stage, sized by how many steps it holds, each filling as the
 * reader works through it. It replaces the separate stage buttons and progress bar, which showed
 * the same position twice in two different places.
 */
const segments = computed(() => stages.value.map((stage, i) => {
  const end = stages.value[i + 1]?.index ?? total.value
  const steps = end - stage.index
  return { ...stage, steps, fill: Math.min(1, Math.max(0, (index.value + 1 - stage.index) / steps)) }
}))

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

const STEP_MOTION_MS = 160
let resizeAnimation: Animation | undefined
let scrollFrame = 0
let navigation = 0
function stopScroll() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
}
function stopResize() {
  resizeAnimation?.cancel()
  resizeAnimation = undefined
  panel.value?.classList.remove('resizing')
}
function stopMotion() {
  stopScroll()
  stopResize()
}

async function jump(value: number) {
  const destination = Math.max(0, Math.min(total.value - 1, value))
  if (destination === index.value) return
  const currentNavigation = ++navigation
  // Read the visible height before cancelling, so rapid clicks continue from mid-animation.
  const previousHeight = panel.value?.getBoundingClientRect().height
  // On phones the preview sits under the steps. A reader watching it there sees the build change in
  // place, so the page keeps the preview exactly where it was instead of pulling them back up to the
  // step text, even when the new step is taller or shorter.
  const watching = watchingPreview()
  const previewTop = previewCard.value?.getBoundingClientRect().top ?? 0
  stopMotion()
  index.value = destination
  await nextTick()
  const card = panel.value
  if (!card || currentNavigation !== navigation) return
  if (watching) {
    window.scrollBy({ top: (previewCard.value?.getBoundingClientRect().top ?? previewTop) - previewTop, behavior: 'instant' })
    // Focus stays on the Next button just used (a heading off screen would hide it); the new step is
    // announced instead.
    announcement.value = `${position.value}: ${step.value ? step.value.title : 'What you need'}`
    return
  }
  announcement.value = ''
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const height = card.getBoundingClientRect().height
  if (!reduceMotion && previousHeight !== undefined && Math.abs(height - previousHeight) > 1) {
    card.classList.add('resizing')
    resizeAnimation = card.animate(
      [{ height: `${previousHeight}px` }, { height: `${height}px` }],
      { duration: STEP_MOTION_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    )
    resizeAnimation.onfinish = stopResize
  }
  const heading = card.querySelector<HTMLElement>(`[data-step="${index.value}"] h2`)
  heading?.focus({ preventScroll: true })
  const headingBounds = heading?.getBoundingClientRect()
  if (!headingBounds || (headingBounds.top >= 16 && headingBounds.bottom <= window.innerHeight - 100)) return

  const from = window.scrollY
  const to = Math.max(0, from + card.getBoundingClientRect().top - 16)
  if (reduceMotion) {
    window.scrollTo({ top: to, behavior: 'instant' })
    return
  }
  // A bounded scroll keeps long steps readable without the browser's longer smooth-scroll delay.
  const start = performance.now()
  const scroll = (now: number) => {
    const progress = Math.min(1, (now - start) / STEP_MOTION_MS)
    window.scrollTo({ top: from + (to - from) * (1 - (1 - progress) ** 3), behavior: 'instant' })
    scrollFrame = progress < 1 ? requestAnimationFrame(scroll) : 0
  }
  scrollFrame = requestAnimationFrame(scroll)
}
const go = (delta: number) => jump(index.value + delta)

/** Spoken only when a step change leaves focus where it was; see jump(). */
const announcement = ref('')
/** Phones only: at least half the preview on screen while the step heading has scrolled above it. */
function watchingPreview() {
  const card = previewCard.value
  if (!card || !window.matchMedia('(max-width: 860px)').matches) return false
  const heading = panel.value?.querySelector('h2')?.getBoundingClientRect()
  if (heading && heading.top >= 16) return false
  const bounds = card.getBoundingClientRect()
  const shown = Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0)
  return shown >= Math.min(bounds.height, window.innerHeight) / 2
}
/*
 * The print layouts load in the background once the guide is idle, so readers who never print
 * don't download them up front. They must be ready before the browser's own Print (Ctrl/Cmd+P):
 * beforeprint renders synchronously, with no time to fetch code.
 */
const guidePrint = shallowRef<Component | null>(null)
const loadGuidePrint = () => import('./GuidePrint.vue').then((module) => (guidePrint.value = module.default))
let cancelPrintPreload = () => {}
async function print(mode: 'guide' | 'labels') {
  await loadGuidePrint()
  printMode.value = mode
  await nextTick()
  window.print()
}
// The browser's own Print (Ctrl/Cmd+P) prints the whole guide.
function beforePrint() { printMode.value ??= 'guide' }
function afterPrint() { printMode.value = null }
onMounted(() => {
  cancelPrintPreload = whenIdle(() => void loadGuidePrint())
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)
  window.addEventListener('resize', stopMotion)
  window.addEventListener('wheel', stopScroll, { passive: true })
  window.addEventListener('touchstart', stopScroll, { passive: true })
})
onBeforeUnmount(() => {
  cancelPrintPreload()
  navigation++
  stopMotion()
  window.removeEventListener('beforeprint', beforePrint)
  window.removeEventListener('afterprint', afterPrint)
  window.removeEventListener('resize', stopMotion)
  window.removeEventListener('wheel', stopScroll)
  window.removeEventListener('touchstart', stopScroll)
})
watch(() => props.storageKey, () => { navigation++; stopMotion() })
// Finished size. The field keeps what the reader typed; the remembered cube size only changes
// when the text is a size in range, so a half-typed "1." never flashes a wrong result.
const size = computed(() => finishedSize(props.model, cubeSize.value))
const printedSize = computed(() =>
  `Finished size with ${cubeSize.value.value} ${cubeSize.value.unit} cubes: ${size.value.size} (${size.value.other}), ${size.value.axes}. Glue lines add a little.`)
const sizeDraft = ref(String(cubeSize.value.value))
const sizeInvalid = ref(false)
const sizeLimits = computed(() => CUBE_SIZE_LIMITS[cubeSize.value.unit])
function typeCubeSize(text: string) {
  sizeDraft.value = text
  const next = { value: Number(text.trim().replace(',', '.')), unit: cubeSize.value.unit }
  sizeInvalid.value = text.trim() !== '' && !isCubeSize(next)
  if (isCubeSize(next)) cubeSize.value = next
}
function settleCubeSize() {
  sizeDraft.value = String(cubeSize.value.value)
  sizeInvalid.value = false
}
/** Switching units converts the size, so the finished size stays the same until the reader edits it. */
function changeCubeUnit(unit: LengthUnit) {
  const { value, unit: from } = cubeSize.value
  if (unit === from) return
  const converted = Math.round((unit === 'in' ? value / 2.54 : value * 2.54) * 100) / 100
  const { min, max } = CUBE_SIZE_LIMITS[unit]
  cubeSize.value = { value: Math.min(max, Math.max(min, converted)), unit }
  settleCubeSize()
}

const { supported: canKeepAwake, enabled: keepAwake, toggle: toggleWakeLock } = useWakeLock(keepScreenOn)
async function toggleKeepAwake() {
  if (!(await toggleWakeLock())) showToast("This device didn't allow keeping the screen on. Battery saver can block it.", 'error')
}

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

// Ctrl/Cmd+P is left to the browser: beforeprint renders the full guide, and Vue's update runs as
// a microtask straight after that event, before the browser lays out the printed pages.
function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, select, textarea, button, a, summary, [tabindex]:not([tabindex="-1"])'))) return
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    go(e.key === 'ArrowRight' ? 1 : -1)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

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
/**
 * Read before the step heading, which takes focus on every step change. The position used to be
 * a separate polite live region, but focus moving in the same moment makes screen readers drop or
 * reorder that announcement; putting it in the focused heading gives one reliable read-out.
 */
const position = computed(() => (index.value === 0 ? 'Materials' : `Step ${index.value} of ${total.value - 1}`))
</script>

<template>
  <section class="guide">
    <div class="guide-bar card">
      <div class="track-head">
        <span id="stage-track-label" class="track-title">Your progress</span>
        <span
          class="track-count"
          role="progressbar"
          aria-label="Build progress"
          :aria-valuenow="index"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(1, total - 1)"
          :aria-valuetext="`Step ${index} of ${total - 1}`"
        >{{ index === 0 ? 'Not started' : `Step ${index} of ${total - 1}` }}</span>
      </div>
      <nav class="stage-track" aria-labelledby="stage-track-label">
        <button
          v-for="stage in segments"
          :key="stage.label"
          type="button"
          class="segment"
          :style="{ flexGrow: stage.steps }"
          :aria-current="currentStage === stage.label ? 'step' : undefined"
          @click="jump(stage.index)"
        >
          <span class="segment-name">{{ stage.label }}</span>
          <span class="segment-meter" aria-hidden="true"><span :style="{ transform: `scaleX(${stage.fill})` }"></span></span>
        </button>
      </nav>
      <div class="bar-row">
        <label class="step-picker"><span>Jump to</span>
          <select :value="index" @change="jump(Number(($event.target as HTMLSelectElement).value))">
            <option :value="0">Materials · What you need</option>
            <option v-for="(s, i) in guide.steps" :key="i" :value="i + 1">{{ i + 1 }}. {{ s.title }}</option>
          </select>
        </label>
        <div class="utility-actions">
          <button type="button" class="btn" @click="print('guide')">Print guide</button>
          <button type="button" class="btn" @click="shareBuild">{{ skinHash ? 'Copy skin link' : 'Copy link' }}</button>
          <!-- Shown only where the browser can keep the screen awake. A pressed switch keeps one label;
               the check mark and fill show its state, and screen readers hear "pressed". -->
          <button v-if="canKeepAwake" type="button" class="btn keep-awake" :aria-pressed="keepAwake" @click="toggleKeepAwake">
            <span class="check" aria-hidden="true">✓</span>Keep screen on
          </button>
        </div>
      </div>
      <label v-if="shareUrl" class="share-fallback">Copy this link <input readonly :value="shareUrl" @focus="($event.target as HTMLInputElement).select()" /></label>
    </div>
    <SaveBuild :title="title" :path="resumePath" :guide-key="storageKey" :step="index" :total="total - 1" :cubes="guide.materials.totalCubes" :paints="model.palette.length" :skin="!!skinHash" />

    <div class="layout">
      <div ref="panel" class="panel card" role="region" aria-label="Current step">
        <div class="step-meta">
          <span class="stage">{{ stageLabel }}</span>
          <span class="muted">{{ index === 0 ? 'Before you start' : `Step ${index} of ${total - 1}` }}</span>
        </div>

        <!-- Replace the content immediately; only the card's size and the new content's opacity
             ease into place. No leave transition or waiting before another Next click. -->
        <div :key="index" class="step-body" :data-step="index">
        <!-- Materials overview -->
        <template v-if="!step">
          <h2 tabindex="-1"><span class="visually-hidden">{{ position }}: </span>What you need</h2>
          <p>Gather your cubes, paint, brush and glue. Use labeled trays to keep each cube type together.</p>
          <p class="safety-note muted">Use equal-size craft cubes, suitable paint and glue. Small parts are a choking hazard; keep away from children under three. Children need adult supervision. <RouterLink to="/terms#safety">Build safely</RouterLink>.</p>
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
          <div class="finished-size">
            <div class="cube-size">
              <label for="cube-size">Your cube size</label>
              <input
                id="cube-size"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :value="sizeDraft"
                :aria-invalid="sizeInvalid"
                :aria-describedby="sizeInvalid ? 'cube-size-error' : undefined"
                @input="typeCubeSize(($event.target as HTMLInputElement).value)"
                @blur="settleCubeSize"
              />
              <select aria-label="Cube size unit" :value="cubeSize.unit" @change="changeCubeUnit(($event.target as HTMLSelectElement).value as LengthUnit)">
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
            <p v-if="sizeInvalid" id="cube-size-error" class="error small">Enter a size from {{ sizeLimits.min }} to {{ sizeLimits.max }} {{ cubeSize.unit }}.</p>
            <p class="size-result" aria-live="polite">
              <strong>Finished size: {{ size.size }}</strong> ({{ size.other }}), {{ size.axes }}.
            </p>
            <p class="muted small">That's {{ size.cubes }} cubes. Glue lines add a little.</p>
          </div>
          <p v-if="guide.materials.plainCubes" class="muted">
            {{ guide.materials.plainCubes.toLocaleString() }} {{ guide.materials.plainCubes === 1 ? "cube is hidden inside and doesn't" : "cubes are hidden inside and don't" }} need paint.
          </p>
          <p v-if="guide.materials.backingBoard">Gather a flat backing board and glue suitable for the board and cubes. The separate pieces attach to the board.</p>
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
          <div class="labels-cta">
            <p>Each cube type gets its own tray. Print a sheet of labels with each letter, paint and count.</p>
            <button type="button" class="btn" @click="print('labels')">Print tray labels</button>
          </div>
        </template>

        <StepInstructions v-else :step="step" :recipes="guide.recipes" :palette="model.palette" :position="position" />

        </div>

        <div class="nav desktop-nav">
          <button type="button" class="btn" :aria-disabled="index === 0" @click="go(-1)">← Back</button>
          <button type="button" class="btn primary" :aria-disabled="index === total - 1" @click="go(1)">
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
      <!-- aria-disabled rather than disabled: a disabled button drops keyboard focus to the top of
           the page, and on phones focus stays on these buttons after each step change. -->
      <button type="button" class="btn" :aria-disabled="index === 0" @click="go(-1)">← Back</button>
      <span aria-hidden="true">{{ index }} / {{ total - 1 }}</span>
      <span class="visually-hidden">{{ position }}</span>
      <button type="button" class="btn primary" :aria-disabled="index === total - 1" @click="go(1)">{{ index === 0 ? 'Start' : 'Next' }} →</button>
    </nav>
    <p class="visually-hidden" aria-live="polite">{{ announcement }}</p>
    <component :is="guidePrint" v-if="printMode && guidePrint" :mode="printMode" :title="title" :model="model" :guide="guide" :size="printedSize" />
  </section>
</template>

<style scoped>
/* One card holds where you are and what you can do: stage track, step picker, print and share. */
/* minmax(0, 1fr): a grid column otherwise grows to its widest child, which pushed the card past
   the screen edge on phones. */
.guide-bar { padding: 14px 16px 16px; margin-bottom: 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.track-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: .85rem; }
.track-title { font-weight: 700; }
.track-count { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.stage-track { display: flex; flex-wrap: wrap; gap: 6px; }
/* Grows with its share of the steps, but never narrower than its own label. */
.segment {
  flex: 1 1 auto;
  min-width: max-content;
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink-soft);
  font: 600 .85rem var(--sans);
  text-align: left;
  cursor: pointer;
}
.segment:hover { color: var(--ink); border-color: var(--field-line); }
.segment[aria-current] { background: var(--current-bg); color: var(--current-ink); border-color: var(--accent); }
.segment-meter { display: block; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
/* Scaled rather than resized, so stepping through the guide never triggers layout. */
.segment-meter > span { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-2) var(--ease-out); }
.bar-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.step-picker { display: flex; align-items: center; gap: 10px; font-size: .9rem; flex: 1 1 280px; min-width: 0; }
.step-picker > span { font-weight: 600; white-space: nowrap; }
.step-picker select { max-width: 100%; flex: 1; min-width: 0; }
.utility-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.utility-actions .btn { font-size: .85rem; padding: .55em .9em; }
.keep-awake .check { display: none; }
.keep-awake[aria-pressed="true"] { background: var(--pressed-bg); border-color: var(--pressed-bg); color: var(--pressed-ink); }
.keep-awake[aria-pressed="true"] .check { display: inline; }
.share-fallback { display: grid; gap: 8px; }
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
  .utility-actions { flex: 1 1 100%; }
  .utility-actions .btn { flex: 1; }
}
/* Four stage labels side by side on a 320px phone. */
@media (max-width: 420px) {
  .guide-bar { padding: 12px; }
  .segment { padding: 6px 8px; font-size: .8rem; }
}
.safety-note { font-size: 0.85rem; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
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
  min-height: 0;
}

/* Let the card resize without squeezing its contents or drawing them over the next section.
   Disable scroll anchoring here: jump() already keeps the new heading in view. */
.panel { overflow-anchor: none; }
.panel.resizing { overflow: clip; }
.panel > * { flex-shrink: 0; }

/* Flex, not block, so the headings and paragraphs inside keep the same non-collapsing margins
   they had as direct children of .panel. */
.step-body {
  display: flex;
  flex-direction: column;
  animation: step-appear var(--dur-1) var(--ease-out);
}

/* A keyed element replaces the old body synchronously, so height measurement never includes
   both steps. CSS animation keeps the quick fade without delaying Vue's removal. */
@keyframes step-appear {
  from { opacity: 0; }
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

/* The reader's cube size and what it makes: sits under the totals, before the paint list. */
.labels-cta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-top: 1rem; padding: 12px 14px; background: var(--surface-2); border-radius: 8px; }
.labels-cta p { margin: 0; flex: 1 1 16rem; font-size: .9rem; }
.finished-size { padding: 12px 14px; margin-bottom: 1rem; border: 1px solid var(--line); border-radius: 8px; }
.finished-size p { margin: 0; }
.finished-size p + p { margin-top: 4px; }
.cube-size { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.cube-size label { font-weight: 600; margin-right: 4px; }
.cube-size input { width: 5.5em; }
.cube-size select { width: auto; }

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

/* Back and Next stay at the bottom of the screen while a tall step scrolls under them, so the
   button a builder is about to press never moves away from the pointer. The negative side margins
   let the bar's background span the card's full width. */
@media (min-width: 861px) {
  .desktop-nav {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin-inline: -20px;
    padding: 12px 20px;
    background: var(--surface);
    box-shadow: 0 -1px 0 var(--line);
  }
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
