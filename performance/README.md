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

## Guide resource phase — 18 November 2026

RF-03 now selects model inputs by the effective view, look and pot setting. The cache belongs to one open guide, shares pending/successful work across settings, and clears on item changes/unmount. Failures remain retryable. Separate catalog/resource request tokens prevent late results or errors from replacing the current guide.

| Selected build | Pixel inputs decoded | Shape JSON |
| --- | --- | --- |
| Flat item, block or craft shape | Sprite | None |
| 3D full block | Six-face strip | None |
| Flower, either view | Sprite; pot only when selected | None |
| 3D craft shape | None | Selected shape |

Visible header images continue to load normally. A 3D shape's sprite is displayed in its header, but is no longer separately decoded through canvas. Shape dimensions and hollow counts still appear in 3D settings; flat settings do not need the full geometry. Recipe generation, storage keys and engine version are unchanged.

Compared with the phase-one build (`bc2b5b0`), five cold and five warm desktop runs per case produced these results:

| Case | Cold ready median before → after | Unneeded cold asset transfer removed |
| --- | --- | --- |
| Flat Diamond Ore | 1,903 → 1,889 ms | Face strip: 3,856 bytes |
| Flat Chest | 1,905 → 1,879 ms | Shape JSON: 7,721 bytes |
| Unpotted Poppy | 1,858 → 1,859 ms | Pot: 1,128 bytes |
| Potted Poppy | 1,886 → 1,888 ms | None; both inputs are required |

The flat Chest also avoids parsing/validating **74,312 decoded JSON bytes**. Transfer figures include local HTTP overhead; the JSON body was compressed to 7,421 bytes. Timings overlap baseline ranges, so the strongest demonstrated improvement is eliminating unnecessary requests/decoding and reusing successful inputs, rather than a general load-time speedup. The run metadata's earlier “uncompressed” wording has been corrected; existing recorded encoded/decoded sizes and timings were already valid.

Startup remains **49.8 KiB gzip** (51,012 → 51,010 bytes). The item route adds **269 gzip bytes** for the conditional loader/cache (80,290 → 80,559); every existing budget passes without adjustment.

Verification: **270 tests**, catalog validation, TypeScript/build/budget checks, **80 timed browser samples**, and identical output for **390 written states across 15 configurations**, checked at 1280 px and 390 px. These comparisons include every materials/paint/build state, classic textures, hollow/solid shapes and blocks, and flat/3D potted flowers. Browser checks also cover unused-resource failures, required-image retry, reuse, saved progress, late shape success/failure, route-prop changes and unmount during loading. Written-state checks disable WebGL and reduce motion; timed runs retain normal motion/WebGL. Narrow checks verify behavior/overflow, not phone performance.

[guide-resources-baseline.json](guide-resources-baseline.json) contains the before/after ranges, removed resources, verification results and committed SHA-256 guide contracts. Raw runs and detailed per-step fingerprints stay under ignored `performance/runs/`.

After building, run the behavior checker against those committed contracts:

```sh
# Uses Playwright Chromium after the installation described below:
npm run check:guide-resources
npm run check:guide-resources -- --mobile --output performance/runs/phase2-mobile-checks.json
# Or use installed Edge on Windows:
npm run check:guide-resources -- --channel msedge
```

To repeat the timing comparison, build the phase-one commit in a separate output/checkout and pass that directory to the current tooling with `--dist`. The reference used here is preserved locally at `scripts/.cache/phase2-before`. Keep the reviewed contracts unchanged when checking a refactor.

```sh
npm run perf:browser -- --channel msedge --dist scripts/.cache/phase2-before --runs 5 --scenarios flat-block,flat-shape,flower,potted-flower --output performance/runs/phase2-before.json
npm run perf:browser -- --channel msedge --runs 5 --scenarios flat-block,flat-shape,flower,potted-flower --output performance/runs/phase2-after.json
```

