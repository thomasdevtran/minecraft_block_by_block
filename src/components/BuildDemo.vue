<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BlockIcon from './BlockIcon.vue'
import ViewToggle from './ViewToggle.vue'
import type { BuildModel } from '../engine/model'
import type { Look } from '../lib/buildSettings'
import { assetUrl, blockUrl, textureUrl, type CatalogItem } from '../lib/catalog'
import { hasWebGL, useNearViewport } from '../lib/dom'
import { ROLE } from '../lib/guide'
import { starterPaintLimit } from '../lib/site'

/**
 * "How it works", shown rather than told: pick something and watch it come together out of
 * cubes from the bottom up, the order the guides build in. 3D uses the same model as the guide's
 * 3D build; 2D is the flat front view. Counts and colors are the real ones at the starter paint
 * limit, and the guide link carries the same settings, so the numbers match what the reader gets.
 */
const props = defineProps<{ items: CatalogItem[]; look: Look }>()
const router = useRouter()

// three.js is the site's largest chunk. It loads only for the 3D view, once the section is near.
const VoxelPreview = defineAsyncComponent(() => import('./VoxelPreview.vue'))

/**
 * The default skin, written by `npm run extract`. It isn't in the item catalog, but it shares the
 * catalog's cache-busting version like every other texture (the demo only renders once the
 * catalog has loaded).
 */
const STEVE_SKIN = assetUrl('textures/steve.png')
type Entry = { id: string; name: string; item?: CatalogItem }
const entries = computed<Entry[]>(() => [
  ...props.items.map((item) => ({ id: item.id, name: item.name, item })),
  { id: 'steve', name: 'Steve' },
])
const selectedId = ref(entries.value[0]?.id ?? 'steve')
watch(entries, (list) => {
  if (!list.some((entry) => entry.id === selectedId.value)) selectedId.value = list[0]?.id ?? 'steve'
})
const selected = computed(() => entries.value.find((entry) => entry.id === selectedId.value)!)

// --- 2D or 3D ----------------------------------------------------------------------------------

const VIEWS = [
  { value: '3d' as const, label: '3D' },
  { value: '2d' as const, label: '2D' },
]
const view = ref<'2d' | '3d'>('2d')
/** Probed only when the section comes near, like the guide's own preview. */
const webgl = ref(true)

/** Plain items (the axolotl bucket) only have a flat guide; in 3D they show that flat build. */
const has3dGuide = (entry: Entry) => !entry.item || !!(entry.item.block || entry.item.flower || entry.item.shape)
const shownView = computed(() => (webgl.value ? view.value : '2d'))

// --- Loading the model -------------------------------------------------------------------------

interface Demo { key: string; model: BuildModel }
const demo = shallowRef<Demo | null>(null)
const failed = ref(false)

const stage = ref<HTMLElement | null>(null)
// The engine and sprite load once the section is close to the screen…
const near = useNearViewport(stage, '200px')
// …but the build only plays once three-quarters of the stage is visible. It assembles from the
// bottom up, so starting while the stage's lower half was below the fold hid the best part.
const inView = useNearViewport(stage, '0px', 0.75)

const COLORS = { maxPaints: starterPaintLimit }
let request = 0
async function load(entry: Entry, mode: '2d' | '3d') {
  const token = ++request
  failed.value = false
  try {
    const [{ loadPixels }, { itemToModel }, { flowerToModel }, { blockToModel }, { skinFront, skinToModel }] = await Promise.all([
      import('../engine/pixels'), import('../engine/item'), import('../engine/flower'), import('../engine/block'), import('../engine/skin'),
    ])
    let model: BuildModel
    if (!entry.item) {
      const skin = await loadPixels(STEVE_SKIN)
      const options = { model: 'classic' as const, overlay: true, hollow: true, simplePaint: true, ...COLORS }
      model = mode === '3d' ? skinToModel(skin, options) : itemToModel(skinFront(skin, options), { ...COLORS, simplePaint: false })
    } else {
      const item = entry.item
      const sprite = await loadPixels(textureUrl(item, 'current'))
      if (mode === '3d' && item.flower) model = flowerToModel(sprite, { ...COLORS, simplePaint: true, pot: null })
      else if (mode === '3d' && item.block) model = blockToModel(await loadPixels(blockUrl(item, 'current')!), { ...COLORS, simplePaint: true, hollow: true })
      else model = itemToModel(sprite, { ...COLORS, simplePaint: false })
    }
    if (token !== request) return
    demo.value = { key: `${entry.id}:${mode}`, model }
    if (inView.value) await play()
    else stop(false)
  } catch {
    if (token === request) failed.value = true
  }
}

