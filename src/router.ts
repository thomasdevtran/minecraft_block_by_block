import { createRouter, createWebHistory } from 'vue-router'
import { loadCatalog } from './lib/catalog'
import { setPageMeta } from './lib/meta'
import { SITE } from './lib/site'
import { isChunkLoadError, reloadForNewDeploy } from './lib/recovery'
import { showToast } from './lib/toast'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page title; pages with loaded data (items, skins) refine it with setPageMeta. */
    title?: string
    description?: string
    /** Starts the catalog fetch as soon as the route is known, rather than on mount. */
    needsCatalog?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/account',
      name: 'account',
      component: () => import('./views/AccountView.vue'),
      meta: { title: 'Your account' },
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
      meta: { title: 'My Builds' },
    },
    {
      path: '/community',
      name: 'community',
      component: () => import('./views/CommunityView.vue'),
      meta: { title: 'Community' },
    },
    {
      path: '/community/new',
      name: 'community-new',
      component: () => import('./views/CommunityNewTopicView.vue'),
      meta: { title: 'New community topic' },
    },
    {
      path: '/community/moderation',
      name: 'community-moderation',
      component: () => import('./views/CommunityModerationView.vue'),
      meta: { title: 'Community report queue' },
    },
    {
      path: '/community/:topicId',
      name: 'community-topic',
      component: () => import('./views/CommunityTopicView.vue'),
      props: true,
      meta: { title: 'Community topic' },
    },
    {
      path: '/',
      name: 'catalog',
      component: () => import('./views/CatalogView.vue'),
      meta: {
        needsCatalog: true,
        title: 'Minecraft items, blocks and skins in real cubes',
        description: 'Pick any Minecraft item, block, flower or skin and get a paint list plus step-by-step building instructions.',
      },
    },
    {
      path: '/item/:id',
      name: 'item',
      component: () => import('./views/ItemGuideView.vue'),
      props: true,
      meta: { needsCatalog: true, title: 'Build guide' },
    },
    {
      path: '/skin',
      name: 'skin',
      component: () => import('./views/SkinView.vue'),
      meta: {
        title: 'Build a player skin',
        description: 'Look up a Minecraft player or upload a skin and build the character out of real cubes, step by step.',
      },
    },
    {
      path: '/skin/guide',
      name: 'skin-guide',
      component: () => import('./views/SkinGuideView.vue'),
      meta: { title: 'Skin build guide' },
    },
    {
      path: '/support',
      name: 'support',
      component: () => import('./views/SupportView.vue'),
      meta: {
        title: 'Support the site',
        description: `${SITE.name} is free and ad-free. If it helped you build something, you can chip in through Ko-fi or PayPal.`,
      },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('./views/PrivacyView.vue'),
      meta: {
        title: 'Privacy & cookies',
        description: 'How local build data, automatic page-visit counting, skin lookups and support payments work, and how to manage your privacy.',
      },
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('./views/TermsView.vue'),
      meta: {
        title: 'Terms of use',
        description: `The plain-language terms for using ${SITE.name}, including safety notes and Minecraft trademark information.`,
      },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: { title: 'Page not found' },
    },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) {
      // Back to the catalog: its rows only exist once the item list has loaded, and restoring the
      // position before that would land on a page too short to reach it.
      if (to.meta.needsCatalog) {
        const settled = () => new Promise<typeof saved>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(saved))))
        return loadCatalog().then(settled, settled)
      }
      return saved
    }
    if (to.hash) return { el: to.hash, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', top: 16 }
    // Switching 2D/3D or textures only changes the query, so keep the reader where they are.
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

/**
 * Starts the catalog fetch before the route's component chunk has even downloaded, so the two
 * overlap instead of queueing. `loadCatalog` memoises, so the view's own call joins this one.
 * Failures are ignored here because the view calls it again and reports the error properly.
 */
router.beforeEach((to) => {
  if (to.meta.needsCatalog) void loadCatalog().catch(() => {})
})

/**
 * A route's code chunk failed to load, usually because a deploy replaced it: open the page fresh.
 * Offline, a reload can't help: that page simply wasn't saved, so say so instead.
 */
router.onError((error, to) => {
  if (!isChunkLoadError(error)) return
  if (!navigator.onLine) showToast('You’re offline, and this page wasn’t saved. Guides you’ve opened before still work.', 'error')
  else reloadForNewDeploy(to.fullPath)
})

router.afterEach((to, from) => {
  if (to.path !== from.path || !from.name) setPageMeta(to.meta.title, to.meta.description,
    to.name === 'not-found' || to.name === 'skin-guide' || String(to.name ?? '').startsWith('community'))
})
