/** Viewport scheduling and demo compatibility proof. Run against a production build. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { hashJson as hash, observePixelDecodes, readJson, startPreview, writeJson } from './browser-support.mjs'

const { values } = parseArgs({ options: {
  dist: { type: 'string', default: 'dist' }, channel: { type: 'string' },
  baseline: { type: 'boolean', default: false }, reference: { type: 'string' },
  output: { type: 'string', default: 'performance/runs/phase3-checks.json' },
  mobile: { type: 'boolean', default: false },
} })
const referenceFile = values.reference ?? (values.baseline ? 'performance/runs/phase3-reference.json' : 'performance/homepage-baseline.json')
const catalog = readJson('public/data/items.json')
const ids = ['rose', 'poppy', 'diamond_ore', 'axolotl_bucket', 'steve']
const name = id => id === 'steve' ? 'Steve' : catalog.items.find(i => i.id === id).name
const manifest = readJson(`${values.dist}/.vite/manifest.json`)
const chunkPath = label => {
  const entry = Object.values(manifest).find(c => c.name === label && c.file.endsWith('.js'))
  return entry ? '/' + entry.file : null
}
const generators = ['item', 'block', 'flower', 'skin']
const optional = [...generators, 'model', 'pixels', 'VoxelPreview']
const engineNames = paths => generators.filter(label => chunkPath(label) && paths.includes(chunkPath(label)))
const observed = { demos: {}, checks: [] }
let browser
const server = await startPreview(values.dist)
const { base } = server

async function pageIn(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: values.mobile ? 390 : 1280, height: 200 }, locale: 'en-US', reducedMotion: options.motion ? 'no-preference' : 'reduce' })
  await observePixelDecodes(context, { failOnHome: options.fail })
  await context.addInitScript(({ noObserver }) => {
    if (noObserver) delete window.IntersectionObserver
    window.__decodeStarts = []
    window.__renderCalls = 0
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      window.__decodeStarts.push(new URL(this.src).pathname)
      return Reflect.apply(decode, this, [])
    }
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = WebGL2RenderingContext.prototype[name]
      WebGL2RenderingContext.prototype[name] = function (...args) {
        window.__renderCalls++
        return Reflect.apply(draw, this, args)
      }
    }
  }, { noObserver: options.noObserver ?? false })
  const page = await context.newPage()
  if (options.holdBlock) await page.route('**/textures/blocks/diamond_ore.png*', async route => {
    await options.holdBlock
    await route.fulfill({ contentType: 'image/png', body: readFileSync('public/textures/blocks/diamond_ore.png') })
  })
  const scripts = []
  page.on('request', r => { if (new URL(r.url()).pathname.endsWith('.js')) scripts.push(new URL(r.url()).pathname) })
  page.on('pageerror', error => { throw error })
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('#catalog .tile').first().waitFor()
  return { page, context, scripts }
}
async function select(page, id, mode) {
  await page.getByRole('group', { name: 'Preview a build', exact: true }).getByRole('button', { name: name(id), exact: true }).evaluate(el => el.click())
  await page.getByRole('group', { name: 'Preview style', exact: true }).getByRole('button', { name: mode.toUpperCase(), exact: true }).evaluate(el => el.click())
}
async function near(page, selector) {
  await page.locator(selector).evaluate(el => scrollTo({ top: scrollY + el.getBoundingClientRect().top - innerHeight - 100, behavior: 'instant' }))
}
async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('.demo .actions button')?.disabled)
  await page.evaluate(() => document.fonts.ready)
}
async function twoFrames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
/**
 * Asset URLs carry ?v=<asset revision>, which changes whenever any texture changes. The contracts pin
 * which file each icon shows, not its cache tag, so both sides compare with the tag blanked.
 */
const untagged = value => JSON.parse(JSON.stringify(value).replace(/\?v=[0-9A-Za-z._-]+/g, '?v=*'))
async function snapshot(page) {
  return page.locator('.demo').evaluate(el => ({
    summary: el.querySelector('[aria-live]').textContent.trim(),
    swatches: [...el.querySelectorAll('.swatches li')].map(e => e.style.background),
    link: el.querySelector('.actions a').getAttribute('href'),
    iconFaces: [...el.querySelectorAll('.picker .face:not(span)')].map(e => [e.className, e.style.backgroundPosition, e.style.backgroundImage]),
  }))
}
async function checkGuide(page, summary) {
  const match = summary.match(/([\d,]+) cubes and ([\d,]+) paint colors/)
  assert(match)
  await page.locator('.demo .actions a').click()
  await page.locator('.guide .totals').waitFor()
  const totals = await page.locator('.guide .totals strong').allTextContents()
  assert.equal(totals[0].replaceAll(',', ''), match[1].replaceAll(',', ''))
  assert.equal(totals[1].replaceAll(',', ''), match[2].replaceAll(',', ''))
}

