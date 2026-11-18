# Performance and scalability refactoring spec

Date: 17 November 2026 (America/Los_Angeles). Baseline commit: `28de926`.
Status: phase 1 implemented and verified locally: bundle/route reporting, CI budgets, browser baselines and lazy skin processing. Startup JS is 49.8 KiB gzip, down from 54.4 KiB. See [performance/README.md](performance/README.md) for measurements, timing tradeoffs, verification and hosted-check limits; later phases remain in the backlog below.

## Objective and scope

Reduce the work required to open the catalog and written guides, keep interactions responsive as builds and the catalog grow, and establish checks that prevent future regressions. Preserve the current design, guide output, navigation, saved progress, account boundaries, and deployment behavior.

The audit and size table below describe the pre-refactor application. Priorities are based on source inspection and a fresh local production build. Follow-on browser measurements live under `performance/`; memory, CDN behavior, and hosted database capacity have not been measured in the initial audit. A large file or bundle is evidence of work to investigate, not proof of a user-visible delay.

## Architecture and existing safeguards

| Area | Current ownership | Preserve |
| --- | --- | --- |
| Application | Vue 3 + TypeScript; Vite 8; `src/main.ts`, `src/App.vue`, `src/router.ts` | Lazy route components; early, shared catalog fetch; route metadata; old-deployment chunk recovery |
| Catalog | `src/views/CatalogView.vue`, `src/lib/catalog.ts`, generated `public/data/items.json` | Search aliases, category/group order, URL filters, 60-item Show more, history/scroll restoration |
| Build computation | Pure TypeScript in `src/engine/` | Deterministic voxels, palettes, recipes, step ordering, and attachment information |
| Guide UI | Item/skin views, `GuideViewer.vue`, written instructions and print components | Written instructions independent of WebGL; progress persistence; compact Next/Back behavior |
| Preview | `BuildDemo.vue`, `VoxelPreview.vue`, viewport helpers in `src/lib/dom.ts` | Deferred three.js; event-driven rendering; coalesced step updates; GPU/observer cleanup; reduced motion |
| Accounts and data | Lazy Supabase client, auth/skin state, saved-build and community helpers | Account-switch guards, private images, revision checks, quotas and database access policies |
| Hosting | Vercel static assets + skin/stats functions; Supabase; Redis-backed counter when configured | Cache policies, security headers, retry/error messages; production frontend separated from API runtime |
| Maintenance | Asset extraction, catalog validation, Vitest, GitHub Actions | Generated assets committed; extraction excluded from deployment builds; disposable SQL checks |

The existing README records a preference for grouping related behavior rather than creating many single-purpose modules. Continue that approach: split code only when it establishes a real loading, lifecycle, or ownership boundary.

## Measured local baseline

Commands ran on Node `v24.12.0`, npm `11.6.2`, using installed dependencies and the existing lockfile. The working tree was clean before the audit.

| Check or artifact | Observed result |
| --- | --- |
| `npm test` | 250 tests passed across 23 files, including disposable database tests |
| `npm run check:catalog` | 1,117 catalog entries; 2,017 referenced PNGs; 10 craft shapes validated |
| `npm run build` | Passed, including notices generation and `vue-tsc -b` |
| `npx tsx scripts/check-bundle.ts` | Passed: 55,697 gzip bytes / **54.4 KiB** startup JavaScript, against an 85 KiB budget |
| Startup JS measurement scope | Entry script plus seven HTML modulepreloads; excludes route chunks and later dynamic requests |
| Catalog route chunk alone | 20,660 raw bytes; 8,058 gzip bytes (**7.9 KiB**) |
| three.js preview chunk alone | 560,176 raw bytes; 138,629 gzip bytes (**135.4 KiB**); lazy; Vite emits its >500 kB warning |
| Supabase SDK chunk alone | 216,011 raw bytes; 55,253 gzip bytes (**54.0 KiB**); dynamically loaded |
| Catalog JSON | Version `26.3`; 205,518 raw bytes; 21,703 gzip bytes (**21.2 KiB**) |
| Catalog categories | 618 items, 118 plants, 381 blocks |
| Public asset directory | 2,054 files; 3,952,377 raw bytes (**3.77 MiB**) total; textures account for 2,235,650 bytes |

