import { createRouter, createWebHistory } from 'vue-router'
import { setPageMeta } from './lib/meta'

declare module 'vue-router' {
  interface RouteMeta {
    /** Page title; pages with loaded data (items, skins) refine it with setPageMeta. */
    title?: string
    description?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'catalog',
      component: () => import('./views/CatalogView.vue'),
      meta: {
        title: 'Minecraft items, blocks and skins in real cubes',
        description: 'Pick any Minecraft item, block, flower or skin and get a paint list plus step-by-step building instructions.',
      },
    },
    {
      path: '/item/:id',
      name: 'item',
      component: () => import('./views/ItemGuideView.vue'),
      props: true,
      meta: { title: 'Build guide' },
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
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: { title: 'Page not found' },
    },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 16 }
    // Switching 2D/3D or textures only changes the query, so keep the reader where they are.
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.afterEach((to) => setPageMeta(to.meta.title, to.meta.description))