let probed = false
watch([near, selected, shownView], ([isNear, entry, mode]) => {
  if (!isNear) return
  if (mode === '3d' && !probed) {
    probed = true
    // No WebGL: shownView turns to 2D, and this watcher runs again to load the flat build.
    if (!hasWebGL()) return void (webgl.value = false)
  }
  void load(entry, mode)
}, { immediate: true })
watch(inView, (visible) => {
  if (visible && demo.value && !built.value) void play()
})

// --- The build animation -----------------------------------------------------------------------

/**
 * False keeps the build out of sight until the reader reaches it; true shows it. The motion itself
 * is VoxelPreview's drop-in intro (started by `intro`) for both styles, or CSS on the fallback board
 * when there's no 3D. Each drops a row or layer from one cube above, grows it from 60% and fades it
 * in, bottom first.
 */
const built = ref(false)
const intro = ref(0)
/** The build's extent in cubes, so empty rows and columns around a sprite are trimmed evenly. */
const bounds = computed(() => {
  const voxels = demo.value?.model.voxels ?? []
  const xs = voxels.map((v) => v.x)
  const ys = voxels.map((v) => v.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 }
})

function stop(done: boolean) {
  built.value = done
}

/** Restarts the build from an empty table. */
async function play() {
  stop(false)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return stop(true)
  // Both styles share the 3D viewer, so the flat build can be turned around too.
  if (webgl.value) {
    stop(true)
    intro.value++
    return
  }
  // No 3D: let the browser paint the empty board, then settle every cube row by row.
  await nextTick()
  requestAnimationFrame(() => requestAnimationFrame(() => (built.value = true)))
}

/** Every cube drawn once the build has played; none before, so the stage waits empty. */
const roles = computed(() => {
  const model = demo.value?.model
  if (!model) return new Uint8Array()
  return new Uint8Array(model.voxels.length).fill(built.value ? ROLE.solid : ROLE.hidden)
})

/** The fallback board for browsers without 3D: one cell per cube of the flat build, in its paint. */
const board = computed(() => {
  const model = demo.value?.model
  if (!model || webgl.value) return null
  const { minX, minY, width, height } = bounds.value
  return {
    width,
    height,
    cells: model.voxels.map((v) => ({ x: v.x - minX, y: v.y - minY, hex: model.palette[v.faces.front ?? 0]!.hex })),
  }
})

// --- Words and links -----------------------------------------------------------------------------

const ready = computed(() => demo.value?.key === `${selectedId.value}:${shownView.value}`)
const styleName = computed(() => {
  if (shownView.value === '2d') return 'flat'
  return has3dGuide(selected.value) ? '3D' : 'flat build'
})
const summary = computed(() => {
  const model = demo.value?.model
  if (!model || !ready.value) return ''
  return `${model.voxels.length.toLocaleString()} cubes and ${model.palette.length} paint colors`
})
const guideView = computed(() => (shownView.value === '3d' && has3dGuide(selected.value) ? '3d' : '2d'))
const guideQuery = computed(() => ({
  view: guideView.value, paints: String(starterPaintLimit), simple: '1', hollow: '1',
}))
const itemLink = computed(() => selected.value.item
  ? { path: `/item/${selected.value.id}`, query: { ...guideQuery.value, look: 'current' } }
  : null)
const skinLink = computed(() => ({ path: '/skin/guide', query: { ...guideQuery.value, overlay: '1', arm: 'classic' } }))

/**
 * Steve isn't a catalog item: his guide is the skin guide with the bundled skin loaded. This
 * replaces whatever skin was open on this device; progress on that skin stays saved under it.
 */
