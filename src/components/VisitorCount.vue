<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { whenIdle } from '../lib/schedule'
import { loadStats } from '../lib/stats'

withDefaults(defineProps<{ big?: boolean }>(), { big: false })

const total = ref<number | null>(null)
const failed = ref(false)

onMounted(() => {
  // After the page has settled, never during it — the number is the least urgent thing here.
  whenIdle(async () => {
    try {
      total.value = (await loadStats()).total
    } catch {
      failed.value = true
    }
  })
})
</script>

<template>
  <!-- The slot is sized from the first paint and the digits are tabular, so the number arriving
       can't reflow the line around it. -->
  <p v-if="!failed" :class="['visitors', { big, ready: total !== null }]">
    <span class="count">{{ total?.toLocaleString() }}</span>
    <span class="label muted">{{ total === 1 ? 'page visit' : 'page visits' }} · <a href="/privacy#visitor-count">How we count</a></span>
  </p>
  <p v-else-if="big" class="muted">Visit count is currently unavailable.</p>
</template>

<style scoped>
/* The line holds its height and the number holds its width from the very first paint, so the
   count arriving late fades in without moving anything around it. */
.visitors {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  flex-wrap: wrap;
  min-height: 1.5em;
  opacity: 0;
  transition: opacity var(--dur-2) var(--ease-out);
}

.visitors.ready {
  opacity: 1;
}

.count {
  min-width: 5ch;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ink);
}

/* Colour comes from the global .muted class; this only exists as a hook for the .big size. */

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
