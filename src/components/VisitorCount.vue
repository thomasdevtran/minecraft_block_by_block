<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { whenIdle } from '../lib/dom'
import { loadStats } from '../lib/stats'

withDefaults(defineProps<{ big?: boolean }>(), { big: false })

const total = ref<number | null>(null)
const failed = ref(false)
let active = true
let cancelIdle = () => {}

onBeforeUnmount(() => {
  active = false
  cancelIdle()
})

onMounted(() => {
  cancelIdle = whenIdle(async () => {
    try {
      // The request is shared with other counters; only cancel this instance's updates.
      const stats = await loadStats()
      if (active) total.value = stats.total
    } catch {
      if (active) failed.value = true
    }
  })
})
</script>

<template>
  <!-- The slot is sized from the first paint and the digits are tabular, so the number arriving
       can't reflow the line around it. -->
  <p v-if="!failed" :class="['visitors', { big, ready: total !== null }]">
    <span class="count">{{ total?.toLocaleString() }}</span>
    <span class="label muted">{{ total === 1 ? 'page visit' : 'page visits' }} · <RouterLink to="/privacy#visitor-count">How we count</RouterLink></span>
  </p>
  <p v-else-if="big" class="muted">Visit count is currently unavailable.</p>
</template>

<style scoped>
/* The line holds its height and the number holds its width from the very first paint, so the
   count arriving late fades in without moving anything around it. `visibility` rides along with
   the fade: an opacity-0 line still let keyboard users tab onto its invisible "How we count"
   link, and a hidden line also stays out of the screen-reader view until it has a number. */
.visitors {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  flex-wrap: wrap;
  min-height: 1.5em;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--dur-2) var(--ease-out), visibility var(--dur-2);
}

.visitors.ready {
  opacity: 1;
  visibility: visible;
}

.count {
  min-width: 5ch;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ink);
}

.big {
  justify-content: center;
  gap: 0.5em;
}

.big .count {
  font: 700 2.4rem var(--pixel);
  color: var(--accent);
  min-width: 6ch;
  text-align: center;
}

.big .label {
  font-size: 1.05rem;
}
</style>
