<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ToastHost from './components/ToastHost.vue'
import { SITE } from './lib/site'
import { showToast } from './lib/toast'

const route = useRoute()
const menuOpen = ref(false)
const year = new Date().getFullYear()

/** Items stays highlighted on item guides; Skins on the skin pages. */
const section = computed(() => {
  const name = String(route.name ?? '')
  if (name === 'catalog' || name === 'item') return 'items'
  if (name.startsWith('skin')) return 'skins'
  return ''
})

watch(() => route.fullPath, () => (menuOpen.value = false))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

async function copyDiscord() {
  try {
    await navigator.clipboard.writeText(SITE.discord)
    showToast(`Copied Discord username “${SITE.discord}”.`)
  } catch {
    showToast(`Couldn't copy automatically. The Discord username is ${SITE.discord}.`, 'error')
  }
}
</script>

<template>
  <a href="#main" class="skip-link">Skip to content</a>
  <header class="site-header">
    <div class="container bar">
      <RouterLink to="/" class="brand" aria-label="Block by Block home">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>Block by Block</span>
      </RouterLink>

      <button
        class="menu-button"
        :aria-expanded="menuOpen"
        aria-controls="site-nav"
        :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path v-if="menuOpen" d="M6 6l12 12M18 6L6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <nav id="site-nav" :class="{ open: menuOpen }" aria-label="Main">
        <RouterLink to="/" :class="['nav-link', { active: section === 'items' }]">Items</RouterLink>
        <RouterLink to="/skin" :class="['nav-link', { active: section === 'skins' }]">Skins</RouterLink>
      </nav>
    </div>
  </header>

  <main id="main">
    <RouterView />
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-links">
        <a :href="SITE.github" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a :href="SITE.tiktok.url" target="_blank" rel="noopener noreferrer">TikTok {{ SITE.tiktok.handle }}</a>
        <button class="link-button" :title="`Copy Discord username ${SITE.discord}`" @click="copyDiscord">
          Discord: {{ SITE.discord }}
        </button>
      </div>
      <p class="muted">
        © {{ year }} Block by Block. Not an official Minecraft product. Not approved by or associated with Mojang or
        Microsoft.
      </p>
    </div>
  </footer>

  <ToastHost />
</template>

<style scoped>
.skip-link {
  position: absolute;
  left: 8px;
  top: -48px;
  padding: 0.5rem 0.8rem;
  background: var(--accent);
  color: var(--accent-ink);
  border-radius: 8px;
  z-index: 200;
  font-weight: 600;
}

.skip-link:focus {
  top: 8px;
}

.site-header {
  border-bottom: 2px solid var(--line);
  background: var(--surface);
  position: relative;
  z-index: 50;
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
  white-space: nowrap;
  min-height: 44px;
}

nav {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  display: flex;
  align-items: center;
  min-height: 40px;
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

.menu-button {
  display: none;
  width: 44px;
  height: 44px;
  border: 2px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
  place-items: center;
}

.menu-button svg {
  stroke: var(--ink);
  stroke-width: 2.2;
  stroke-linecap: round;
  fill: none;
}

@media (max-width: 640px) {
  .brand {
    font-size: 1.15rem;
  }

  .menu-button {
    display: grid;
  }

  nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: 4px;
    padding: 8px 16px 16px;
    background: var(--surface);
    border-bottom: 2px solid var(--line);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
  }

  nav.open {
    display: flex;
  }

  .nav-link {
    min-height: 48px;
    font-size: 1.05rem;
  }
}

main {
  padding: 28px 0 48px;
}

@media (max-width: 640px) {
  main {
    padding-top: 20px;
  }
}

.site-footer {
  border-top: 2px solid var(--line);
  padding: 20px 0 28px;
  font-size: 0.85rem;
}

.footer-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
}

.footer-links a,
.link-button {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  color: var(--ink);
  font: 600 0.95rem var(--sans);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

.footer-links a:hover,
.link-button:hover {
  color: var(--accent);
}

.site-footer p {
  margin: 0;
}
</style>
