import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { preview } from 'vite'

export const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
export const digest = text => createHash('sha256').update(text).digest('hex')
export const hashJson = value => digest(JSON.stringify(value))

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

/** Serves a production build on a fixed local port. `plugins` can add preview-only middleware. */
export async function startPreview(dist, plugins = []) {
  const server = await preview({ build: { outDir: dist }, preview: { host: '127.0.0.1', port: 4175, strictPort: true }, plugins })
  return {
    base: 'http://127.0.0.1:4175',
    close: () => new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())),
  }
}

/** Functional observation only; keep request interception out of timed performance runs. */
export async function observePixelDecodes(context, { includeQuery = false, failOnHome = [] } = {}) {
  await context.addInitScript(({ includeQuery, failOnHome }) => {
    window.__pixelDecodes = []
    const drawImage = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image instanceof HTMLImageElement) {
        const url = new URL(image.src)
        window.__pixelDecodes.push(url.pathname + (includeQuery ? url.search : ''))
        if (location.pathname === '/' && failOnHome.includes(url.pathname)) throw new Error('Optional pixel processing unavailable')
      }
      return Reflect.apply(drawImage, this, [image, ...args])
    }
  }, { includeQuery, failOnHome })
}
