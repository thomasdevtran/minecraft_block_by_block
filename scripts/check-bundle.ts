/** Run after the production build: npm run check:bundle [-- --report path.json]. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { parseArgs } from 'node:util'
import type { Manifest } from 'vite'

/** Retain the existing ceiling; do not raise it just to make CI pass. */
export const STARTUP_BUDGET = 85 * 1024
// Allows small module-wrapper / build-environment differences, not a new dependency.
export const ROUTE_HEADROOM = 1024

export interface BundleGroup {
  js: string[]
  css: string[]
  jsBytes: number
  jsGzipBytes: number
  cssBytes: number
  cssGzipBytes: number
}

export interface BundleReport {
  schemaVersion: 1
  startup: BundleGroup
  routes: Record<string, BundleGroup>
  deferred: Record<string, BundleGroup>
}

/** Static closure only: dynamic imports are measured separately, never charged to every route. */
export function staticChunks(manifest: Manifest, roots: string[]): string[] {
  const seen = new Set<string>()
  function visit(key: string) {
    if (seen.has(key)) return
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`)
    seen.add(key)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }
  roots.forEach(visit)
  return [...seen].sort()
}

export function bundleReport(dist: string): BundleReport {
  const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8')) as Manifest
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const urls = [
    ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
    ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
  ].map(match => match[1]!.replace(/^\//, ''))
  const entries = Object.keys(manifest).filter(key => manifest[key]!.isEntry)
  if (!entries.length || !urls.length) throw new Error('No entry script found. Run npm run build first.')
  const htmlChunks = urls.map(url => {
    const key = Object.keys(manifest).find(key => manifest[key]!.file === url)
    if (!key) throw new Error(`HTML script missing from manifest: ${url}`)
    return key
  })
  const startupRoots = [...new Set([...entries, ...htmlChunks])]
  const measured = new Map<string, { bytes: number; gzipBytes: number }>()
  function sizes(files: string[]) {
    let bytes = 0
    let gzipBytes = 0
    for (const file of files) {
      if (!measured.has(file)) {
        const data = readFileSync(join(dist, file))
        measured.set(file, { bytes: data.length, gzipBytes: gzipSync(data).length })
      }
      const size = measured.get(file)!
      bytes += size.bytes
      gzipBytes += size.gzipBytes
    }
    return { bytes, gzipBytes }
  }
  function group(roots: string[]): BundleGroup {
    const chunks = staticChunks(manifest, roots).map(key => manifest[key]!)
    const js = [...new Set(chunks.map(chunk => chunk.file))].sort()
    const css = [...new Set(chunks.flatMap(chunk => chunk.css ?? []))].sort()
    const j = sizes(js)
    const c = sizes(css)
    return { js, css, jsBytes: j.bytes, jsGzipBytes: j.gzipBytes, cssBytes: c.bytes, cssGzipBytes: c.gzipBytes }
  }
  const routes: BundleReport['routes'] = {}
  const deferred: BundleReport['deferred'] = {}
  for (const key of Object.keys(manifest).sort()) {
    if (!manifest[key]!.isDynamicEntry) continue
    if (key.startsWith('src/views/')) routes[key] = group([...startupRoots, key])
    else deferred[key] = group([key])
  }
  return { schemaVersion: 1, startup: group(startupRoots), routes, deferred }
}

export function budgetFailures(report: BundleReport, baseline?: BundleReport): string[] {
  const failures: string[] = []
  if (report.startup.jsGzipBytes > STARTUP_BUDGET) failures.push(`Startup JS exceeds ${STARTUP_BUDGET} gzip bytes.`)
  if (baseline) {
    for (const [route, group] of Object.entries(report.routes)) {
      const before = baseline.routes[route]
      if (!before) failures.push(`No reviewed route baseline for ${route}.`)
      else if (group.jsGzipBytes > before.jsGzipBytes + ROUTE_HEADROOM) {
        failures.push(`${route} exceeds its baseline + ${ROUTE_HEADROOM} bytes (${group.jsGzipBytes} > ${before.jsGzipBytes + ROUTE_HEADROOM}).`)
      }
    }
  }
  return failures
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { report: { type: 'string' } } })
  const report = bundleReport('dist')
  const output = values.report ?? 'dist/performance-bundle.json'
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  const baselinePath = 'performance/bundle-baseline.json'
  if (!existsSync(baselinePath)) throw new Error(`Missing reviewed baseline: ${baselinePath}`)
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BundleReport
  const kib = (bytes: number) => (bytes / 1024).toFixed(1)
  console.log(`Startup JS: ${kib(report.startup.jsGzipBytes)} KiB gzip (budget ${kib(STARTUP_BUDGET)} KiB).`)
  for (const [route, group] of Object.entries(report.routes)) {
    console.log(`${route}: ${kib(group.jsGzipBytes)} KiB JS + ${kib(group.cssGzipBytes)} KiB CSS gzip (entry + static route dependencies).`)
  }
  console.log(`Report: ${output}. Dynamic work and actual transfers are recorded separately by perf:browser.`)
  const failures = budgetFailures(report, baseline)
  if (failures.length) {
    failures.forEach(failure => console.error(failure))
    process.exitCode = 1
  }
}
