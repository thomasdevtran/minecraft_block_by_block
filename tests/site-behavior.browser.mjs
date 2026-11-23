/** Catalog navigation and deferred-counter lifecycle against a production build. */
import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { readJson, startPreview } from './browser-support.mjs'

const { values } = parseArgs({ options: {
  dist: { type: 'string', default: 'dist' }, channel: { type: 'string' },
} })
const catalog = readJson('public/data/items.json')
const server = await startPreview(values.dist)
let browser

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    let nextId = 0
    window.__idleJobs = new Map()
    window.requestIdleCallback = callback => {
      window.__idleJobs.set(++nextId, callback)
      return nextId
    }
    window.cancelIdleCallback = id => window.__idleJobs.delete(id)
    window.__runIdle = () => {
      const jobs = [...window.__idleJobs.values()]
      window.__idleJobs.clear()
      for (const callback of jobs) callback({ didTimeout: false, timeRemaining: () => 50 })
    }
  })
  const page = await context.newPage()
  page.on('pageerror', error => { throw error })
  return { context, page }
}

async function catalogNavigation() {
  const { context, page } = await newPage()
  try {
    await page.goto(server.base)
    await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 60)
    const search = page.getByRole('searchbox', { name: 'Search items' })
    await search.fill('DIAMOND_sword')
    await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 1)
    assert.equal(await page.locator('#catalog .tile').getAttribute('href'), '/item/diamond_sword')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'DIAMOND_sword')
    await page.waitForFunction(() => document.querySelector('#catalog [role=status]')?.textContent.startsWith('1 build matching'))
    await search.fill('')
    await page.getByRole('group', { name: 'Filter by kind' }).getByRole('button', { name: 'Plants', exact: true }).click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get('kind') === 'plant')
    const groupNames = catalog.groups.plant.map(name => ({ name, count: catalog.items.filter(item => item.category === 'plant' && item.group === name).length })).filter(group => group.count)
    const options = await page.locator('.mobile-type-filter option').allTextContents()
    assert.deepEqual(options, [
      `All plants (${catalog.items.filter(item => item.category === 'plant').length})`,
      ...groupNames.map(group => `${group.name} (${group.count})`),
    ])
    await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: /^Flowers / }).click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get('type') === 'Flowers')
    const expected = catalog.items.filter(item => item.category === 'plant' && item.group === 'Flowers').slice(0, 60).map(item => item.id)
    const actual = await page.locator('#catalog .tile').evaluateAll(tiles => tiles.map(tile => new URL(tile.href).pathname.split('/').pop()))
    assert.deepEqual(actual, expected)
    await page.reload()
    await page.waitForFunction(() => document.querySelector('[aria-label="Filter by type"] button[aria-pressed=true]')?.textContent.includes('Flowers'))
    await page.getByRole('group', { name: 'Filter by kind' }).getByRole('button', { name: 'All', exact: true }).click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('kind'))
    await page.getByRole('button', { name: /^Show more/ }).click()
    assert.equal(await page.locator('#catalog .tile').count(), 120)
    await page.locator('#catalog .tile').first().click()
    await page.locator('.guide .totals').waitFor()
    await page.goBack()
    await page.waitForFunction(() => document.querySelectorAll('#catalog .tile').length === 120)
    console.log('Verified catalog search, counts, filter URLs, reload and Show more/Back restoration')
  } finally { await context.close() }
}

async function counterLifecycle(startBeforeLeaving) {
  const { context, page } = await newPage()
  let requests = 0
  let release
  const held = new Promise(resolve => { release = resolve })
  try {
    await context.route('**/api/stats', async route => {
      assert.equal(route.request().method(), 'GET')
      requests++
      await held
      await route.fulfill({ json: { total: 1234, updatedAt: '', method: 'fixture', accuracy: 'fixture' } })
    })
    await page.goto(`${server.base}/support`)
    // Idle jobs: the footer and Support page visitor counters, and offline-guide registration (lib/offline.ts).
    await page.waitForFunction(() => window.__idleJobs.size === 3)
    if (startBeforeLeaving) {
      const request = page.waitForRequest('**/api/stats')
      await page.evaluate(() => window.__runIdle())
      await request
    }
    await page.locator('header a[href="/skin"]').click()
    await page.waitForFunction(() => location.pathname === '/skin' && !document.querySelector('.support'))
    assert.equal(await page.evaluate(() => window.__idleJobs.size), startBeforeLeaving ? 0 : 2)
    if (!startBeforeLeaving) {
      assert.equal(requests, 0)
      const request = page.waitForRequest('**/api/stats')
      await page.evaluate(() => window.__runIdle())
      await request
    }
    release()
    await page.waitForFunction(() => document.querySelector('footer .visitors .count')?.textContent === '1,234')
    assert.equal(requests, 1, 'Counters must reuse the shared request')
    console.log(`Verified counter unmount ${startBeforeLeaving ? 'during shared request' : 'before idle'}`)
  } finally {
    release()
    await context.close()
  }
}

try {
  browser = await chromium.launch({ channel: values.channel, headless: true, args: ['--disable-webgl'] })
  await catalogNavigation()
  await counterLifecycle(false)
  await counterLifecycle(true)
} finally {
  await browser?.close()
  await server.close()
}
