import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { Manifest } from 'vite'
import { budgetFailures, bundleReport, ROUTE_HEADROOM, STARTUP_BUDGET, staticChunks } from '../scripts/check-bundle.ts'

describe('bundle accounting', () => {
  const manifest: Manifest = {
    'index.html': { file: 'assets/main.js', isEntry: true, imports: ['shared'], dynamicImports: ['src/views/Test.vue', 'preview'], css: ['assets/main.css'] },
    shared: { file: 'assets/shared.js', imports: ['index.html'], css: ['assets/main.css'] },
    'src/views/Test.vue': { file: 'assets/route.js', isDynamicEntry: true, imports: ['shared'], css: ['assets/route.css'] },
    preview: { file: 'assets/preview.js', isDynamicEntry: true },
  }

  it('deduplicates shared and cyclic imports without following dynamic imports', () => {
    expect(staticChunks(manifest, ['index.html', 'src/views/Test.vue'])).toEqual(['index.html', 'shared', 'src/views/Test.vue'])
    expect(() => staticChunks(manifest, ['missing'])).toThrow('Missing manifest chunk')
  })

  it('accounts for route JS and CSS and fails both startup and route regressions', () => {
    const dist = mkdtempSync(join(tmpdir(), 'bundle-budget-'))
    try {
      mkdirSync(join(dist, '.vite'))
      mkdirSync(join(dist, 'assets'))
      writeFileSync(join(dist, '.vite/manifest.json'), JSON.stringify(manifest))
      writeFileSync(join(dist, 'index.html'), '<script type="module" src="/assets/main.js"></script><link rel="modulepreload" href="/assets/shared.js">')
      for (const file of ['main.js', 'shared.js', 'route.js', 'preview.js', 'main.css', 'route.css']) {
        writeFileSync(join(dist, 'assets', file), file)
      }
      const report = bundleReport(dist)
      expect(report.startup.js).toEqual(['assets/main.js', 'assets/shared.js'])
      expect(report.startup.jsGzipBytes).toBe(gzipSync('main.js').length + gzipSync('shared.js').length)
      expect(report.routes['src/views/Test.vue']!.css).toEqual(['assets/main.css', 'assets/route.css'])
      expect(report.routes['src/views/Test.vue']!.js).toEqual(['assets/main.js', 'assets/route.js', 'assets/shared.js'])
      expect(report.deferred.preview!.js).toEqual(['assets/preview.js'])
      expect(budgetFailures(report, report)).toEqual([])
      const grown = structuredClone(report)
      grown.startup.jsGzipBytes = STARTUP_BUDGET + 1
      grown.routes['src/views/Test.vue']!.jsGzipBytes += ROUTE_HEADROOM + 1
      expect(budgetFailures(grown, report)).toHaveLength(2)
      expect(budgetFailures(report, { ...report, routes: {} })).toEqual([expect.stringContaining('No reviewed route baseline')])
    } finally {
      // This is the exact fresh directory returned by mkdtemp above, under the OS temp directory.
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