`check:guide-resources -- --baseline --dist <reference-output>` captures a detailed reference in `performance/runs/phase2-reference.json`; it does not overwrite the reviewed contracts. `--reference <file>` allows an explicit reference file for comparisons. Both the original application build and current build are checked using the current test tooling.

## Homepage work phase — 18 November 2026

RF-04 defers optional starter counts until `#first-build` comes within **200 px** of the viewport. It uses the existing one-shot observer: completed counts survive scrolling away/back, and pending results are discarded if their catalog/list or component changes. Cards, fallback text and links remain available while counts are pending or fail.

The demo keeps its existing near-stage trigger, default **2D** selection, replay/intro timing, current-texture recipes and rotatable flat view. A shared homepage loader now selects its generator:

| Selection | Generators loaded |
| --- | --- |
| Flat item/block/flower, or a plain item in 3D mode | Flat item |
| 3D flower | Flower |
| 3D block | Block; decode its strip without first decoding its flat sprite |
| 3D Steve | Skin |
| Flat Steve | Skin-front projection and flat item |

The CSS cube icon previously imported its face-order constant from the block generator, bringing model code into the initial catalog. That constant now lives in `engine/voxels.ts`; the existing `engine/block.ts` export remains available. The order and appearance are unchanged, and the initial catalog no longer imports the generator merely to draw an icon.

The catalog's static JS falls from **64,527 to 61,695 gzip bytes**: **2,832 bytes / 4.4% less**. Entry JS increases by **79 gzip bytes** (51,010 → 51,089, about 49.9 KiB) because the split changes shared preload metadata. All existing budgets pass unchanged. In a short viewport with both sections beyond their margins, initial pixel/model work drops from three starter sprites to **zero**, and no model/pixels/generator/renderer chunk is requested. When a section is already near, it still starts immediately.

Five-run local catalog-ready medians, before → after:

| Profile | Cold | Warm |
| --- | --- | --- |
| Desktop 1280×800 | 1,361 → 1,385 ms | 1,029 → 1,041 ms |
| Mobile emulation 390×844 | 1,377 → 1,385 ms | 1,045 → 1,050 ms |

The ranges overlap and timings are similar; this phase demonstrates less eager code/work rather than a general latency improvement. These 40 samples use the same CPU/network settings as the existing baseline. Catalog-ready time precedes completion of optional widgets. Ordinary reference images can still load independently of model processing.

Verification passed: **280 tests**, catalog validation, TypeScript/build/bundle checks, and all **10 demo combinations** against their previous summaries, paint swatches, icon faces and guide links at desktop and 390 px widths. Actual linked guides match demo cube/paint counts. Browser checks also exercise replay animation settling, rotation, reduced motion, a late model response after reselection, missing IntersectionObserver/WebGL, count failures and preview failures. The existing **390 written-guide state contracts** still pass after the constant move.

[homepage-baseline.json](homepage-baseline.json) records metrics, coverage, before/after scheduling evidence and repeatable behavior contracts. Its reference is the completed guide-resource working tree, including the preceding uncommitted phase; that state was built into `scripts/.cache/phase3-before` before these edits. Earlier guide-resource work remains intact.

```sh
# After npm run build and the Playwright browser setup below:
npm run check:homepage
npm run check:homepage -- --mobile --output performance/runs/phase3-mobile-checks.json
# Or installed Edge on Windows:
npm run check:homepage -- --channel msedge

npm run perf:browser -- --channel msedge --runs 5 --scenarios catalog --output performance/runs/phase3-after-desktop.json
npm run perf:browser -- --channel msedge --runs 5 --profile mobile --scenarios catalog --output performance/runs/phase3-after-mobile.json
```

The behavior checker uses short 200 px-high windows to put both sections outside their **real** viewport margins, rather than mocking intersection. It chooses each demo in a fresh page before approaching the stage, then checks the actual requested generator chunks. Functional rendering uses software WebGL; timing runs use the existing normal renderer configuration. `--baseline --dist <reference-output>` captures a detailed reference under ignored `performance/runs/phase3-reference.json`; `--reference <file>` selects an explicit comparison. Default checks use the committed contracts and do not need local capture files.

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