Gzip values above use Node `gzipSync` defaults, matching the existing budget checker. Vite's displayed gzip estimates use slightly different compression settings. Neither is a measurement of actual CDN transfer. Route and SDK chunk numbers are individual files, not complete route totals. Public directory size is the deployed inventory, not the first-page download.

## Findings and priority list

| ID | Priority | Evidence | Required outcome |
| --- | --- | --- | --- |
| RF-01 | P0, first | `scripts/check-bundle.ts:13` defines 85 KiB; `.github/workflows/ci.yml:16-20` never runs it. It also excludes the dynamically loaded initial route. | Enforce the existing gate and record complete route-load baselines before runtime edits. |
| RF-02 | P1 | `App.vue` imports auth; `auth.ts:4` imports skin state; `skinStore.ts:2` imports `readSkinPng` from the skin engine. Fresh `dist/index.html` preloads skin, model, pixels, voxels and skin state on every route. | Keep shared skin state lightweight; load image validation/processing when needed. |
| RF-03 | P1 | `ItemGuideView.vue:126-138` awaits sprite, block strip, pot and shape together based on item capabilities, regardless of active view/pot settings. | Load and decode the assets required by the selected build and visible controls, without waiting for unrelated assets. |
| RF-04 | P1 | `CatalogView.vue:130-143` computes optional starter counts as soon as catalog data arrives. `BuildDemo.vue:75-77` imports all model branches together. | Schedule optional homepage work by visibility and load the engine branch the selected demo needs. |
| RF-05 | P2 | `CatalogView.vue:21` deeply wraps the catalog; category/group computations rescan it; `matchesCatalogSearch` normalizes/splits the same query for every item. | Keep catalog processing predictable as metadata grows, retaining explicit Show more. |
| RF-06 | P2, profile first | Guide models/steps compute synchronously; `VoxelPreview.vue:89` rebuilds geometry on role changes. Existing rendering is already event-driven and delayed two frames after step changes. | Identify main-thread bottlenecks and reduce repeated work without changing guide results. |
| RF-07 | P2, verify before changing | `assetUrl` uses only the game version; textures are immutable for a year. Shape JSON has shorter revalidation. README already warns about same-version texture edits. | Define and verify asset revision rules so a cache hit cannot silently serve an older build asset after an edit. |
| RF-08 | P3, growth-triggered | Community uses 20-row offset pages and selected columns; library uses 24-row offset pages with a 100-build quota. Relevant database indexes already exist. | Measure deep-page queries and service demand before changing pagination or schema. |

## Requirements and acceptance criteria

### RF-01 — Establish and enforce performance measurements

- Add a named npm command for the existing startup checker and run it in CI immediately after the production build. Retain the 85 KiB hard ceiling initially; do not raise it to accommodate a regression.
- Record a production-build manifest or equivalent dependency report. Walk static imports recursively and deduplicate shared chunks for each route. Report entry + route JS, CSS, catalog, photos, textures and conditional preview/SDK downloads separately. HTML preloads alone do not describe a complete first visit.
- Capture five repeatable browser runs per primary scenario using a fixed browser version, viewport, DPR, CPU/network throttle and cache state. Record these settings with the results, along with medians and ranges. Separate cold visits, warm reloads and in-app navigation.
- Primary scenarios: `/`; search/filter/Show more and Back; flat item; hollow and solid block; flat and 3D shaped build; potted/unpotted flower; skin upload and flat/3D skin guide; written-step Next/Back. Record optional preview requests separately. Include direct `/support` to test the smallest route.
- Verify signed-out visits do not request the Supabase SDK until an account feature needs it; returning sessions and auth callbacks may legitimately load it immediately. Test configured and unconfigured account builds separately.
- Record LCP/CLS, written-guide-ready time, action-to-next-paint samples, long tasks, request counts and transfer bytes. Lab action samples are not a field INP result. No browser timings are claimed complete by this document.
- Acceptance: CI fails when the startup budget is exceeded; before/after route reports account for shared chunks once; unrelated routes remain lazy. Set route budgets from the recorded baselines before changing those routes, with explanations for intentional increases.

