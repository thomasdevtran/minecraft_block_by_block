import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { countVisit } from './lib/stats'

createApp(App).use(router).mount('#app')

// Only a previously opted-in visitor is counted; no additional analytics scripts are loaded.
countVisit()
