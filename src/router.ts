import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'catalog', component: () => import('./views/CatalogView.vue') },
    { path: '/item/:id', name: 'item', component: () => import('./views/ItemGuideView.vue'), props: true },
    { path: '/skin', name: 'skin', component: () => import('./views/SkinView.vue') },
    { path: '/skin/guide', name: 'skin-guide', component: () => import('./views/SkinGuideView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