### RF-02 — Remove skin processing from unconditional startup

- Keep existing `currentSkin`, `setSkin`, and `syncAccountSkin` behavior and storage keys. Move the processing import to the asynchronous operation that needs it, using existing files where practical.
- Preserve validation before accepting downloaded/uploaded images, the original error behavior, retries after failed dynamic downloads, and private-skin clearing on account switches. Do not delay synchronous ownership checks to make an import lazy.
- Acceptance: the entry/static preload graph no longer reaches skin model generation through auth/skin state. `/support` does not download that engine before a skin operation. Demonstrate a smaller startup gzip total than 55,697 bytes; record the exact saving rather than predicting it.
- Proof: existing skin/auth/storage/saved-build tests; focused tests for any changed async boundary; browser check of upload, username lookup, restoring a local skin, restoring a private skin, sign-out and account switch.
- This is the first runtime refactor after RF-01. It requires no database change or new runtime dependency.

### RF-03 — Make guide asset loading depend on active settings

- Build a resource decision table for flat items, blocks, flowers, pots and craft shapes. Keep assets used by the header or visible settings; separate those needs from assets required to compute the guide.
- A flat block guide must not decode its six-face strip to become ready. An unpotted flower must not wait for a pot. A flat shaped build must not wait for full voxel JSON solely to generate flat instructions. Preserve any shape dimensions/counts the settings actually display.
- React to item ID, effective texture look, view and pot changes. Reuse a successfully decoded resource when switching back to the same effective asset version.
- Start with view-local reuse. Add a shared bounded cache only if RF-01 shows repeated cross-view decoding matters. Failed loads must remain retryable; do not retain rejected promises permanently.
- Keep latest-request guards across all asynchronous stages. Navigation/unmount must invalidate obsolete results. Do not abort the session-shared catalog request on behalf of one view.
- Acceptance: request/decoder assertions demonstrate the decision table; the selected guide is usable when an irrelevant optional resource fails; rapid settings changes never publish an older model; current/classic textures remain correct.
- Proof: request/decoder boundary tests plus browser toggling and offline/retry checks. Compare cubes, paints, recipes, steps, storage keys and resume URLs before/after on representative fixtures.

### RF-04 — Keep optional homepage computation off the critical path

- Trigger starter-count generation when that section approaches the viewport, using the existing viewport helper. Preserve the cards and links while optional counts load or fail. Reuse completed work when appropriate.
- Load only the demo generator required by the selected entry and mode. Preserve the existing request token so fast picker changes cannot display an earlier result.
- Preserve the current rotatable flat demo: the label “2D” selects a flat build displayed through the 3D renderer when WebGL is available. Do not remove that renderer merely because the mode is “2D.”
- Preserve the source's current default demo mode, `2d` (`BuildDemo.vue:48`), despite older README history describing a 3D default. Changing the default is separate product work.
- Acceptance: a cold viewport with the demo/starter sections outside their trigger margins does not start their optional model work; bringing a section near starts it once; switching a flat item does not import unused block/flower/skin generators. Demo counts still match linked guides.
- Keep existing responsive WebP selection, eager high-priority hero photo, lazy lower photos and reserved dimensions. Measure the actual LCP element before changing photo or font priorities.

### RF-05 — Scale catalog reads without changing navigation

