<script setup lang="ts">
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BuildModel } from '../engine/model'
import { dominantColor, FACE_NORMALS, FACES, voxelKey, type Face } from '../engine/voxels'
import { ROLE } from '../lib/guide'

/** `roles` holds one ROLE value per voxel, in the same order as `model.voxels`. */
/**
 * `intro`: change this number to play the drop-in build (each layer falls into place, grows and
 * fades in, bottom first: the 3D twin of the homepage's 2D board). 0 never plays.
 * `cameraControls`: 'full' is the guide's preview (drag, scroll to zoom, seven camera buttons). 'rotate'
 * is for previews inside a scrolling page: no wheel or pinch zoom, which would trap the page's
 * scrolling, and only the two turn buttons.
 */
const props = withDefaults(
  defineProps<{ model: BuildModel; roles: Uint8Array; description: string; cameraControls?: 'full' | 'rotate'; intro?: number }>(),
  { cameraControls: 'full', intro: 0 },
)

const host = ref<HTMLDivElement>()
const failed = ref(false)

/** Corners of each face, counter-clockwise when seen from outside the cube. */
const CORNERS: Record<Face, [number, number, number][]> = {
  top: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  bottom: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  front: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  back: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  left: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  right: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
}

let renderer: WebGLRenderer | null = null
let scene: Scene
let camera: PerspectiveCamera
let controls: OrbitControls
let content = new Group()
let resizeObserver: ResizeObserver | null = null

const render = () => renderer?.render(scene, camera)

type FaceData = { pos: number[]; col: number[]; nrm: number[] }

function faceMesh(data: FaceData, material: Material) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(data.pos, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(data.col, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(data.nrm, 3))
  return new Mesh(geometry, material)
}

function edgeLines(pos: number[], material: LineBasicMaterial) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return new LineSegments(geometry, material)
}

/** Frees everything drawn so far; the intro nests meshes in groups, so this walks the whole tree. */
function disposeContent() {
  content.traverse((object) => {
    const mesh = object as Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => material?.dispose())
  })
  scene?.remove(content)
  content = new Group()
}

function buildMeshes() {
  if (!renderer || introFrame) return
  disposeContent()

  const { voxels, palette } = props.model
  const roleAt = new Map<string, number>()
  voxels.forEach((v, i) => roleAt.set(voxelKey(v.x, v.y, v.z), props.roles[i]))

  const plain = new Color(getComputedStyle(host.value!).getPropertyValue('--plain-cube').trim() || '#d8c3a0')
  const paints = palette.map((p) => new Color(p.hex))

  const layers = {
    opaque: { pos: [] as number[], col: [] as number[], nrm: [] as number[] },
    ghost: { pos: [] as number[], col: [] as number[], nrm: [] as number[] },
  }
  const focusEdges: number[] = []
  const solidEdges: number[] = []

  voxels.forEach((v, i) => {
    const role = props.roles[i]
    if (role === ROLE.hidden) return
    const target = role === ROLE.ghost ? layers.ghost : layers.opaque
    const edges = role === ROLE.focus ? focusEdges : role === ROLE.solid ? solidEdges : null
    // Faces covered in the finished build can show mid-build; tint them with the cube's main paint.
    const main = dominantColor(v.faces)
    for (const face of FACES) {
      const [dx, dy, dz] = FACE_NORMALS[face]
      const neighbor = roleAt.get(voxelKey(v.x + dx, v.y + dy, v.z + dz)) ?? ROLE.hidden
      // Skip faces pressed against a cube that is drawn at least as solidly.
      if (neighbor >= ROLE.solid || (role === ROLE.ghost && neighbor >= ROLE.ghost)) continue
      const paint = v.faces[face] ?? main
      const color = paint === null ? plain : paints[paint]
      const quad = CORNERS[face].map(([cx, cy, cz]) => [v.x + cx, v.y + cy, v.z + cz])
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        target.pos.push(...quad[idx])
        target.col.push(color.r, color.g, color.b)
        target.nrm.push(dx, dy, dz)
      }
      if (edges) {
        for (let k = 0; k < 4; k++) edges.push(...quad[k], ...quad[(k + 1) % 4])
      }
    }
  })

  content.add(
    faceMesh(layers.opaque, new MeshLambertMaterial({ vertexColors: true })),
    edgeLines(solidEdges, new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: SOLID_EDGE_OPACITY })),
    edgeLines(focusEdges, new LineBasicMaterial({ color: 0x000000 })),
  )
  // Ghosted cubes stay readable enough to give the highlighted ones context instead of leaving them floating.
  const ghost = faceMesh(layers.ghost, new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }))
  ghost.renderOrder = 1
  content.add(ghost)
  scene.add(content)
  render()
}

