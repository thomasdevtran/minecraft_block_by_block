<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { privacySignalEnabled, setVisitorChoice, visitorChoice } from '../lib/stats'
withDefaults(defineProps<{ settings?: boolean }>(), { settings: false })
const signal = privacySignalEnabled()
</script>

<template>
  <section v-if="settings || (visitorChoice === null && !signal)" class="privacy-choice" aria-label="Visitor count preference">
    <div>
      <strong>Optional visitor count</strong>
      <p>Allow your IP address and browser type to be processed for an approximate total? No browsing history or advertising profiles. <RouterLink to="/privacy#visitor-count">How it works</RouterLink></p>
      <p v-if="signal" role="status">Your browser privacy signal is respected. Counting is off.</p>
      <p v-else-if="settings" role="status">Counting is {{ visitorChoice === 'allow' ? 'on' : 'off' }}. You can change this at any time.</p>
    </div>
    <div v-if="!signal" class="choice-buttons">
      <button class="btn" :aria-pressed="visitorChoice === 'deny'" @click="setVisitorChoice('deny')">{{ settings ? 'Turn off' : 'No thanks' }}</button>
      <button class="btn" :aria-pressed="visitorChoice === 'allow'" @click="setVisitorChoice('allow')">{{ settings ? 'Turn on' : 'Allow count' }}</button>
    </div>
  </section>
</template>

<style scoped>
.privacy-choice { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; margin-bottom: 12px; background: var(--bg); font-size: 0.9rem; }
.privacy-choice > div:first-child { flex: 1 1 280px; }
.privacy-choice p { margin: 5px 0 0; color: var(--ink-soft); }
.choice-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { min-height: 44px; font-size: 0.9rem; }
button[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
</style>
