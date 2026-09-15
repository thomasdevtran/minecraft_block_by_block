<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

withDefaults(defineProps<{ message?: string }>(), {
  message: "We couldn't find that page. The link might be old, or there's a typo in the address.",
})
const route = useRoute()
</script>

<template>
  <div class="container not-found">
    <div class="art" aria-hidden="true">
      <span class="cube c1"></span><span class="cube c2"></span><span class="cube c3"></span>
    </div>
    <p class="code">404</p>
    <h1>This block is missing</h1>
    <p class="muted">{{ message }}</p>
    <p class="path muted"><code>{{ route.fullPath }}</code></p>
    <div class="actions">
      <RouterLink to="/" class="btn primary">Browse items</RouterLink>
      <RouterLink to="/skin" class="btn">Build a player skin</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  max-width: 560px;
  text-align: center;
  padding-top: 24px;
  padding-bottom: 24px;
}

.art {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 12px;
}

.cube {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  border: 2px solid rgba(0, 0, 0, 0.35);
}

.c1 {
  background: linear-gradient(var(--accent) 0 30%, #7a5230 30%);
}

.c2 {
  border-style: dashed;
  border-color: var(--line);
  background: transparent;
}

.c3 {
  background: #8a8a8a;
}

.code {
  font: 700 1rem var(--pixel);
  color: var(--accent);
  margin: 0;
  letter-spacing: 0.2em;
}

.path code {
  word-break: break-all;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}
</style>
