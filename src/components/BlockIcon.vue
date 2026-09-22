<script setup lang="ts">
import { computed } from 'vue'
import { BLOCK_STRIP_ORDER } from '../engine/block'
import type { Face } from '../engine/voxels'

/** Small 3D cube drawn with CSS from a six-face block strip. */
const props = withDefaults(defineProps<{ src: string; size?: number; label?: string }>(), { size: 30 })

const faceStyle = (face: Face) => {
  const index = BLOCK_STRIP_ORDER.indexOf(face)
  return {
    backgroundImage: `url(${props.src})`,
    backgroundPosition: `${(index / (BLOCK_STRIP_ORDER.length - 1)) * 100}% 0`,
  }
}
const vars = computed(() => ({ '--s': `${props.size}px` }))
</script>

<template>
  <div class="block-icon" :style="vars" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : true">
    <div class="cube">
      <div class="face front" :style="faceStyle('front')"></div>
      <div class="face right" :style="faceStyle('right')"></div>
      <div class="face top" :style="faceStyle('top')"></div>
    </div>
  </div>
</template>

<style scoped>
.block-icon {
  width: calc(var(--s) * 1.6);
  height: calc(var(--s) * 1.6);
  display: grid;
  place-items: center;
  perspective: 600px;
}

.cube {
  width: var(--s);
  height: var(--s);
  position: relative;
  transform-style: preserve-3d;
  transform: rotateX(-30deg) rotateY(-45deg);
  transition: transform var(--dur-3) var(--ease-out);
}

/* The cube turns a little when you point at its tile. One element at a time, transform only. */
a:hover > .block-icon > .cube,
a:focus-visible > .block-icon > .cube {
  transform: rotateX(-30deg) rotateY(-60deg);
}

.face {
  position: absolute;
  inset: 0;
  background-size: 600% 100%;
  image-rendering: pixelated;
  backface-visibility: hidden;
}

.front {
  transform: translateZ(calc(var(--s) / 2));
  filter: brightness(0.8);
}

.right {
  transform: rotateY(90deg) translateZ(calc(var(--s) / 2));
  filter: brightness(0.62);
}

.top {
  transform: rotateX(90deg) translateZ(calc(var(--s) / 2));
}
</style>