try {
  browser = await chromium.launch({ channel: values.channel, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const reference = values.baseline ? null : readJson(referenceFile).behavior
  // Keep both sections outside their real 200px margins, rather than mocking visibility.
  const initial = await pageIn(browser)
  try {
    const margins = await initial.page.evaluate(() => ({ demo: document.querySelector('.demo .stage').getBoundingClientRect().top, starters: document.querySelector('#first-build').getBoundingClientRect().top, height: innerHeight }))
    assert(margins.demo > margins.height + 200 && margins.starters > margins.height + 200)
    assert.equal(await initial.page.getByRole('group', { name: 'Preview style', exact: true }).getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed'), 'true')
    await initial.page.waitForTimeout(250)
    observed.initial = { margins, decodes: await initial.page.evaluate(() => window.__pixelDecodes), engines: engineNames(initial.scripts), scripts: initial.scripts }
    if (reference) {
      assert.deepEqual(observed.initial.decodes, [])
      for (const label of optional) assert(!initial.scripts.includes(chunkPath(label)), `${label} loaded before its viewport trigger`)
      assert.equal(await initial.page.locator('#first-build .starter-stats').filter({ hasText: /\d+ cubes/ }).count(), 0)
    }
    await near(initial.page, '#first-build')
    await initial.page.waitForFunction(() => [...document.querySelectorAll('#first-build .starter-stats')].every(el => /\d+ cubes/.test(el.textContent)))
    observed.starters = await initial.page.locator('#first-build .starter').evaluateAll(cards => cards.map(card => ({ text: card.querySelector('.starter-stats').textContent.trim(), href: card.getAttribute('href') })))
    if (reference) assert.deepEqual(untagged(observed.starters), untagged(reference.starters))
    // These two starter sprites are not also used by the demo, which may finish loading nearby.
    const count = await initial.page.evaluate(() => window.__pixelDecodes.filter(p => /\/(emerald|red_tulip)\.png$/.test(p)).length)
    await initial.page.evaluate(() => scrollTo(0, 0)); await near(initial.page, '#first-build')
    await initial.page.waitForTimeout(100)
    assert.equal(await initial.page.evaluate(() => window.__pixelDecodes.filter(p => /\/(emerald|red_tulip)\.png$/.test(p)).length), count, 'Returning to the section regenerated counts')
    observed.checks.push('starter-near-once')
  } finally { await initial.context.close() }

  for (const id of ids) for (const mode of ['2d', '3d']) {
    const { page, context, scripts } = await pageIn(browser)
    try {
      // Choosing before the stage approaches isolates the selected branch in a fresh page.
      await select(page, id, mode)
      await near(page, '.demo .stage')
      await settled(page)
      const result = await snapshot(page)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal overflow: ${id}/${mode}`)
      const key = `${id}:${mode}`
      observed.demos[key] = result
      if (reference) {
        assert.deepEqual(untagged(result), untagged(reference.demos[key]), `Demo changed: ${key}`)
        const expected = id === 'steve' ? mode === '2d' ? ['item', 'skin'] : ['skin']
          : mode === '2d' || id === 'axolotl_bucket' ? ['item'] : id === 'diamond_ore' ? ['block'] : ['flower']
        assert.deepEqual(engineNames(scripts).sort(), expected.sort(), `Unused generator loaded: ${key}`)
      }
      await page.locator('.demo .actions button').evaluate(el => el.click())
      await page.locator('.demo canvas').waitFor()
      assert.equal(await page.locator('.demo .preview-error').count(), 0)
      assert.deepEqual(await page.locator('.demo .camera-controls button').allTextContents(), ['↶ Left', 'Right ↷'])
      await page.waitForFunction(() => window.__renderCalls > 0); await twoFrames(page)
      const drawn = await page.evaluate(() => window.__renderCalls)
      await page.waitForTimeout(100)
      assert.equal(await page.evaluate(() => window.__renderCalls), drawn, 'Reduced-motion preview kept animating')
      await page.getByRole('button', { name: 'Left', exact: true }).evaluate(el => el.click())
      assert(await page.evaluate(() => window.__renderCalls) > drawn, 'Rotate button did not render')
      await checkGuide(page, result.summary)
      console.log(`${values.baseline ? 'Captured' : 'Verified'} demo ${key} and matching guide`)
    } finally { await context.close() }
  }

  // No IntersectionObserver: optional details still become available.
  const fallback = await pageIn(browser, { noObserver: true })
  try {
    await settled(fallback.page)
    await fallback.page.waitForFunction(() => [...document.querySelectorAll('#first-build .starter-stats')].every(el => /\d+ cubes/.test(el.textContent)))
    observed.checks.push('observer-fallback')
  } finally { await fallback.context.close() }

  // Optional count failures retain fallback text and usable guides.
  const brokenCounts = await pageIn(browser, { fail: ['/textures/items/emerald.png'] })
  try {
    await near(brokenCounts.page, '#first-build')
    await brokenCounts.page.waitForFunction(() => document.querySelector('#first-build a[href*="rose"] .starter-stats')?.textContent.includes('cubes'))
    assert.match(await brokenCounts.page.locator('#first-build a[href*="emerald"] .starter-stats').textContent(), /up to 8 paint colors/)
    await brokenCounts.page.locator('#first-build a[href*="emerald"]').click()
    await brokenCounts.page.locator('.guide .totals').waitFor()
    observed.checks.push('optional-count-failure-guide-usable')
  } finally { await brokenCounts.context.close() }

  const brokenDemo = await pageIn(browser, { fail: ['/textures/items/rose.png'] })
  try {
    await near(brokenDemo.page, '.demo .stage')
    await brokenDemo.page.getByText("The preview couldn't load. Every guide still works.", { exact: true }).waitFor()
    assert.match(await brokenDemo.page.locator('.demo .actions a').getAttribute('href'), /\/item\/rose\?/)
    await brokenDemo.page.getByRole('group', { name: 'Preview a build', exact: true }).getByRole('button', { name: 'Poppy', exact: true }).evaluate(el => el.click())
    await settled(brokenDemo.page)
    assert.match((await snapshot(brokenDemo.page)).summary, /Poppy/)
    observed.checks.push('optional-preview-failure-and-reselection')
  } finally { await brokenDemo.context.close() }

  const animation = await pageIn(browser, { motion: true })
  try {
    await select(animation.page, 'diamond_ore', '3d'); await near(animation.page, '.demo .stage'); await settled(animation.page)
    await animation.page.locator('.demo canvas').waitFor()
    await animation.page.locator('.demo .actions button').evaluate(el => el.click())
    await animation.page.waitForFunction(() => window.__renderCalls > 5)
    const during = await animation.page.evaluate(() => window.__renderCalls)
    await animation.page.waitForTimeout(100)
    assert(await animation.page.evaluate(() => window.__renderCalls) > during)
    await animation.page.waitForTimeout(2500)
    const finished = await animation.page.evaluate(() => window.__renderCalls)
    await animation.page.waitForTimeout(100)
    assert.equal(await animation.page.evaluate(() => window.__renderCalls), finished, 'Replay did not settle')
    observed.checks.push('replay-animation-settles')
  } finally { await animation.context.close() }

  let release
  const held = new Promise(resolve => { release = resolve })
  const rapid = await pageIn(browser, { holdBlock: held })
  try {
    await select(rapid.page, 'diamond_ore', '3d'); await near(rapid.page, '.demo .stage')
    await rapid.page.waitForFunction(() => window.__decodeStarts.includes('/textures/blocks/diamond_ore.png'))
    await rapid.page.getByRole('group', { name: 'Preview a build', exact: true }).getByRole('button', { name: 'Rose', exact: true }).evaluate(el => el.click())
    await settled(rapid.page)
    const rose = await snapshot(rapid.page)
    release()
    await rapid.page.waitForFunction(() => window.__pixelDecodes.includes('/textures/blocks/diamond_ore.png'))
    await twoFrames(rapid.page)
    assert.deepEqual(await snapshot(rapid.page), rose, 'Late block replaced the selected flower')
    observed.checks.push('latest-selection-wins')
  } finally { release(); await rapid.context.close() }

  await browser.close()
  browser = await chromium.launch({ channel: values.channel, headless: true, args: ['--disable-webgl'] })
  const flat = await pageIn(browser)
  try {
    await select(flat.page, 'steve', '3d'); await near(flat.page, '.demo .stage'); await settled(flat.page)
    await flat.page.locator('.demo .actions button').evaluate(el => el.click())
    await flat.page.locator('.demo .board.built').waitFor()
    const board = await flat.page.locator('.demo .board .cube').evaluateAll(cells => cells.map(c => [c.style.gridColumn, c.style.gridRow, c.style.background]))
    observed.noWebGL = { ...(await snapshot(flat.page)), boardHash: hash(board), cubes: board.length }
    if (reference) assert.deepEqual(untagged(observed.noWebGL), untagged(reference.noWebGL))
    await checkGuide(flat.page, observed.noWebGL.summary)
    observed.checks.push('no-webgl-flat-fallback')
  } finally { await flat.context.close() }

  const file = values.baseline ? referenceFile : values.output
  writeJson(file, { schemaVersion: 1, browser: browser.version(), baseline: values.baseline, narrow: values.mobile, behavior: observed })
  console.log(`Saved homepage proof to ${file}`)
} finally {
  await browser?.close()
  await server.close()
}
