<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BuildModel } from '../engine/model'
import { dominantColor, FACE_NORMALS, FACES, voxelKey, type Face } from '../engine/voxels'
import { ROLE } from '../lib/roles'

/** `roles` holds one ROLE value per voxel, in the same order as `model.voxels`. */
const props = defineProps<{ model: BuildModel; roles: Uint8Array }>()

const host = ref<HTMLDivElement>()

/** Corners of each face, counter-clockwise when seen from outside the cube. */
const CORNERS: Record<Face, [number, number, number][]> = {
  top: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  bottom: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  front: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  back: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
  left: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  right: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let content = new THREE.Group()
let resizeObserver: ResizeObserver | null = null

const render = () => renderer?.render(scene, camera)

function buildMeshes() {
  for (const child of content.children) {
    const obj = child as THREE.Mesh | THREE.LineSegments
    obj.geometry.dispose()
    ;(obj.material as THREE.Material).dispose()
  }
  scene.remove(content)
  content = new THREE.Group()

  const { voxels, palette } = props.model
  const roleAt = new Map<string, number>()
  voxels.forEach((v, i) => roleAt.set(voxelKey(v.x, v.y, v.z), props.roles[i]))

  const plain = new THREE.Color(getComputedStyle(host.value!).getPropertyValue('--plain-cube').trim() || '#d8c3a0')
  const paints = palette.map((p) => new THREE.Color(p.hex))

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

  const mesh = (data: (typeof layers)['opaque'], material: THREE.Material) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.nrm, 3))
    return new THREE.Mesh(geometry, material)
  }
  const lines = (pos: number[], material: THREE.LineBasicMaterial) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return new THREE.LineSegments(geometry, material)
  }

  content.add(
    mesh(layers.opaque, new THREE.MeshLambertMaterial({ vertexColors: true })),
    lines(solidEdges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })),
    lines(focusEdges, new THREE.LineBasicMaterial({ color: 0x000000 })),
  )
  const ghost = mesh(layers.ghost, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false }))
  ghost.renderOrder = 1
  content.add(ghost)
  scene.add(content)
  render()
}

function frameModel() {
  const { voxels } = props.model
  if (!voxels.length) return
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  for (const v of voxels) {
    min.min(new THREE.Vector3(v.x, v.y, v.z))
    max.max(new THREE.Vector3(v.x + 1, v.y + 1, v.z + 1))
  }
  const center = min.clone().add(max).multiplyScalar(0.5)
  const radius = max.distanceTo(min) / 2
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05
  const dir = {
    item: new THREE.Vector3(0.25, 0.15, 1),
    skin: new THREE.Vector3(0.6, 0.35, 1),
    block: new THREE.Vector3(0.75, 0.65, 1),
    plant: new THREE.Vector3(0.8, 0.45, 1),
  }[props.model.kind]
  camera.position.copy(center).add(dir.normalize().multiplyScalar(distance))
  camera.near = distance / 100
  camera.far = distance * 10
  camera.updateProjectionMatrix()
  controls.target.copy(center)
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
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  host.value!.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(0.6, 1, 0.8)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xffffff, 0.5)
  fill.position.set(-0.7, -0.2, -0.6)
  scene.add(fill)

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.addEventListener('change', render)
  // OrbitControls blocks all touch scrolling. Let vertical swipes scroll the page on phones;
  // sideways drags still rotate and pinches still zoom.
  renderer.domElement.style.touchAction = 'pan-y'

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host.value!)
  resize()
  frameModel()
  buildMeshes()
})

watch(() => props.model, () => {
  frameModel()
  buildMeshes()
})
watch(() => props.roles, buildMeshes)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  controls?.dispose()
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div ref="host" class="voxel-preview" title="Drag to rotate, scroll to zoom"></div>
</template>

<style scoped>
.voxel-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 280px;
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