- Treat loaded catalog metadata as immutable and evaluate `shallowRef` for the root list; updates replace the list rather than mutating nested item records.
- Normalize/tokenize the search query once per change. Reuse category/group counts and an ID lookup when profiling justifies them; keep related helpers under the existing catalog ownership.
- Preserve search normalization, aliases, ordering, empty/error results, URL round trips, announcements, 60-result initial pages and restored Show more counts. Do not add automatic infinite scrolling.
- Exercise the current 1,117 entries and a synthetic 10,000-entry metadata fixture to expose growth costs. Record processing time and memory; do not include duplicate generated textures in the repository.
- Acceptance: representative queries return the same ordered IDs as before; initial rendered results stay at 60; Show more/Back restore the correct rows and scroll; no newly mounted offscreen CSS block faces cause an unbounded texture burst.
- Introduce virtualization or server search only if this evidence shows pagination and local processing no longer meet the interaction budget. The current 21.2 KiB gzipped catalog does not by itself justify splitting the data service.

### RF-06 — Reduce measured guide and rendering CPU work

- Profile model generation, palette reduction, step generation, role calculation, mesh rebuilding and print preparation separately on a solid 4,096-cube block and a representative full skin.
- First evaluate reducing allocations and repeated derived work within existing owners. For example, the intro currently copies each layer's growing array while grouping voxels. Change it only with relevant evidence and preserved ordering.
- Preserve event-driven rendering, camera position on step updates, coalescing of fast Next/Back clicks, intro timing, theme behavior, reduced motion and cleanup of geometries/materials/observers/listeners.
- Acceptance: written instructions still work with WebGL unavailable or the preview chunk blocked; model/guide equivalence holds; a settled preview has no continuous render loop; repeated enter/leave cycles show no steadily retained renderer resources after collection.
- Use a worker only if traces show repeated computation tasks exceeding 50 ms after simpler changes. Any worker proposal must include serialization cost, latest-request handling, deterministic result comparison, failure fallback and a bounded lifecycle. Worker infrastructure is not part of the initial slice.
- Extract geometry code only if it creates a useful tested boundary. Do not divide `GuideViewer.vue` into many components solely to reduce its line count.

### RF-07 — Make asset revisions and cache behavior explicit

- Document one rule for changes to a texture/shape without a game-version change. Evaluate a generated catalog asset revision or content-derived filenames; retain bounded caching until the revision scheme supports immutability correctly.
- Keep catalog, metadata and assets from different revisions from being mixed silently. A new deployment must also retain clear recovery when an old lazy JS chunk is unavailable.
- Acceptance: replace a fixture asset without changing the game version and prove the new catalog requests the new bytes; unchanged assets remain cacheable; a catalog load failure can be retried. Verify query-string cache keys and headers on Vercel, since local preview cannot prove CDN behavior.
- Preserve existing asset path validation, notices, CSP and static/API routing tests. Version/schema changes require an explicit compatibility and rollback plan before implementation.

### RF-08 — Define service growth triggers

- Inventory query shapes, row/response limits, existing indexes, cache headers and timeouts before proposing new infrastructure. Skin API already has bounded reads/timeouts and a one-hour shared-cache policy; the stats GET already uses CDN caching.
- On a disposable or review database, collect `EXPLAIN (ANALYZE, BUFFERS)` for first and deep community pages using representative data, including policy-filtered reads. Record p50/p95 query latency and row counts under a stated concurrency level. Hosted REST/Auth checks remain distinct from local PGlite correctness tests.
- Consider cursor pagination only if deeper offsets violate the agreed query budget. Preserve deterministic timestamp/ID ordering and define how Previous/Next, refresh and category changes work before changing the interface.
- Keep library's current 100-build quota and account isolation. Do not increase quotas, add global private-data caches, remove row-level policies, or replace Supabase as an incidental performance change.
- Acceptance for a future service change: demonstrate the bottleneck and improvement on the same workload; preserve stale-response/account guards, error states, quotas and revision checks. Add migrations rather than editing applied migrations; leave production data intact on application rollback.

## Performance goals and preservation contract

