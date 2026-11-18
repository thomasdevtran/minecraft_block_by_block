/** Production frontend lab measurements. See performance/README.md for scope and reproducibility. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { preview } from 'vite'

const { values } = parseArgs({ options: {
  output: { type: 'string', default: 'dist/performance-browser.json' },
  channel: { type: 'string' },
  runs: { type: 'string', default: '5' },
  profile: { type: 'string', default: 'desktop' },
  scenarios: { type: 'string' },
  dist: { type: 'string', default: 'dist' },
  'verify-skins': { type: 'boolean', default: false },
  'immutable-assets': { type: 'boolean', default: false },
} })
const runs = Number(values.runs)
assert(Number.isInteger(runs) && runs > 0 && runs <= 20, '--runs must be between 1 and 20')
const profiles = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const profile = profiles[values.profile]
assert(profile, '--profile must be desktop or mobile')
const guide = '.guide .totals'
const scenarios = [
  { name: 'support', path: '/support', ready: '.support h1' },
  { name: 'catalog', path: '/', ready: '#catalog .tile' },
  { name: 'flat-item', path: '/item/diamond_sword?view=2d', ready: guide },
  { name: 'hollow-block', path: '/item/diamond_ore?view=3d&hollow=1', ready: guide },
  { name: 'solid-block', path: '/item/diamond_ore?view=3d&hollow=0', ready: guide },
  { name: 'flat-shape', path: '/item/chest?view=2d', ready: guide },
  { name: 'shaped-build', path: '/item/chest?view=3d', ready: guide },
  { name: 'flower', path: '/item/poppy?view=3d&pot=0', ready: guide },
  { name: 'potted-flower', path: '/item/poppy?view=3d&pot=1', ready: guide },
  { name: 'flat-skin', path: '/skin/guide?view=2d', ready: guide },
  { name: 'skin-3d', path: '/skin/guide?view=3d', ready: guide },
]
const selected = values.scenarios ? scenarios.filter(s => values.scenarios.split(',').includes(s.name)) : scenarios
assert(selected.length, 'No matching scenarios')
const skin = {
  label: 'Steve', model: 'classic',
  dataUrl: `data:image/png;base64,${readFileSync('public/textures/steve.png').toString('base64')}`,
}
const buildHash = createHash('sha256').update(readFileSync(`${values.dist}/index.html`)).digest('hex')
const manifest = JSON.parse(readFileSync(`${values.dist}/.vite/manifest.json`, 'utf8'))
const sdkFile = manifest['node_modules/@supabase/supabase-js/dist/index.mjs']?.file
const sdkPath = sdkFile ? '/' + sdkFile : null
const settings = { cpuSlowdown: 4, latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750, observationMs: 1500 }
const samples = []
const interactions = []
const server = await preview({
  build: { outDir: values.dist }, preview: { host: '127.0.0.1', port: 4175, strictPort: true },
  plugins: values['immutable-assets'] ? [{
    name: 'performance-asset-cache',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        // Match the deployed hashed-asset policy without changing application configuration.
        if (req.url?.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        next()
      })
    },
  }] : [],
})
let browser

function save() {
  const summaries = []
  for (const scenario of selected) for (const mode of ['cold', 'warm']) {
    const group = samples.filter(s => s.scenario === scenario.name && s.mode === mode)
    if (!group.length) continue
    const sorted = group.map(s => s.readyMs).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    summaries.push({ scenario: scenario.name, mode, n: sorted.length, readyMedianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      readyMinMs: sorted[0], readyMaxMs: sorted.at(-1) })
  }
  mkdirSync(dirname(values.output), { recursive: true })
  writeFileSync(values.output, JSON.stringify({ schemaVersion: 1, buildHash, browser: browser?.version(), node: process.version,
    profile: values.profile, ...profile, settings, runs, immutableAssets: values['immutable-assets'],
    scope: 'Local production preview; uncompressed localhost transfers, no hosted APIs. LCP/CLS stop 1500ms after ready. Warm reload retains HTTP cache; guide progress reset between samples. Action samples are not field INP.',
    summaries, samples, interactions }, null, 2) + '\n')
}

try {
  browser = await chromium.launch({ channel: values.channel, headless: true })
  for (const scenario of selected) for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ ...profile, reducedMotion: 'no-preference' })
    try {
      await context.addInitScript(({ selector, skin }) => {
        // Seed only a local public fixture; no account identity or hosted session is supplied.
        localStorage.setItem('skin:current', JSON.stringify(skin))
        for (const key of Object.keys(localStorage)) if (key.startsWith('progress:')) localStorage.removeItem(key)
        window.__perf = { readyMs: null, lcpMs: null, cls: 0, longTasks: [] }
        let start = 0, last = 0, score = 0
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) window.__perf.lcpMs = e.startTime
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue
            if (e.startTime - last > 1000 || e.startTime - start > 5000) { start = e.startTime; score = 0 }
            last = e.startTime; score += e.value
            window.__perf.cls = Math.max(window.__perf.cls, score)
          }
        }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver(list => {
          window.__perf.longTasks.push(...list.getEntries().map(e => ({ startMs: e.startTime, durationMs: e.duration })))
        }).observe({ type: 'longtask', buffered: true })
        const observer = new MutationObserver(() => {
          if (!document.querySelector(selector)) return
          window.__perf.readyMs = performance.now()
          observer.disconnect()
        })
        observer.observe(document, { subtree: true, childList: true })
      }, { selector: scenario.ready, skin })
      const page = await context.newPage()
      const errors = []
      const pending = new Set()
      page.on('pageerror', e => errors.push(e.message))
      page.on('request', r => pending.add(r))
      page.on('requestfinished', r => pending.delete(r))
      page.on('requestfailed', r => pending.delete(r))
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setBlockedURLs', { urls: ['https://*.supabase.co/*'] })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuSlowdown })
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: settings.latencyMs,
        downloadThroughput: settings.downloadBytesPerSecond, uploadThroughput: settings.uploadBytesPerSecond, connectionType: 'cellular4g' })
      for (const mode of ['cold', 'warm']) {
        if (mode === 'cold') await page.goto(`http://127.0.0.1:4175${scenario.path}`, { waitUntil: 'domcontentloaded' })
        else await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => window.__perf && window.__perf.readyMs !== null, undefined, { timeout: 60000 })
        await page.waitForTimeout(settings.observationMs)
        const metrics = await page.evaluate(() => ({ ...window.__perf,
          totals: document.querySelector('.guide .totals')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          resources: performance.getEntriesByType('resource').map(e => ({ path: new URL(e.name).pathname,
            transferBytes: e.transferSize, encodedBytes: e.encodedBodySize, decodedBytes: e.decodedBodySize, startMs: e.startTime, durationMs: e.duration })),
        }))
        assert.equal(metrics.overflow, false, `${scenario.name} overflows ${values.profile}`)
        assert.deepEqual(errors, [], 'Unhandled page errors')
        const resources = metrics.resources
        assert(!resources.some(r => r.path === sdkPath || r.path.includes('supabase')), 'Signed-out visit requested the account SDK')
        samples.push({ scenario: scenario.name, path: scenario.path, run, mode, ...metrics,
          pending: [...pending].map(r => new URL(r.url()).pathname) })
        save()
        console.log(`${values.profile} ${scenario.name} ${mode} ${run}/${runs}: ${metrics.readyMs.toFixed(0)}ms ready`)
      }
      if (scenario.ready === guide) {
        const before = await page.locator('.step-body').getAttribute('data-step')
        const start = await page.evaluate(() => performance.now())
        await page.locator('.guide').getByRole('button', { name: /^Start/ }).click()
        await page.waitForFunction(previous => document.querySelector('.step-body')?.getAttribute('data-step') !== previous, before)
        const end = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))))
        interactions.push({ scenario: scenario.name, run, action: 'start-to-two-frames', durationMs: end - start })
        if (values['verify-skins'] && run === 1) {
          await page.locator('.guide').getByRole('button', { name: /^Next/ }).click()
          await page.waitForFunction(() => document.querySelector('.step-body')?.getAttribute('data-step') === '2')
          await page.locator('.guide').getByRole('button', { name: /Back/ }).click()
          await page.waitForFunction(() => document.querySelector('.step-body')?.getAttribute('data-step') === '1')
          interactions.push({ scenario: scenario.name, action: 'next-back', passed: true })
        }
        await page.locator('.guide').getByRole('button', { name: /Back/ }).click()
        assert.equal(await page.locator('.step-body').getAttribute('data-step'), before)
      }
      if (scenario.name === 'catalog') {
        const search = page.locator('#catalog input[type=search]')
        const start = await page.evaluate(() => performance.now())
        await search.fill('sword')
        await page.waitForFunction(() => [...document.querySelectorAll('#catalog .tile')].every(e => /sword/i.test(e.textContent)) && document.querySelectorAll('#catalog .tile').length > 0)
        const end = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))))
        interactions.push({ scenario: 'catalog', run, action: 'search-to-two-frames', durationMs: end - start })
        await search.fill('')
        await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 60)
        await page.getByRole('group', { name: 'Filter by kind' }).getByRole('button', { name: 'Blocks', exact: true }).click()
        await page.waitForFunction(() => new URL(location.href).searchParams.get('kind') === 'block')
        assert.equal(await page.locator('#catalog .tile').count(), 60)
        await page.getByRole('group', { name: 'Filter by kind' }).getByRole('button', { name: 'All', exact: true }).click()
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('kind'))
        await page.getByRole('button', { name: /^Show more/ }).click()
        assert.equal(await page.locator('#catalog .tile').count(), 120)
        await page.locator('#catalog .tile').first().click()
        await page.locator(guide).waitFor()
        await page.goBack()
        await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 120)
        interactions.push({ scenario: 'catalog', run, action: 'show-more-guide-back', restoredTiles: 120 })
      }
      if (values['verify-skins'] && scenario.name === 'skin-3d' && run === 1) {
        await page.goto('http://127.0.0.1:4175/skin')
        await page.locator('input[type=file]').setInputFiles('public/textures/steve.png')
        await page.locator(guide).waitFor()
        assert.match(await page.locator('.guide').locator('..').locator('h1').textContent(), /steve/i)
        interactions.push({ scenario: 'skin-3d', action: 'upload-valid-png', passed: true })

        // Fixture integration only: no player or hosted API request is sent.
        await context.route('**/api/skin/*', route => route.fulfill({ status: 200,
          headers: { 'Content-Type': 'image/png', 'X-Skin-Model': 'classic', 'X-Skin-Username': 'FixtureSteve' },
          body: readFileSync('public/textures/steve.png'),
        }))
        await page.goto('http://127.0.0.1:4175/skin')
        await page.getByLabel('Java Edition username', { exact: true }).fill('FixtureSteve')
        await page.getByRole('button', { name: 'Get skin', exact: true }).click()
        await page.locator(guide).waitFor()
        assert.match(await page.locator('.guide').locator('..').locator('h1').textContent(), /FixtureSteve/)
        interactions.push({ scenario: 'skin-3d', action: 'fixture-username-lookup', passed: true })
      }
      save()
    } finally { await context.close() }
  }
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
console.log(`Saved ${samples.length} samples to ${values.output}`)
