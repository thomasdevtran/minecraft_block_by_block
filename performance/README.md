# Performance measurements

The first phase adds measurements and CI gates, then makes the skin processor lazy within `fetchSkinByUsername`. It leaves account ownership checks, stored skin/progress formats, engine output and the UI unchanged.

## First-phase results — 17 November 2026

Unconditional startup JS fell from **55,697 to 51,012 gzip bytes** (54.4 to 49.8 KiB), a saving of **4,685 bytes / 8.4%**. The support route no longer fetches the skin/model/pixels/voxels chunks. All existing route JS budgets pass. Routes that need the engine still load it; small shared-chunk wrapper changes are included in the report.

Verification passed: **255 tests**, catalog validation, TypeScript, production build, bundle budgets, and **346 browser samples**. Before/after guide material totals match. Browser checks cover catalog search/filter/paging/history, guide navigation, local skin restoration, actual PNG upload and a fixture username lookup. The separate build without account configuration contains no Supabase SDK. Private-image clearing/account switching remain covered by unit tests.

With the deployed immutable asset header simulated, five-run desktop medians were:

| Page | Before cold / warm ready (ms) | After cold / warm ready (ms) |
| --- | --- | --- |
| Support | 1,180 / 490 | 1,109 / 480 |
| Flat item guide | 1,903 / 828 | 1,844 / 822 |
| 3D skin guide | 1,511 / 591 | 1,556 / 584 |

Cached guide reloads stay within the baseline ranges. The cold skin guide adds about 45 ms in this local HTTP/1 test; this is a loading tradeoff of deferring its engine, not an engine-output change. Plain Vite preview additionally makes some warm guides about one network-latency batch slower through asset revalidation; both modes are retained. One mobile skin sample was a 3.9 s outlier, and its full range is retained. These measurements establish a baseline and a startup-byte reduction, not an across-the-board or field load-time improvement.

[browser-baseline.json](browser-baseline.json) contains the before/after medians, ranges, LCP/CLS observations, long tasks, transfer totals, coverage and limitations. Each metric array is `[median, minimum, maximum]`. The immutable-cache baseline was rebuilt in an isolated output directory with the original skin store from `28de926`; its `index.html` SHA-256 exactly matched the original captured build. Current source files and production output were not replaced for that comparison.

## Build budgets

```sh
npm run build
npm run check:bundle
```

The build writes Vite's `.vite/manifest.json`. The checker traverses **static** imports recursively, handles cycles, and counts shared JS and CSS files once per group. Startup includes the entry and HTML preloads. Each route includes startup plus that route's static dependencies. Other dynamic entries are listed separately; they are not all loaded on every visit.

- Startup JS retains its existing **85 KiB gzip** hard ceiling.
- Each existing route's JS ceiling is its pre-refactor total in `bundle-baseline.json` plus **1 KiB** for small module-wrapper/build-configuration differences. This is not space for an additional dependency. New lazy routes need a reviewed baseline entry.
- CSS is reported separately; it currently has no hard budget.
- The checker writes `dist/performance-bundle.json`, including when a size gate fails. CI runs the checker after building and uploads that report.
- `bundle-baseline.json` records the production build **before** the skin change, with the project's local account configuration. It contains file names and sizes, not environment values. Keep this comparison until a deliberate review changes the baseline. `--report path.json` selects another output; it does not automatically update the reviewed baseline.

Gzip estimates use Node's `gzipSync` defaults. These are reproducible bundle comparisons, not measurements of CDN compression or full page transfers. Photos, fonts, catalog/shape JSON, textures and viewport-triggered dynamic work are measured in the browser run instead. The full public directory is not a first-visit payload.

## Repeatable browser runs

Playwright is a development-only dependency; no browser automation code ships to visitors. Install its Chromium once, or use an already installed browser channel:

```sh
npx playwright install chromium
npm run perf:browser -- --runs 5 --profile desktop --output performance/runs/desktop.json
npm run perf:browser -- --runs 5 --profile mobile --output performance/runs/mobile.json
# Windows with Microsoft Edge already installed:
npm run perf:browser -- --channel msedge --runs 5 --profile desktop --output performance/runs/edge-desktop.json
```