Defaults: desktop 1280×800 at DPR 1, or mobile 390×844 at DPR 2 with touch/mobile emulation; 4× CPU slowdown; 150 ms network latency; 200,000 bytes/s down and 93,750 bytes/s up; normal motion. Each run records the exact browser version, Node version and settings. Preview can compress responses; Resource Timing records both encoded transfer and decoded sizes. These localhost measurements do not represent Vercel. Compare before/after with the same browser and settings on an otherwise idle machine.

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
npm run check:site-behavior -- --channel msedge
```

## Catalog and cleanup comparison — 18 November 2026

Catalog search/indexing now belongs to `src/lib/catalogIndex.ts`, loaded with the catalog route. The shared catalog loader and asset URLs stay small for other routes. Queries are normalized once per change, category/group counts are built once per catalog replacement, and featured/starter lookups use an ID map. The catalog root uses shallow reactivity; metadata is replaced as a whole. Search matching, ordering, filter URLs, pagination and guide generation stay unchanged.

Functional browser checks share preview lifecycle, JSON/hash utilities and pixel-decode observation in `tests/browser-support.mjs`. Viewports, WebGL modes and failure fixtures remain in their scenario files. The timed runner remains independent. Visitor counters cancel queued idle work and discard late local updates on unmount, while preserving the request shared with other counters.

Compared with an isolated build immediately before these merges, startup JavaScript decreased from 51,067 to 50,600 gzip bytes. Catalog's static route total increased from 61,443 to 61,604 bytes for the metadata index; other routes decreased by 464–471 bytes. Existing budgets remain unchanged. These byte differences do not establish browser load-time gains.

Run the metadata CPU comparison with `npm run perf:catalog`. It asserts identical ordered search results and group counts against the original algorithms before timing. On Node v24.12.0, medians of seven samples were:

| Work (milliseconds) | 1,117 entries before → after | Synthetic 10,000 entries before → after |
| --- | --- | --- |
| Build search metadata/index once | 0.929 → 1.044 | 7.529 → 9.421 |
| 105 searches (seven queries × 15 repeats) | 18.950 → 4.271 | 168.313 → 35.111 |
| 300 category/group selections | 8.882 → 0.011 | 76.554 → 0.003 |

These are Node CPU measurements, excluding Vue rendering, networking and texture work. The index adds a small one-time cost and extra references in exchange for cheaper repeated searches and tab changes. Sub-millisecond group lookups are timer-scale observations; no timing threshold is enforced in CI. Raw comparisons are saved to ignored `performance/runs/catalog-processing.json` and `merge-bundle.json`.

The production navigation/lifecycle check runs with `npm run check:site-behavior -- --channel msedge` (omit the channel for Playwright Chromium). It verifies search announcements, category/group counts, filter URLs/reload, Show more/Back restoration, leaving before idle, and leaving during a shared stats request. The before build fails the idle-cancellation check; the refactored build passes. The existing homepage and written-guide contracts remain the preservation checks for deferred resources and engine output.

Validation passed: 284 unit/integration tests, catalog validation, production build/type-check, unchanged bundle budgets, navigation/lifecycle checks, ten demo combinations with matching linked guides at desktop and 390px widths, and all 390 written-guide states plus resource failure/retry checks. No behavior reference files were regenerated for this cleanup.

The new regression tests prove static dependency deduplication, startup/route budget failures, deferred skin processing, image validation before encoding, retry behavior and unchanged server errors. Existing tests retain private-skin restoration, sign-out/account-switch clearing, saved-build handling and pure engine output checks.

The existing release audit remains enabled. On this phase's local check it reports 11 high-severity dependency findings; auditing the original lockfile gives the same findings, and Playwright introduces none. These findings are separate from the passing build/bundle checks; no audit bypass or unrelated dependency downgrade is included here.