async function openSteve() {
  const [{ blobToDataUrl, setSkin }, { readSkinPng }] = await Promise.all([import('../lib/skinStore'), import('../engine/skin')])
  const blob = await readSkinPng(await (await fetch(STEVE_SKIN)).blob())
  setSkin({ dataUrl: await blobToDataUrl(blob), model: 'classic', label: 'Steve' })
  await router.push(skinLink.value)
}
</script>

<template>
  <section class="demo" aria-labelledby="demo-title">
    <div class="intro">
      <p class="eyebrow">How it works</p>
      <h2 id="demo-title">One pixel, one cube</h2>
    </div>

    <ol class="steps">
      <li>
        <span class="num" aria-hidden="true">01</span>
        <div>
          <strong>Pick your build</strong>
          <p>Choose a block, item, flower or player skin. Try one here:</p>
          <div class="picker" role="group" aria-label="Preview a build">
            <button
              v-for="entry in entries"
              :key="entry.id"
              type="button"
              :class="['pick', { active: entry.id === selectedId }]"
              :aria-pressed="entry.id === selectedId"
              @click="selectedId = entry.id"
            >
              <BlockIcon v-if="entry.item?.block" :src="blockUrl(entry.item, look)!" :size="16" />
              <img v-else-if="entry.item" :src="textureUrl(entry.item, look)" alt="" class="pixelated" width="24" height="24" />
              <span v-else class="face" :style="{ backgroundImage: `url(${STEVE_SKIN})` }"></span>
              {{ entry.name }}
            </button>
          </div>
        </div>
      </li>
      <li>
        <span class="num" aria-hidden="true">02</span>
        <div>
          <strong>Get your materials</strong>
          <!-- Polite, so choosing a build tells screen-reader users what it takes. -->
          <p aria-live="polite">{{ summary ? `${selected.name} (${styleName}): ${summary}.` : 'A cube count and a matching paint list.' }}</p>
          <ul v-if="summary" class="swatches" aria-hidden="true">
            <li v-for="paint in demo!.model.palette" :key="paint.id" :style="{ background: paint.hex }"></li>
          </ul>
        </div>
      </li>
      <li>
        <span class="num" aria-hidden="true">03</span>
        <div>
          <strong>Build at your pace</strong>
          <p>{{ shownView === '3d' && has3dGuide(selected) ? 'Stack one layer at a time' : 'Glue one row at a time' }}, from the bottom up. Your place is saved on this device.</p>
          <div class="actions">
            <RouterLink v-if="itemLink" :to="itemLink" class="btn primary">Open the {{ selected.name }} guide →</RouterLink>
            <a v-else :href="router.resolve(skinLink).href" class="btn primary" @click.prevent="openSteve">Open the Steve guide →</a>
            <button type="button" class="btn" :disabled="!ready" @click="play">Replay build</button>
          </div>
        </div>
      </li>
    </ol>

    <div class="viewer">
      <div class="viewer-head">
        <ViewToggle v-if="webgl" v-model="view" :options="VIEWS" label="Preview style" compact />
        <p v-else class="muted small">This browser can't show 3D, so here is the flat build.</p>
      </div>
      <div ref="stage" class="stage">
        <p v-if="failed" class="muted">The preview couldn't load. Every guide still works.</p>
        <template v-else-if="demo && ready">
          <div v-if="webgl" class="scene">
            <VoxelPreview
              :model="demo.model"
              :roles="roles"
              camera-controls="rotate"
              :intro="intro"
              :description="shownView === '2d' ? `${selected.name} laid out flat as ${summary}` : `${selected.name} built from ${summary}`"
            />
          </div>
          <div
            v-else-if="board"
            :class="['board', { built }]"
            :style="{ '--cols': board.width, '--rows': board.height }"
            role="img"
            :aria-label="`${selected.name} laid out flat as ${summary}`"
          >
            <span
              v-for="cell in board.cells"
              :key="`${demo.key}-${cell.x}-${cell.y}`"
              class="cube"
              :style="{ gridColumn: cell.x + 1, gridRow: board.height - cell.y, background: cell.hex, '--row': cell.y }"
            ></span>
          </div>
        </template>
        <p v-else class="muted">Loading preview…</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.demo {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  grid-template-areas: 'intro viewer' 'steps viewer';
  grid-template-rows: auto 1fr;
  column-gap: 40px;
  padding: 28px;
  margin: 0 0 44px;
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius);
}

