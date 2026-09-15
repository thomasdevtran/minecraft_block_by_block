import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { GET as skinHandler } from './api/skin/[username].ts'

/** Serves the Vercel skin function from the dev server, so `npm run dev` needs no extra tools. */
function devSkinApi(): Plugin {
  return {
    name: 'dev-skin-api',
    configureServer(server) {
      server.middlewares.use('/api/skin/', async (req, res) => {
        const response = await skinHandler(new Request(`http://localhost/api/skin${req.url}`))
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), devSkinApi()],
})
