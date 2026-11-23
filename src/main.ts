import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { countVisit } from './lib/stats'
import { startOffline } from './lib/offline'
import { reloadForNewDeploy } from './lib/recovery'
import { showToast } from './lib/toast'

// A chunk named in an old index.html no longer exists after a deploy: load the new version.
// Without the reload, the error continues to the router or view, which report it.
// Offline, the chunk wasn't saved and a reload can't fetch it: the router reports that instead.
window.addEventListener('vite:preloadError', (event) => {
  if (navigator.onLine && reloadForNewDeploy()) event.preventDefault()
})

const app = createApp(App).use(router)

app.config.errorHandler = (error, _instance, info) => {
  console.error(error, info)
  showToast('Something went wrong on this page. Try again, or reload if it keeps happening.', 'error')
}

app.mount('#app')

// Count each page load automatically; no additional analytics scripts are loaded.
countVisit()

// Keeps the guides a visitor opens working without a connection (production builds only).
startOffline()