.intro { grid-area: intro; }
.intro .eyebrow { margin-bottom: 8px; }
.intro h2 { margin-bottom: 20px; }
.steps { grid-area: steps; }
.viewer { grid-area: viewer; display: flex; flex-direction: column; gap: 10px; }

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 22px;
}

.steps > li {
  display: flex;
  gap: 14px;
}

.num {
  font: 700 1.3rem/1.2 var(--pixel);
  color: var(--accent);
  flex: none;
}

.steps strong { font-size: 1rem; }
.steps p { color: var(--ink-soft); font-size: 0.92rem; margin: 2px 0 10px; }

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 4px 12px 4px 6px;
  border: 2px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  font: 600 0.88rem var(--sans);
  cursor: pointer;
}

.pick:hover { border-color: var(--accent); }

.pick.active {
  background: var(--pressed-bg);
  border-color: var(--pressed-bg);
  color: var(--pressed-ink);
}

/* The sprite or cube icon sits on a small tile, so it stays readable on the green pressed fill. */
.pick img,
.pick :deep(.block-icon),
.face {
  background-color: var(--surface-2);
  border-radius: 6px;
}

/* Steve's face: the 8×8 front of the head at (8, 8) in the 64×64 skin, drawn 3× size. */
.face {
  width: 24px;
  height: 24px;
  flex: none;
  background-size: 192px 192px;
  background-position: -24px -24px;
  image-rendering: pixelated;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.swatches li {
  width: 22px;
  height: 22px;
  /* A faint edge so white or near-background paints (Steve's eyes) still show as a swatch. */
  box-shadow: inset 0 0 0 1px var(--swatch-edge);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.viewer-head {
  display: flex;
  justify-content: flex-end;
  min-height: 44px;
}

.small { font-size: 0.85rem; margin: 0; }

/* The stage is a little craft table: a dotted grid under the build. */
.stage {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 380px;
  border-radius: 8px;
  background:
    radial-gradient(circle, var(--line) 1.2px, transparent 1.4px) 0 0 / 20px 20px,
    var(--surface-2);
}

/* The 3D preview fills the stage; its two turn buttons sit along the bottom. */
.scene {
  align-self: stretch;
  justify-self: stretch;
  height: 380px;
}

.board {
  /* Tall builds (a whole player is 32 rows) shrink to keep the board inside the stage. */
  --cell: min(18px, calc(340px / var(--rows)));
  display: grid;
  grid-template-columns: repeat(var(--cols), var(--cell));
  grid-template-rows: repeat(var(--rows), var(--cell));
  gap: 2px;
  padding: 16px;
}

/* Each cube is one solid square of its paint color, like the game's own pixels. */
.cube {
  opacity: 0;
  transform: translateY(-18px) scale(0.6);
  transition:
    opacity 0.18s ease-out,
    transform 0.36s var(--ease-out);
  /* Bottom row first. The delay per row shrinks for tall builds, so any board settles in ~2s. */
  transition-delay: calc(var(--row) * min(85ms, 1800ms / var(--rows)));
}

.built .cube {
  opacity: 1;
  transform: none;
}

/* Arrive complete. The global rule shortens durations; the per-row delay needs switching off too. */
@media (prefers-reduced-motion: reduce) {
  .cube { transition-delay: 0s; }
}

@media (max-width: 860px) {
  .demo {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'intro' 'viewer' 'steps';
    grid-template-rows: auto;
    padding: 20px;
    row-gap: 20px;
  }
  .intro h2 { margin-bottom: 0; }
  .stage { min-height: 320px; }
  .scene { height: 320px; }
  /* Also fits the width: cells, gaps, board padding, card padding and page margins on 320px. */
  .board { --cell: min(18px, calc(280px / var(--rows)), calc((100vw - 140px) / var(--cols))); }
}
</style>