const SOLID_EDGE_OPACITY = 0.18
/** The intro's timing copies the 2D board's CSS: drop 360ms with the site's ease-out, fade 180ms. */
const INTRO = { drop: 1, startScale: 0.6, moveMs: 360, fadeMs: 180, maxStaggerMs: 85, totalStaggerMs: 1800 }
let introFrame = 0

function stopIntro() {
  cancelAnimationFrame(introFrame)
  introFrame = 0
}

/**
 * The drop-in build. Each layer becomes its own group, so it can fall from one cube above, grow
 * from 60% and fade in on its own clock, bottom layer first. When the last one lands, the normal
 * single-mesh build replaces them for rotating. Faces against cubes in the same layer or below are
 * skipped as usual; top faces always draw, because the layer above isn't there yet.
 */
function playIntro() {
  if (!renderer) return
  stopIntro()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return buildMeshes()
  disposeContent()

  const { voxels, palette } = props.model
  const occupied = new Set(voxels.map((v) => voxelKey(v.x, v.y, v.z)))
  const plain = new Color(getComputedStyle(host.value!).getPropertyValue('--plain-cube').trim() || '#d8c3a0')
  const paints = palette.map((p) => new Color(p.hex))
  const byLayer = new Map<number, typeof voxels>()
  for (const v of voxels) byLayer.set(v.y, [...(byLayer.get(v.y) ?? []), v])
  const heights = [...byLayer.keys()].sort((a, b) => a - b)
  const stagger = Math.min(INTRO.maxStaggerMs, INTRO.totalStaggerMs / heights.length)

  const layers = heights.map((y, i) => {
    const cubes = byLayer.get(y)!
    // Each layer grows around its own middle, as each 2D row scales around its cells.
    const center = new Vector3(
      cubes.reduce((sum, v) => sum + v.x + 0.5, 0) / cubes.length,
      y + 0.5,
      cubes.reduce((sum, v) => sum + v.z + 0.5, 0) / cubes.length,
    )
    const faces: FaceData = { pos: [], col: [], nrm: [] }
    const edges: number[] = []
    for (const v of cubes) {
      const main = dominantColor(v.faces)
      for (const face of FACES) {
        const [dx, dy, dz] = FACE_NORMALS[face]
        if (dy <= 0 && occupied.has(voxelKey(v.x + dx, v.y + dy, v.z + dz))) continue
        const paint = v.faces[face] ?? main
        const color = paint === null ? plain : paints[paint]
        const quad = CORNERS[face].map(([cx, cy, cz]) => [v.x + cx - center.x, v.y + cy - center.y, v.z + cz - center.z])
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          faces.pos.push(...quad[idx])
          faces.col.push(color.r, color.g, color.b)
          faces.nrm.push(dx, dy, dz)
        }
        for (let k = 0; k < 4; k++) edges.push(...quad[k], ...quad[(k + 1) % 4])
      }
    }
    const fill = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0 })
    const outline = new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 })
    const group = new Group()
    group.add(faceMesh(faces, fill), edgeLines(edges, outline))
    group.visible = false
    content.add(group)
    return { group, fill, outline, center, delay: i * stagger }
  })
  scene.add(content)

  const start = performance.now()
  const step = (now: number) => {
    let settled = true
    for (const layer of layers) {
      const elapsed = now - start - layer.delay
      const move = Math.min(1, Math.max(0, elapsed / INTRO.moveMs))
      const fade = Math.min(1, Math.max(0, elapsed / INTRO.fadeMs))
      if (move < 1) settled = false
      const eased = 1 - (1 - move) ** 3
      layer.group.visible = elapsed > 0
      layer.group.position.set(layer.center.x, layer.center.y + (1 - eased) * INTRO.drop, layer.center.z)
      layer.group.scale.setScalar(INTRO.startScale + (1 - INTRO.startScale) * eased)
      layer.fill.opacity = fade
      layer.outline.opacity = fade * SOLID_EDGE_OPACITY
    }
    render()
    if (!settled) {
      introFrame = requestAnimationFrame(step)
      return
    }
    introFrame = 0
    buildMeshes()
  }
  introFrame = requestAnimationFrame(step)
}

function frameModel() {
  const { voxels } = props.model
  if (!voxels.length) return
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const v of voxels) {
    min.min(new Vector3(v.x, v.y, v.z))
    max.max(new Vector3(v.x + 1, v.y + 1, v.z + 1))
  }
  const center = min.clone().add(max).multiplyScalar(0.5)
  const radius = max.distanceTo(min) / 2
  const distance = radius / Math.sin(((camera.fov / 2) * Math.PI) / 180) * 1.05
  const dir = {
    item: new Vector3(0.25, 0.15, 1),
    skin: new Vector3(0.6, 0.35, 1),
    block: new Vector3(0.75, 0.65, 1),
    plant: new Vector3(0.8, 0.45, 1),
    object: new Vector3(0.65, 0.45, 1),
  }[props.model.kind]
  camera.position.copy(center).add(dir.normalize().multiplyScalar(distance))
  camera.near = distance / 100
  camera.far = distance * 10
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.minDistance = distance * 0.2
  controls.maxDistance = distance * 5
  controls.update()
}

