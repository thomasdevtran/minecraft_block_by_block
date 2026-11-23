/**
 * Offline guides against a production build: npm run build && npm run check:offline [-- --channel chrome].
 * Opens guides online, then offline: reloads, steps to the end, and checks what isn't saved says so.
 * Then simulates deploys and the kill switch by rewriting dist/sw.js (restored afterwards).
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { startPreview } from './browser-support.mjs'

const { values } = parseArgs({ options: {
  dist: { type: 'string', default: 'dist' }, channel: { type: 'string' },
} })
const workerFile = join(values.dist, 'sw.js')
const original = readFileSync(workerFile, 'utf8')
const build = original.match(/^const BUILD = "([^"]+)"/m)?.[1]
assert.ok(build && !build.startsWith('next-') && original.includes('const ENABLED = true'), 'dist/sw.js is missing or left over from an interrupted run; run npm run build first.')
let server = await startPreview(values.dist)
let browser

const cacheNames = page => page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('bbc-')).sort())
const savedGuideFiles = page => page.evaluate(async () => {
  const cache = await caches.open('bbc-guides')
  return (await cache.keys()).map(request => new URL(request.url).pathname)
})
async function ready(page) {
  await page.locator('.guide .totals').waitFor()
  assert.equal(await page.locator('.error-box').count(), 0)
}
/** Installs a changed dist/sw.js and waits until it runs, as after a deploy. */
async function deploy(page, source, done, arg = null) {
  // The preview server reads file sizes at startup, so restart it like a real deploy would.
  writeFileSync(workerFile, source)
  await server.close()
  server = await startPreview(values.dist)
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
  await page.waitForFunction(done, arg, { timeout: 15000, polling: 200 })
}

try {
  browser = await chromium.launch({ channel: values.channel, headless: true, args: ['--disable-webgl'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error))

  // First visit: the worker installs after the page is idle, then saves what the guide loaded.
  await page.goto(`${server.base}/item/rose`)
  await ready(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 })
  await page.waitForFunction(async () => {
    const cache = await caches.open('bbc-guides')
    return (await cache.keys()).some(request => request.url.includes('/rose'))
  }, null, { timeout: 15000, polling: 200 })
  assert.deepEqual(await cacheNames(page), [`bbc-app-${build}`, 'bbc-guides', 'bbc-meta'].sort())

  // A 3D guide saves its shape too.
  await page.goto(`${server.base}/item/chest?view=3d`)
  await ready(page)
  await page.waitForFunction(async () => {
    const cache = await caches.open('bbc-guides')
    return (await cache.keys()).some(request => request.url.includes('/data/shapes/'))
  }, null, { timeout: 15000, polling: 200 })
  // Browsing the catalog doesn't save its pictures.
  await page.goto(server.base)
  await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 60)
  const saved = await savedGuideFiles(page)
  assert.ok(saved.every(path => /rose|chest|pot|__guides/.test(path)), `Unexpected saved files: ${saved.join(', ')}`)

  // Offline: both guides reload and step through to the end.
  await context.setOffline(true)
  for (const path of ['/item/rose', '/item/chest?view=3d']) {
    await page.goto(`${server.base}${path}`)
    await ready(page)
    const steps = await page.locator('.step-picker option').count()
    assert.ok(steps > 2, `${path} has too few steps offline`)
    for (const step of [1, steps - 1]) {
      await page.locator('.step-picker select').selectOption(String(step))
      await page.locator(`.step-body[data-step="${step}"]`).waitFor()
    }
  }
  // A page that was never opened says it wasn't saved rather than failing silently.
  await page.getByRole('link', { name: /privacy/i }).first().click()
  await page.getByText('this page wasn’t saved').waitFor()
  await context.setOffline(false)

  // A deploy keeps the previous deploy's code and the saved guides; the one before that goes.
  const next = build => original.replace(/^const BUILD = "[^"]+"/m, `const BUILD = "${build}"`)
  const deployed = async expected => JSON.stringify((await caches.keys()).filter(name => name.startsWith('bbc-')).sort()) === JSON.stringify(expected)
  await deploy(page, next('next-1'), deployed, [`bbc-app-${build}`, 'bbc-app-next-1', 'bbc-guides', 'bbc-meta'].sort())
  await deploy(page, next('next-2'), deployed, ['bbc-app-next-1', 'bbc-app-next-2', 'bbc-guides', 'bbc-meta'].sort())

  // Clear saved build data removes every offline copy.
  await page.goto(`${server.base}/privacy`)
  await page.getByRole('button', { name: 'Clear saved build data' }).click()
  await page.getByRole('button', { name: 'Delete saved builds' }).click()
  await page.getByText('offline guides were removed').waitFor()
  assert.deepEqual(await cacheNames(page), [])

  // Kill switch: the worker deletes its caches and unregisters itself.
  await page.goto(`${server.base}/item/rose`)
  await ready(page)
  await page.waitForFunction(async () => (await caches.keys()).includes('bbc-guides'), null, { timeout: 15000, polling: 200 })
  await deploy(page, original.replace('const ENABLED = true', 'const ENABLED = false'),
    async () => !(await navigator.serviceWorker.getRegistration()) && !(await caches.keys()).some(name => name.startsWith('bbc-')))
  assert.deepEqual(errors, [])
  console.log('Offline guides: saved on first visit, reload and step offline, survive one deploy, clear and switch off.')
} finally {
  writeFileSync(workerFile, original)
  await browser?.close()
  await server.close()
}
