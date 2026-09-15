<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="site-header">
    <div class="container bar">
      <RouterLink to="/" class="brand">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        Block by Block
      </RouterLink>
      <nav>
        <RouterLink to="/" class="nav-link" :class="{ active: $route.name === 'item' }" exact-active-class="active">Items</RouterLink>
        <RouterLink to="/removed" class="nav-link" active-class="active">Removed</RouterLink>
        <RouterLink to="/skin" class="nav-link" active-class="active">Skins</RouterLink>
      </nav>
    </div>
  </header>
  <main>
    <RouterView />
  </main>
  <footer class="container site-footer muted">
    Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
  </footer>
</template>

<style scoped>
.site-header {
  border-bottom: 2px solid var(--line);
  background: var(--surface);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: 60px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font: 700 1.35rem var(--pixel);
  color: var(--ink);
  text-decoration: none;
}

nav {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
}

.nav-link:hover {
  color: var(--ink);
}

.nav-link.active {
  background: var(--accent-soft);
  color: var(--ink);
}

main {
  padding: 28px 0 48px;
}

.site-footer {
  padding-bottom: 28px;
  font-size: 0.85rem;
}
</style>