/** Button controls provide the same camera actions without requiring a drag or pinch. */
function moveCamera(turn = 0, tilt = 0, zoom = 1) {
  if (!renderer) return
  const offset = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
  offset.theta += turn
  offset.phi = Math.max(0.1, Math.min(Math.PI - 0.1, offset.phi + tilt))
  offset.radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.radius * zoom))
  camera.position.copy(controls.target).add(new Vector3().setFromSpherical(offset))
  controls.update()
}

function resize() {
  if (!renderer || !host.value) return
  const { clientWidth: w, clientHeight: h } = host.value
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
  render()
}

onMounted(() => {
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }) }
  catch { failed.value = true; return }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.value!.appendChild(renderer.domElement)

  scene = new Scene()
  scene.add(new AmbientLight(0xffffff, 1.6))
  const sun = new DirectionalLight(0xffffff, 1.6)
  sun.position.set(0.6, 1, 0.8)
  scene.add(sun)
  const fill = new DirectionalLight(0xffffff, 0.5)
  fill.position.set(-0.7, -0.2, -0.6)
  scene.add(fill)

  camera = new PerspectiveCamera(35, 1, 0.1, 1000)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.addEventListener('change', render)
  if (props.cameraControls === 'rotate') {
    controls.enableZoom = false
    controls.enablePan = false
  }
  // OrbitControls blocks all touch scrolling. Let vertical swipes scroll the page on phones;
  // sideways drags still rotate and pinches still zoom.
  renderer.domElement.style.touchAction = 'pan-y'

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host.value!)
  resize()
  frameModel()
  if (props.intro) playIntro()
  else buildMeshes()
})

watch(() => props.model, () => {
  if (!renderer) return
  stopIntro()
  frameModel()
  buildMeshes()
})

watch(() => props.intro, (token) => {
  if (token) playIntro()
})

// Rebuilding every cube is the most expensive thing this component does, and it used to run inside
// the Next/Back click. Two frames later the written step has already painted, so the click stays
// snappy and the 3D catches up. Holding only the newest request keeps fast clicking cheap.
let queuedBuild = 0
watch(() => props.roles, () => {
  cancelAnimationFrame(queuedBuild)
  queuedBuild = requestAnimationFrame(() => {
    queuedBuild = requestAnimationFrame(buildMeshes)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(queuedBuild)
  stopIntro()
  resizeObserver?.disconnect()
  controls?.dispose()
  disposeContent()
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div class="preview-widget">
  <div
    v-show="!failed"
    ref="host"
    class="voxel-preview"
    role="img"
    :aria-label="`3D preview. ${description}`"
    :title="cameraControls === 'full' ? 'Drag to rotate, scroll to zoom' : 'Drag to rotate'"
  ></div>
  <p v-if="failed" class="preview-error muted" role="status">The 3D preview could not start. You can still follow every written step.</p>
  <div v-else class="camera-controls" role="group" aria-label="3D camera controls">
    <button type="button" aria-label="Rotate preview left" @click="moveCamera(-Math.PI / 8)">↶ Left</button>
    <button type="button" aria-label="Rotate preview right" @click="moveCamera(Math.PI / 8)">Right ↷</button>
    <template v-if="cameraControls === 'full'">
      <button type="button" aria-label="Tilt preview up" @click="moveCamera(0, -Math.PI / 12)">↑ Up</button>
      <button type="button" aria-label="Tilt preview down" @click="moveCamera(0, Math.PI / 12)">↓ Down</button>
      <button type="button" aria-label="Zoom preview in" @click="moveCamera(0, 0, 0.8)">+ Zoom in</button>
      <button type="button" aria-label="Zoom preview out" @click="moveCamera(0, 0, 1.25)">− Zoom out</button>
      <button type="button" aria-label="Reset preview view" @click="frameModel">Reset</button>
    </template>
  </div>
  </div>
</template>

<style scoped>
.preview-error { padding: 24px; text-align: center; }
.preview-widget { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.camera-controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; padding: 8px; }
.camera-controls button { min-height: 44px; padding: 6px 10px; font-size: .8rem; background: var(--surface); color: var(--ink); border: 1px solid var(--ink-soft); border-radius: 6px; cursor: pointer; }
.camera-controls button:hover { background: var(--surface-2); }
.voxel-preview {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 140px;
  touch-action: pan-y;
}

.voxel-preview :deep(canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
}
</style>