Build first. The runner starts and closes a local production preview at `127.0.0.1:4175`, launches a fresh browser, and uses a fresh context per scenario/repetition. It samples a cold visit and a warm reload in the same context. No request routing is installed during timed runs, so browser HTTP caching remains enabled. It resets guide progress between samples and seeds the public bundled Steve fixture as a local skin. No account session is supplied; hosted Supabase requests are blocked. This is a signed-out frontend baseline, not a hosted Auth/API integration test.

Defaults: desktop 1280×800 at DPR 1, or mobile 390×844 at DPR 2 with touch/mobile emulation; 4× CPU slowdown; 150 ms network latency; 200,000 bytes/s down and 93,750 bytes/s up; normal motion. Each run records the exact browser version, Node version and settings. The production preview serves uncompressed localhost responses, so these transfer totals do not represent Vercel. Compare before/after with the same browser and settings on an otherwise idle machine.

The ready time is when a DOM observer first sees the scenario's content: catalog tile, support heading, or written-guide materials totals. It is distinct from LCP and from a paint timing. LCP, CLS session maximum, long tasks and completed resource timings are observed until **1.5 seconds after ready**. Outstanding requests are listed explicitly; optional previews can still be downloading. LCP/CLS here are windowed lab observations, not field Core Web Vitals results. Warm reloads retain HTTP cache but regenerate the guide. Resource transfer sizes include HTTP overhead and can be zero for cache hits.

Plain Vite preview revalidates hashed assets on reload. `--immutable-assets` instead adds the existing Vercel `/assets/` cache header inside this runner's preview middleware. It leaves application/deployment configuration unchanged. Compare like-for-like cache modes: fewer startup bytes can still produce another batch of conditional requests in the local revalidation mode. The immutable mode approximates the deployed asset policy; it does not emulate a CDN or prove hosted cache behavior. Reports label this setting explicitly.

The runner checks page errors, viewport overflow and unexpected SDK requests. It also exercises search, category filters, Show more, an actual catalog-to-guide navigation, history restoration, and guide Start/Back. Action times include automation dispatch and two animation frames; they are **not field INP**. Timings are informational, rather than noisy CI gates.

For shorter comparisons or an unconfigured-account build:

```sh
npm run perf:browser -- --channel msedge --scenarios support,catalog,skin-3d --runs 5 --profile mobile --output performance/runs/mobile-critical.json
npm run perf:browser -- --channel msedge --dist scripts/.cache/performance-no-accounts --scenarios support,flat-item,skin-3d --runs 1 --output performance/runs/no-accounts.json
npm run perf:browser -- --channel msedge --scenarios skin-3d --runs 1 --verify-skins --output performance/runs/skin-integration.json
npm run perf:browser -- --channel msedge --scenarios support,catalog,flat-item --runs 5 --immutable-assets --output performance/runs/deployment-cache.json
```

Create that separate unconfigured-account build without editing `.env.local`:

```sh
node --input-type=module -e "process.env.VITE_SUPABASE_URL=''; process.env.VITE_SUPABASE_PUBLISHABLE_KEY=''; await (await import('vite')).build({build:{outDir:'scripts/.cache/performance-no-accounts'}})"
```

`--verify-skins` additionally uploads the bundled PNG through the real file input and performs a username lookup against a local intercepted API fixture. Interception starts only after the timed samples in that context. It proves frontend integration without contacting Mojang. Actual upstream and hosted-service behavior still requires its own environment.

Raw runs belong in ignored `performance/runs/`. `browser-baseline.json` holds the reviewed before/after summaries and coverage limits. Build output may be deleted by a new build, so save browser runs outside `dist` when comparing two builds.

## Correctness checks

```sh
npm test
npm run check:catalog
npm run build
npm run check:bundle
```

The new regression tests prove static dependency deduplication, startup/route budget failures, deferred skin processing, image validation before encoding, retry behavior and unchanged server errors. Existing tests retain private-skin restoration, sign-out/account-switch clearing, saved-build handling and pure engine output checks.

The existing release audit remains enabled. On this phase's local check it reports 11 high-severity dependency findings; auditing the original lockfile gives the same findings, and Playwright introduces none. These findings are separate from the passing build/bundle checks; no audit bypass or unrelated dependency downgrade is included here.
