<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ToastHost from './components/ToastHost.vue'
import VisitorCount from './components/VisitorCount.vue'
import { SITE } from './lib/site'
import { showToast } from './lib/toast'
import { readStored, writeStored } from './lib/storage'

const route = useRoute()
const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement>()
const year = new Date().getFullYear()
const savedTheme = readStored('appearance:theme', 'system')
const theme = ref(['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system')
watch(theme, (value) => {
  if (value === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = value
  writeStored('appearance:theme', value)
}, { immediate: true })

/** Items stays highlighted on item guides; Skins on the skin pages. */
const section = computed(() => {
  const name = String(route.name ?? '')
  if (name === 'catalog' || name === 'item') return 'items'
  if (name.startsWith('skin')) return 'skins'
  if (name === 'support') return 'support'
  return ''
})

watch(() => route.path, async () => {
  menuOpen.value = false
  await nextTick()
  document.getElementById('main')?.focus({ preventScroll: true })
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false
    menuButton.value?.focus()
  }
}
function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  menuButton.value?.focus()
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
      <RouterLink to="/" class="brand" :aria-label="`${SITE.name} home`">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>{{ SITE.name }}</span>
      </RouterLink>

      <button
        ref="menuButton"
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

      <nav id="site-nav" :class="{ open: menuOpen }" aria-label="Main" @click="closeMenu">
        <RouterLink to="/" :class="['nav-link', { active: section === 'items' }]">Items</RouterLink>
        <RouterLink to="/skin" :class="['nav-link', { active: section === 'skins' }]">Skins</RouterLink>
        <RouterLink to="/support" :class="['nav-link', { active: section === 'support' }]">Support</RouterLink>
      </nav>
    </div>
  </header>

  <p class="fan-notice">Independent fan project. Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>

  <main id="main" tabindex="-1">
    <RouterView v-slot="{ Component }">
      <!-- Fades new pages in, and nothing else. No leave transition and no `mode="out-in"`, both
           of which hold the old page on screen and delay the new one painting. No transform
           either: it would make this element a containing block and break the guide's sticky
           3D preview. -->
      <Transition name="page">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <VisitorCount />
      <label class="theme-control">Appearance
        <select v-model="theme"><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select>
      </label>
      <nav class="footer-links" aria-label="Footer">
        <RouterLink to="/privacy">Privacy &amp; cookies</RouterLink>
        <RouterLink to="/terms">Terms</RouterLink>
        <RouterLink to="/support">Support the site</RouterLink>
        <a :href="`mailto:${SITE.operator.email}`">Contact {{ SITE.operator.name }}</a>
        <a :href="SITE.github" target="_blank" rel="noopener noreferrer">GitHub<span class="visually-hidden"> (opens in a new tab)</span></a>
        <a :href="SITE.tiktok.url" target="_blank" rel="noopener noreferrer">
          TikTok {{ SITE.tiktok.handle }}<span class="visually-hidden"> (opens in a new tab)</span>
        </a>
        <button type="button" class="link-button" @click="copyDiscord">
          Copy Discord username: {{ SITE.discord }}
        </button>
      </nav>
      <p class="muted">
        © {{ year }} {{ SITE.operator.name }}. Not an official Minecraft product. Not approved by or associated with
        Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB. All Minecraft textures and game artwork
        shown on this site are owned by Mojang Studios and used under the
        <a href="https://www.minecraft.net/en-us/usage-guidelines" target="_blank" rel="noopener noreferrer">
          Minecraft Usage Guidelines<span class="visually-hidden"> (opens in a new tab)</span></a>.
      </p>
    </div>
  </footer>

  <ToastHost />
</template>

<style scoped>
.theme-control { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--ink-soft); font-size: 0.9rem; }
.theme-control select { min-height: 44px; max-width: 100%; padding: 6px 10px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; }
.fan-notice { margin: 0; padding: 9px 16px; text-align: center; font-size: 0.75rem; color: var(--ink-soft); border-bottom: 1px solid var(--line); }
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
  min-height: 60px;
  padding-block: 8px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font: 700 1.35rem var(--pixel);
  color: var(--ink);
  text-decoration: none;
  line-height: 1.2;
  min-height: 44px;
  min-width: 0;
}

.site-header nav {
  display: flex;
  gap: 0.25rem;
}
.brand img { flex: none; }

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
  flex: none;
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

  .site-header nav {
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

  .site-header nav.open {
    display: flex;
  }

  .nav-link {
    min-height: 48px;
    font-size: 1.05rem;
  }
}

.page-enter-active {
  transition: opacity var(--dur-2) var(--ease-out);
}

.page-enter-from {
  opacity: 0;
}

main {
  padding: 28px 0 48px;
}

main:focus { outline: none; }

@media (max-width: 640px) {
  main {
    padding-top: 20px;
  }
}

.site-footer {
  border-top: 2px solid var(--line);
  padding: 28px 0 32px;
  background: var(--surface);
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

.footer-links a, .link-button { overflow-wrap: anywhere; }

.footer-links a,
.link-button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
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
