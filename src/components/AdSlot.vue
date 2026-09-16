<script setup lang="ts">
import { ref, watch } from 'vue'
import { ADS_ENABLED, ADSENSE_CLIENT, AD_SIZE } from '../lib/ads'
import { useNearViewport } from '../lib/visibility'

/** Not named `slot` — that is a reserved attribute in Vue and would never reach this component. */
const props = defineProps<{ unit: string }>()

const root = ref<HTMLElement | null>(null)
// Two viewports out: the ad script is the heaviest thing on any page that carries it and has no
// business competing with the guide for the main thread while the reader is still up top.
const near = useNearViewport(root, '200%')

const SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'

/** Added once per page, however many slots there are. */
function loadAdSense() {
  if (document.querySelector(`script[src^="${SCRIPT_SRC}"]`)) return
  const script = document.createElement('script')
  script.src = `${SCRIPT_SRC}?client=${ADSENSE_CLIENT}`
  script.async = true
  script.crossOrigin = 'anonymous'
  document.head.appendChild(script)
}

watch(near, (isNear) => {
  if (!isNear || !ADS_ENABLED || !ADSENSE_CLIENT) return
  loadAdSense()
  // AdSense reads this queue to find slots that are ready to fill.
  ;((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ??= []).push({})
})
</script>

<template>
  <!-- The box is the same size whether an ad loads, fails, or is blocked, so the page never
       reflows around it. That is the only reliable way to keep an ad off the layout-shift score. -->
  <aside
    v-if="ADS_ENABLED"
    ref="root"
    class="ad-slot"
    :style="{ minHeight: `${AD_SIZE.height}px` }"
    aria-label="Advertisement"
  >
    <span class="ad-label muted">Advertisement</span>
    <ins
      class="adsbygoogle"
      :data-ad-client="ADSENSE_CLIENT"
      :data-ad-slot="props.unit"
      :style="{ display: 'inline-block', width: `${AD_SIZE.width}px`, height: `${AD_SIZE.height}px` }"
    ></ins>
  </aside>
</template>

<style scoped>
.ad-slot {
  display: grid;
  place-items: center;
  gap: 6px;
  margin: 24px 0;
  padding: 8px;
  border: 2px dashed var(--line);
  border-radius: var(--radius);
}

.ad-label {
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
