/** Production UI proof for RF-03. Timing measurements stay in measure-performance.mjs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { digest, observePixelDecodes, readJson, startPreview, writeJson } from './browser-support.mjs'

const { values } = parseArgs({ options: {
  dist: { type: 'string', default: 'dist' }, channel: { type: 'string' },
  reference: { type: 'string' },
  output: { type: 'string', default: 'performance/runs/phase2-checks.json' },
  baseline: { type: 'boolean', default: false }, mobile: { type: 'boolean', default: false },
} })
const catalog = readJson('public/data/items.json')
const referenceFile = values.reference ?? (values.baseline ? 'performance/runs/phase2-reference.json' : 'performance/guide-resources-baseline.json')
const items = Object.fromEntries(catalog.items.map(i => [i.id, i]))
const cases = [
  ['item', 'diamond_sword', '2d', 'current', '1', '0', 'sprite'],
  ['flat-block', 'diamond_ore', '2d', 'current', '1', '0', 'sprite'],
  ['flat-classic-block', 'diamond_ore', '2d', 'classic', '1', '0', 'sprite'],
  ['hollow-block', 'diamond_ore', '3d', 'current', '1', '0', 'strip'],
  ['solid-block', 'diamond_ore', '3d', 'current', '0', '0', 'strip'],
  ['classic-block', 'diamond_ore', '3d', 'classic', '1', '0', 'strip'],
  ['flat-shape', 'chest', '2d', 'current', '1', '0', 'sprite'],
  ['hollow-shape', 'chest', '3d', 'current', '1', '0', 'shape'],
  ['solid-shape', 'chest', '3d', 'current', '0', '0', 'shape'],
  ['flat-flower', 'poppy', '2d', 'current', '1', '0', 'sprite'],
  ['flower', 'poppy', '3d', 'current', '1', '0', 'sprite'],
  ['classic-flower', 'poppy', '3d', 'classic', '1', '0', 'sprite'],
  ['flat-potted-flower', 'poppy', '2d', 'current', '1', '1', 'potted'],
  ['potted-flower', 'poppy', '3d', 'current', '1', '1', 'potted'],
  ['classic-potted-flower', 'poppy', '3d', 'classic', '1', '1', 'potted'],
]
const guide = '.guide .totals'
const normalized = text => text.replace(/\s+/g, ' ').trim()
const server = await startPreview(values.dist)
const { base } = server
let browser
const observed = {}
const checks = []

async function newPage() {
  const context = await browser.newContext({ viewport: values.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, locale: 'en-US', reducedMotion: 'reduce' })
  await observePixelDecodes(context, { includeQuery: true })
  const page = await context.newPage()
  page.on('pageerror', error => { throw error })
  const requests = []
  page.on('request', r => { if (/\/(textures|data\/shapes)\//.test(r.url())) requests.push(new URL(r.url()).pathname + new URL(r.url()).search) })
  return { page, context, requests }
}
async function ready(page) { await page.locator(guide).waitFor(); assert.equal(await page.locator('.error-box').count(), 0) }
async function settings(page) { await page.locator('.build-settings > summary').click() }
async function mode(page, value) {
  await page.getByRole('group', { name: 'Build style', exact: true }).getByRole('button', { name: new RegExp(`^${value.toUpperCase()}`) }).click()
}
async function waitTotals(page, text) {
  await page.waitForFunction(text => document.querySelector('.guide .totals')?.textContent.replace(/\s+/g, ' ').trim() === text, text)
  assert.equal(await page.locator('.error-box').count(), 0)
}

try {
  // Written guide equivalence is checked independently of WebGL and preview download timing.
  browser = await chromium.launch({ channel: values.channel, headless: true, args: ['--disable-webgl'] })
  const reference = values.baseline ? null : readJson(referenceFile)
  const expected = !reference ? null : reference.verification?.contracts
    ? Object.fromEntries(reference.verification.contracts.map(c => [c.name, c]))
    : Object.fromEntries(Object.entries(reference.cases).map(([name, c]) => [name, { totals: c.written.totals, writtenSHA256: digest(JSON.stringify(c.written)) }]))
  for (const [name, id, view, look, hollow, pot, input] of cases) {
    const { page, context, requests } = await newPage()
    try {
      await page.goto(`${base}/item/${id}?view=${view}&look=${look}&hollow=${hollow}&pot=${pot}&paints=12&simple=1`)
      await ready(page)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal overflow: ${name}`)
      const totals = normalized(await page.locator(guide).textContent())
      const options = await page.locator('.step-picker option').allTextContents()
      const settingsText = normalized(await page.locator('.build-settings').textContent())
      const steps = []
      for (let step = 0; step < options.length; step++) {
        await page.locator('.step-picker select').selectOption(String(step))
        await page.waitForFunction(step => document.querySelector('.step-body')?.getAttribute('data-step') === String(step), step)
        const html = await page.locator('.step-body').innerHTML()
        steps.push(digest(html.replace(/ data-v-[a-z0-9-]+=""/g, '')))
      }
      const written = { totals, options, settingsText, steps }
      const decodes = await page.evaluate(() => window.__pixelDecodes)
      observed[name] = { written, requests, decodes }
      if (expected) {
        assert.equal(digest(JSON.stringify(written)), expected[name].writtenSHA256, `Written guide changed: ${name}`)
        const item = items[id]
        const sprite = look === 'classic' ? item.classic.texture : item.texture
        const strip = look === 'classic' ? item.classic.block : item.block
        const expectedPixels = input === 'shape' ? [] : input === 'strip' ? [`/${strip}?v=${catalog.version}`]
          : [`/${sprite}?v=${catalog.version}`, ...(input === 'potted' ? [`/${look === 'classic' ? catalog.classicPot : catalog.pot}?v=${catalog.version}`] : [])]
        assert.deepEqual([...decodes].sort(), expectedPixels.sort(), `Unexpected canvas decode: ${name}`)
        assert.deepEqual(requests.filter(r => r.startsWith('/data/shapes/')), input === 'shape' ? [`/${item.shape}?v=${catalog.version}`] : [], `Unexpected shape request: ${name}`)
        if (input === 'sprite' && item.block) assert(!requests.some(r => r.startsWith('/textures/blocks/') || r.startsWith('/textures/classic/blocks/')))
        if (input === 'sprite' && item.flower) assert(!requests.some(r => r.startsWith(`/${catalog.pot}?`) || r.startsWith(`/${catalog.classicPot}?`)))
      }
      console.log(`${values.baseline ? 'Captured' : 'Verified'} ${name}: ${options.length} written states`)
    } finally { await context.close() }
  }

  if (!values.baseline) {
    // No unused input may prevent an otherwise usable written guide from loading.
    for (const [id, blocked] of [['diamond_ore', '**/textures/blocks/*'], ['chest', '**/data/shapes/*'], ['poppy', `**/${catalog.pot}*`]]) {
      const { page, context } = await newPage()
      try {
        let hits = 0
        await page.route(blocked, route => { hits++; return route.fulfill({ status: 503, body: 'unavailable' }) })
        await page.goto(`${base}/item/${id}?view=2d&pot=0`)
        await ready(page)
        assert.equal(hits, 0, `Unused asset requested for ${id}`)
        checks.push(`unused-failure-isolated:${id}`)
      } finally { await context.close() }
    }

    const { page, context } = await newPage()
    try {
      await page.goto(`${base}/item/diamond_ore?view=3d&hollow=1&paints=12&simple=1`)
      await ready(page)
      await page.locator('.step-picker select').selectOption('3')
      await page.reload()
      await page.locator('.guide .step-picker select').waitFor()
      assert.equal(await page.locator('.step-picker select').inputValue(), '3')
      await settings(page)
      await mode(page, '2d'); await waitTotals(page, expected['flat-block'].totals)
      await mode(page, '3d'); await page.locator('.step-body[data-step="3"]').waitFor()
      assert.equal(await page.locator('.step-picker select').inputValue(), '3')
      await page.getByRole('group', { name: 'Textures', exact: true }).getByRole('button', { name: 'Old textures', exact: true }).click()
      await waitTotals(page, expected['classic-block'].totals)
      await page.getByRole('group', { name: 'Textures', exact: true }).getByRole('button', { name: 'New textures', exact: true }).click()
      await page.locator('.step-body[data-step="3"]').waitFor()
      const decodes = await page.evaluate(() => window.__pixelDecodes)
      assert.equal(new Set(decodes).size, decodes.length, 'Switching back decoded a resource again')
      checks.push('settings-reuse-and-saved-progress')
    } finally { await context.close() }

    for (const outcome of ['success', 'failure', 'item-change', 'unmount']) {
      const { page, context } = await newPage()
      let release, started
      const held = new Promise(resolve => { release = resolve })
      const requested = new Promise(resolve => { started = resolve })
      try {
        await page.route('**/data/shapes/chest.json*', async route => {
          started(); await held
          await route.fulfill(outcome === 'failure' || outcome === 'unmount'
            ? { status: 503, body: 'offline' }
            : { contentType: 'application/json', body: readFileSync('public/data/shapes/chest.json') })
        })
        await page.goto(`${base}/item/chest?view=2d&paints=12&simple=1`)
        await ready(page); await settings(page); await mode(page, '3d'); await requested
        if (outcome === 'item-change') {
          // Exercise route-prop reuse through the router's normal popstate listener.
          await page.evaluate(() => { history.pushState(history.state, '', '/item/diamond_sword?view=2d&paints=12&simple=1'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
          await waitTotals(page, expected.item.totals)
        } else if (outcome === 'unmount') {
          if (values.mobile) await page.locator('.menu-button').click()
          await page.locator('#site-nav a[href="/"]').click()
          await page.locator('#catalog .tile').first().waitFor()
        } else {
          await mode(page, '2d'); await waitTotals(page, expected['flat-shape'].totals)
        }
        const response = page.waitForResponse(response => new URL(response.url()).pathname === '/data/shapes/chest.json')
        release(); await (await response).finished()
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        if (outcome !== 'unmount') await waitTotals(page, expected[outcome === 'item-change' ? 'item' : 'flat-shape'].totals)
        assert.equal(await page.locator('.error-box').count(), 0)
        checks.push(`late-shape-${outcome}`)
      } finally { release(); await context.close() }
    }

    const retry = await newPage()
    try {
      let fail = true
      await retry.page.route('**/textures/items/diamond_sword.png*', route => route.fulfill(fail
        ? { status: 503, body: 'offline' }
        : { contentType: 'image/png', body: readFileSync('public/textures/items/diamond_sword.png') }))
      await retry.page.goto(`${base}/item/diamond_sword?view=2d&paints=12&simple=1`)
      await retry.page.locator('.error-box').waitFor()
      fail = false
      await retry.page.getByRole('button', { name: 'Try again', exact: true }).click()
      await waitTotals(retry.page, expected.item.totals)
      checks.push('required-image-retry')
    } finally { await retry.context.close() }
  }
  const output = { schemaVersion: 1, browser: browser.version(), baseline: values.baseline, mobile: values.mobile, cases: observed, checks }
  const file = values.baseline ? referenceFile : values.output
  writeJson(file, output)
  console.log(`Saved guide resource proof to ${file}`)
} finally {
  await browser?.close()
  await server.close()
}