The performance goals are LCP <=2.5 s, INP <=200 ms, and CLS <=0.1 at the 75th percentile, evaluated separately for mobile and desktop when field data exists. These are [Core Web Vitals targets](https://web.dev/articles/vitals), not measured results for this site. Lab traces establish reproducible engineering comparisons; they cannot establish a field percentile from five runs.

Before each runtime slice, define its exact workload and evidence of success. At minimum require the resource/processing reduction specified above, no startup-budget regression, and no repeatable slowdown outside measurement variation in the affected flows. Record regressions and tradeoffs; do not silently relax a budget or substitute a Lighthouse score for route behavior.

Every slice must preserve:

- Identical voxel placement, palette/recipe labels, cube counts, guide ordering and assembly alignment for identical input/settings. A performance-only change must not require a `GUIDE_ENGINE_VERSION` bump; any actual output change is separately scoped.
- Existing query parameters, local-storage keys and saved-build fingerprints, resume behavior, engine/catalog compatibility checks, and current/classic look selection.
- Keyboard actions, focus/scroll behavior, live announcements, theme/reduced-motion preferences, print and share flows; no new horizontal overflow at 320px and 390px.
- Written guides without 3D, configured/unconfigured accounts, session restoration, account-switch isolation, optimistic revision errors and all database ownership/quota checks.
- Retryable resource errors and old-deployment recovery. Optional preview, count or stats failures cannot make written instructions unusable.

## Delivery order and definition of done

| Slice | Work | Dependency | Stop condition |
| --- | --- | --- | --- |
| 0 | RF-01: CI budget + route/browser baseline | Existing passing build/tests | Gate enforced; reproducible route report; timings and test settings recorded |
| 1 | RF-02: lazy skin processing | Slice 0 | Smaller startup; no skin engine in unconditional route graph; skin/account behavior proven |
| 2 | RF-03: conditional guide resources | Slice 0 | Resource decision table enforced; build output and rapid-toggle behavior preserved |
| 3 | RF-04: optional homepage work | Slices 0-1 | Optional work starts at intended viewport boundaries; relevant generators only |
| 4 | RF-05 and measured RF-06 work, one boundary per change | Profiles from slices 0-3 | Demonstrated growth/interaction improvement without output or accessibility regressions |
| 5 | RF-07 revision scheme; RF-08 only when triggered | Cache/query evidence and compatibility design | Version/cache proof or query improvement with rollback documented |

For each runtime slice, attach the before/after measurements, changed ownership boundary, verification result and remaining limitation to its review. Run focused behavioral tests while editing, then run:

```sh
npm test
npm run check:catalog
npm run build
npx tsx scripts/check-bundle.ts
```

Run the relevant browser scenarios against the production build. `npm run preview` serves production frontend assets and headers but does not execute the serverless APIs; use the appropriate API/review environment for skin/stats integration. Do not treat local tests as proof of hosted Auth, REST, CDN or production load behavior. Keep the existing dependency audit in release CI.

Keep changes independently reviewable and buildable. Prefer one loading/lifecycle boundary per slice; leave database and output formats unchanged in early slices. Roll back a code-only slice by reverting its isolated change; revision/schema work must specify its compatibility plan first.

## Deferred until evidence supports it

No framework rewrite, microservices, new global state library, blanket component splitting, permanent client cache, server-rendering migration, catalog sharding, wholesale renderer replacement, new analytics backend, or quota increase is required by the current findings. Evaluate these only against a measured bottleneck and a concrete acceptance condition.

## Reference guidance

- [Vue performance guidance](https://vuejs.org/guide/best-practices/performance): profiling, lazy loading, shallow reactivity for immutable data and avoiding unnecessary component abstractions.
- [Vite manifest format](https://vite.dev/guide/backend-integration): static and dynamic import relationships for dependency accounting. Using a manifest for measurement does not imply moving this SPA to a traditional backend.
- [Web Vitals](https://web.dev/articles/vitals): user-facing metric thresholds and the distinction between lab and field measurement.
