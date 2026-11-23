# Block by Cube

A website with step-by-step instructions for building Minecraft items, blocks and player skins out of real cubes, one pixel per cube.

Every guide starts with a paint list and cube count, then paint steps, then build steps: row by row for items, layer by layer for blocks and craft shapes, and per body part for skins. A rotatable 3D preview sits alongside, and every guide can be printed.

**This is the project's one living document.** It replaces the separate release review (`RELEASE_REVIEW.md`) and performance notes (`performance/README.md`). When you change the project, update the section the change affects and add a line to the [Changelog](#changelog). Older detail is in the git history and in `performance/*.json`.

**Contents:** [Quick start](#quick-start) · [How it works](#how-it-works) · [Catalog and assets](#catalog-and-assets) · [Accounts, library and community](#accounts-library-and-community) · [Offline guides](#offline-guides) · [Privacy and the visit counter](#privacy-and-the-visit-counter) · [Deploying](#deploying) · [Performance](#performance) · [Testing](#testing) · [Release status](#release-status) · [AI use overview](#ai-use-overview) · [Changelog](#changelog)

---

## Quick start

```sh
npm install
cp .env.example .env.local   # optional: Supabase settings for accounts and Community
npm run dev                  # site + /api/skin/:username + /api/stats on http://localhost:5173
npm test
npm run build
```

Without Supabase settings the site still runs. Accounts, My Builds and Community report that they are unavailable.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. `devApi()` in `vite.config.ts` mounts both API functions, so no extra tools are needed. |
| `npm run build` | Generates `public/third-party-notices.txt`, type-checks with `vue-tsc`, and builds to `dist/`. |
| `npm run preview` | Serves `dist/` with the deployed security headers. It doesn't run the API functions. |
| `npm test` | Vitest: engine, library, API, SQL (on PGlite), worker and bundle tests. |
| `npm run check:catalog` | Validates every catalog entry, referenced PNG and craft shape, and checks that the asset revision is current. |
| `npm run check:bundle` | Startup and per-route JavaScript budgets against `performance/bundle-baseline.json`. Run it after a build. |
| `npm run check:site-behavior` | Browser check: catalog navigation, filter URLs, Show more/Back, deferred counter cleanup. |
| `npm run check:offline` | Browser check: offline guides, deploy updates, Clear build data and the kill switch. |
| `npm run check:guide-resources` | Browser check: each guide loads only the inputs it needs; 390 written-guide states match their contracts. |
| `npm run check:homepage` | Browser check: homepage demo and starter counts wait until they're near the viewport. |
| `npm run perf:browser` | Timed lab measurements of a production build (see [Performance](#performance)). |
| `npm run perf:catalog` | Node CPU comparison of catalog search and indexing. |
| `npm run extract` | Downloads Minecraft client jars and rewrites `public/textures/` and `public/data/items.json`. `-- 1.21.8` pins a version. |
| `npm run asset-revision` | Re-tags textures and shapes after a hand edit, so visitors get the new files. |
| `npm run fonts` | Re-downloads the self-hosted Pixelify Sans font from Google Fonts. |
| `npm run icons` | Redraws the PNG app icons from the craft-cube mark. |
| `npm run db:link` / `db:status` / `db:push` | Supabase CLI through `npx` (see [Database migrations](#database-migrations)). |

Browser checks need a production build and a browser. Add `-- --channel msedge` to use an installed Edge on Windows, or run `npx playwright install chromium` once.

---

## How it works

**Pipeline.** A picture becomes cubes, the cubes get a paint palette, and the palette becomes steps:

1. **Input.** A catalog item's sprite, six-face block strip or craft-shape JSON, or a player skin PNG (uploaded, or looked up through `/api/skin/:username`).
2. **Voxels.** `src/engine/` turns the input into a `BuildModel`. `item.ts` gives one cube per visible pixel, `block.ts` a 16×16×16 block (hollow or solid), `flower.ts` crossed walls with an optional pot, `shape.ts` the curated craft shapes, and `skin.ts` the body parts.
3. **Palette.** `palette.ts` reduces colors to the chosen paint count (2–32) and names them. With "one color per cube", each cube gets a single paint.
4. **Steps.** `steps.ts` groups cubes by paint recipe (letter codes), then writes paint steps, row or layer build steps with grids, and assembly steps. `connectivity.ts` warns when a build would fall apart.
5. **Viewer.** `GuideViewer.vue` shows materials, the stage track, written steps (`StepInstructions.vue`), the 2D grid (`StepGrid.vue`) and the three.js preview (`VoxelPreview.vue`). The preview loads separately, so the written steps never wait for it. Progress is saved per build on the device.

**Code layout.**

- `src/engine/`: pure TypeScript, with no Vue and full unit tests: image → cubes → paint palette → steps.
- `src/lib/`: app modules, each in labeled sections:
  - `catalog` / `catalogIndex`: loading and search
  - `buildSettings`: look, cube size, link settings
  - `workbench`: finished size, cube-size field, screen wake lock
  - `guide` / `guideResources`: per-step roles; selected inputs, cached per open guide
  - `storage`, `skinStore`, `savedBuilds`, `auth`, `supabase`
  - `communityProfiles`, `communityDiscussions`, `communityModeration`
  - `stats`, `offline`, `recovery` (stale-deploy reloads), `demo` (homepage generator loading)
  - `dom`: idle work, WebGL probe, near-viewport, focus after paging
  - `site` (operator details, starter builds, photos), `meta`, `toast`, `loader`
- `src/views/`: one per route. `CatalogView.vue` renders 60 tiles at a time, and tiles that aren't rendered don't request textures. `ItemGuideView.vue` and `SkinGuideView.vue` build models; the account, library, community and legal pages are the rest.
- `src/components/`: guide UI, `BuildDemo.vue` (homepage "One pixel, one cube"), print layouts (`GuidePrint.vue`), community forms and shared controls.
- `src/sw.js` and `src/lib/offline.ts`: the offline-guides service worker and its registration.
- `api/skin/[username].ts`: Vercel function that proxies Mojang's skin API, which browsers can't call because of CORS.
- `api/stats.ts`: the page-visit counter, `GET` and `POST` in one file.
- `scripts/`: asset extraction (`extract-assets.ts`, `catalog-metadata.ts`, `craft-shapes.ts`, `texture-uv.ts`), checks, measurements and generators.
- `supabase/`: migrations and SQL assertions. `tests/`: API, SQL, worker and bundle tests, plus the browser checks.

---

## Catalog and assets

### Catalog review

The Minecraft 26.3 catalog contains 1,117 builds: flat inventory sprites, full textured cubes, and ten curated craft shapes. Well-known blocks are pinned to a group in `BLOCK_GROUPS`, and all other full blocks are sorted by `AUTO_BLOCK_GROUPS`. Mirrored face textures are supported, including Observer and Dried Kelp Block. `npm run extract` writes the auto-sorted blocks to `scripts/.cache/auto-added-blocks.txt`. Rules live in `EXCLUDE_RULES` in `scripts/extract-assets.ts`, and extraction prints each excluded item. A pinned version uses its locally cached client jar when available.

Items have subgroups for combat, tools, armor, food, brewing, transport, decoration, materials, collectibles, spawn eggs, and mob heads. Plant groups include newer flowers and saplings, Nether plants and aquatic plants/coral. Categorization lives in the extractor and `scripts/catalog-metadata.ts`, so regenerating assets preserves it. Flower grouping alone does not enable a crossed 3D model for ground-cover plants.

Music discs, armor trims, and banner patterns use specific names. Search matches words across names, IDs, groups, category keywords and aliases. "enchanted golden apple" finds Golden Apple, with a note about the shared painted appearance.

Left out on purpose:

- **Explorer maps (16):** they're the regular Map with different marking colors. Map and Empty Map stay.
- **Waxed copper (16):** waxed bars, chains, doors and lanterns in all four oxidation stages. Their sprites are identical to the unwaxed versions, which stay.
- **Enchanted Golden Apple (1):** same sprite as Golden Apple.
- **Infested blocks (7):** they look exactly like normal stone, cobblestone, deepslate and stone bricks.
- **Glass panes (17):** Glass Pane and the 16 stained glass panes. They're mostly see-through, so cubes would only make a thin frame.
- **Technical (8):** Light, Structure Void, Debug Stick, Knowledge Book, Structure Block, Jigsaw Block, Test Block and Test Instance Block. Barrier and the command blocks stay in by request.

Most other non-cube models, including stairs and beds, remain unsupported.

### Craft shapes

`scripts/craft-shapes.ts` generates Creeper Head, Skeleton Skull, Wither Skeleton Skull, Zombie Head, Chest, Ender Chest, Shield, Dragon Egg, Enchanting Table and Beacon from game textures. Their geometry lives in `public/data/shapes/` and uses the existing paint, layer, print, share and progress flows.

- Heads keep their native 8-cube dimensions.
- Hollow shapes keep hidden supports where a stepped shell would otherwise disconnect.
- The chest has a fixed lid, the enchanting table leaves out its animated book, and the beacon models the solid core and base without glass or a light beam. Each guide explains its adaptations.

These are explicit exceptions, not a general renderer for every Minecraft model. No physical craft validation is claimed.

### Old textures

`npm run extract` also downloads older official clients into `scripts/.cache/` (git-ignored):

- **Old/New toggle:** every catalog item is looked up in Minecraft 1.13.2, the last version before the 1.14 texture update, and gets a `classic` texture when it looks different. The set of renamed items lives in `CLASSIC_RENAMES`.
- **Rose:** the Rose was replaced by the Poppy in 1.7.2. It's listed under Plants → Flowers, using its texture from 1.6.4.

`public/textures/` and `public/data/items.json` are **committed**, so a deploy only runs `npm run build`. `npm run extract` is a local maintenance step for bumping the Minecraft version; commit whatever it changes. Don't add it to the build: it downloads several client jars and would make deploys depend on Mojang's servers.

### Craft photos and starter projects

The homepage shows craft photos from `public/crafts/`, set as `showcasePhoto` and the `starterBuilds` entries' `photo` paths in `src/lib/site.ts`. The starter projects are Rose, Emerald and Red Tulip.

- Each photo is a landscape (16:10) JPEG, plus optional `-480`, `-960` and `-1440` WebP copies, which browsers prefer.
- Leaving a `photo` out shows a labeled placeholder.
- Photos never replace the game-reference thumbnail.
- You can replace a photo under the same name: the build tags photo URLs with a hash of `public/crafts/`.

Starter counts are calculated from current textures with an eight-color palette, and their links pin the same settings. No untested time or difficulty estimates are shown.

Guides provide:
- per-step cube legends and an enlarged current row
- saved progress on this device
- a finished-size calculator for your cube size
- a keep-screen-on switch
- a full print layout and tray-label sheets
- links that keep the build settings

Skin sharing links to the skin builder; uploaded images stay local.

### Asset caching

- **Textures and craft shapes** are requested with `?v=<assetRevision>`. The revision is a hash of every file under `public/textures/` and `public/data/shapes/`, stored in `items.json` by `scripts/asset-revision.ts`.
- **Craft photos** use a hash of `public/crafts/`.
- **Tagged URLs** are cached for a year. Any changed file changes the hash, so visitors fetch the new bytes. A request without `?v=` is never cached as immutable, because `vercel.json` matches on the query.
- **Keeping the revision current:** `npm run extract` writes it, `npm run asset-revision` updates it after a hand edit, and `npm run check:catalog` fails when it's stale.
- **Hashed Vite assets** use immutable caching. The catalog revalidates after a short CDN interval, and fonts have a bounded cache.

---

## Accounts, library and community

### Accounts and My Builds

Accounts use Supabase Auth. The private `saved_builds` table stores item and skin settings, counts and the explicitly saved step, and skin PNGs go in the private `build-skins` bucket. Users can save a local build from its guide, then reopen it from My Builds on another device.

- **Configuration.** Copy `.env.example` to `.env.local` and set the project's URL and publishable key, then set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the hosting build environment. These are browser-facing values; every user's data is protected by row-level access policies.
- **Auth settings.** Allow the local and deployed `/account` callback URLs in Supabase's Authentication URL settings, since email confirmation and password recovery use them. When switching projects, set the project's exact HTTPS origin in `vercel.json`'s `connect-src`.
- **Saving again** updates the build's place after checking the saved revision. Concurrent changes produce a reload message.
- **Engine version.** Generation changes that alter recipes or steps must bump `GUIDE_ENGINE_VERSION` in `src/lib/savedBuilds.ts`. A build saved with a different engine or catalog version reopens at Materials.
- **Limits** (`202611070002_library_limits.sql`): 100 saved builds and 100 private skin images per account, with the bucket's 1 MB file limit. Quota checks are serialized per owner. Duplicate saves and reusing an existing image still work at the limit.
- **Deleting a build** also deletes its skin image once no other saved build uses it (`202611230001_database_foundations.sql`), so deleted builds stop counting toward the image limit. Images left by deletions before that migration can be removed from the dashboard's Storage page.

### Database migrations

`supabase/migrations/` holds every schema change, applied in filename order. The Supabase CLI records which ones the hosted database already has, so each runs exactly once. The `db:*` scripts run the CLI through `npx`; nothing extra is installed.

One-time setup on a computer (it asks for the database password from the dashboard's Database settings):

```sh
npm run db:link
```

The first three migrations were applied by hand in the SQL editor before the CLI was used. Mark them as applied once, then check the list:

```sh
npx --yes supabase@3 migration repair --status applied 202611070001 202611070002 202611070003
npm run db:status   # Local and Remote columns; anything with no Remote entry is pending
```

To release schema changes, run the checks, then push:

```sh
npm test -- tests/community-database.test.ts   # every migration and supabase/tests/*.sql on a throwaway Postgres
npm run db:push                                 # lists the pending migrations and asks before applying them
```

- Push migrations before deploying code that needs them.
- Never edit a migration that has been pushed; add a new one.
- `supabase/config.toml` only configures a local `npx supabase start` stack. The hosted project's Auth, SMTP and URL settings are managed in the dashboard, so don't run `supabase config push`.
- The SQL checks run with the development-only PGlite dependency, using the real migrations and minimal Auth/Storage stubs. They don't emulate Supabase Auth or the REST API, so a hosted integration check is still needed before release.

### Adding to the database

`202611230001_database_foundations.sql` provides shared building blocks, so a new feature doesn't have to copy earlier functions:

- **Account check:** start every write function with `craft_private.require_member(expected_user_id, 'Confirm your email before …')`. It checks that the caller is the expected account, has a confirmed email and passed the age screen. A future rule, such as bans or MFA, goes in this one function.
- **Rate limits:** `craft_private.account_actions` is a view that lists each account's topics, replies and reports with their times. Add a branch to it for each new kind of action, then call `require_cooldown` and `require_quota` while holding the caller's per-account advisory lock (see `require_community_poster`). The helpers take no lock of their own, because a shared one could deadlock against topic row locks.
- **Lists that grow belong in tables.** For example, `community_categories` is a table rather than a check constraint. Fixed sets, such as build kinds and report reasons, stay as named checks.
- **Rules the tests enforce** (`supabase/tests/database_foundations.sql`): every table in `public` and `craft_private` has row-level security, every foreign key has an index, and every check constraint has a real name rather than one Postgres numbered.
- **New migrations need adding** to `tests/community-database.test.ts`, along with their `supabase/tests/*.sql` file.

### Age screen

Sign-up asks everyone for a birth month and year, with nothing pre-filled.

- **Under 13:** no account is created and nothing is sent. The browser only remembers that the question was answered (`account:age-declined`), so the form doesn't reappear.
- **Otherwise:** the answer goes with the sign-up. `202611150001_age_screen.sql` checks it again in a trigger on `auth.users`, rejects under-13 sign-ups, records only the outcome in `craft_private.age_screens`, and removes the month and year before the account row is stored.
- **The month of a 13th birthday counts as under 13,** because the day isn't asked. `oldEnough()` in `src/lib/auth.ts` and `craft_private.at_least_13` apply the same rule.
- **Older accounts:** accounts created earlier, or from the dashboard, answer once on `/account` through `confirm_age`. The first answer is final.
- **What needs a passed check:** saving and updating builds, uploading skins, choosing a username, posting and reporting all require one in the database. Reading and deleting saved builds don't, so anyone can still remove what they saved.
- **Failed checks:** an account that fails stays in place, so a parent or guardian can ask for its deletion.

### Community usernames

Signed-in users with a confirmed email can choose or edit a public username in **Community username** on `/account` (`202611070003_community_profiles.sql`, `src/lib/communityProfiles.ts`). On a project without the migration, the panel reports that usernames aren't available yet.

- **Public profiles** contain only an account ID, username and timestamps. They never contain email addresses, auth metadata or moderator permissions.
- **Usernames** use 3–24 lowercase ASCII letters, numbers or underscores, starting with a letter. Official and system names are reserved, and users choose a name explicitly rather than having one derived from their email.
- **All writes** go through `set_community_username(expected_user_id, new_username)`. It verifies the owner and email confirmation in the database, normalizes the name, and creates or updates the profile atomically. Direct profile writes are denied, and the expected account protects against requests that cross an account switch.
- **Account deletion** removes the profile.

### Topics and replies

`/community`, `/community/new` and `/community/:topicId` (`202611100001_community_discussions.sql`) give a board with Build Help, Finished Builds, and Ideas & Feedback categories, showing 20 topics or replies per page.

- **Categories** are rows in `public.community_categories` (`id`, `label`, `sort_order`, `accepts_topics`). To add one, insert a row from the database console; no deploy is needed. To retire one, set `accepts_topics = false`: its topics stay readable and filterable, but it takes no new topics. Don't delete a category that topics still use.
- **Reading:** visitors can read visible discussions.
- **Posting:** needs a confirmed email and a public username. Titles and messages render as plain text.
- **Limits:** the database checks identity, text limits and locked or hidden topics. It enforces a shared 30-second cooldown and rolling 24-hour limits of five topics and 30 replies.
- **Account deletion** unlinks the author from their posts, which then show "Deleted account."
- **Rollback:** hide the routes and leave the additive tables in place, so discussion data is preserved.

### Reporting and moderation

`202611100002_community_moderation.sql` comes after the discussions migration.

- **Reports:** confirmed accounts can report topics or replies with a reason and optional details. Reports are private to moderators, and each reporter gets one receipt per target. Reporting has its own 10-second cooldown and a ten-report rolling 24-hour quota; a duplicate retry returns the original receipt without using quota.
- **Moderators** review open or reviewed reports at `/community/moderation`, including hidden content. They can dismiss a report, hide its target, or restore hidden content. Hiding a topic also hides its replies, but restoring a reply doesn't unhide its parent topic. Stale decisions are rejected, and every action adds an audit record. The queue is paginated, oldest first, and clears when the account changes.
- **The browser cannot write** reports, memberships, audit records or content visibility directly. No privileged Supabase key is in the frontend.
- **Moderator setup** is an operator action: insert the confirmed account's UUID into `craft_private.community_moderators` from the trusted database console, and remove the row to revoke access. Moderator access comes only from that table and a confirmed Auth identity, never from profile or user metadata.

**Hosted status:** the usernames migration is applied. The discussions, moderation, age-screen and database-foundations migrations must be pushed in order with `npm run db:push`, then the hosted Auth/API behavior verified. Check `npm run db:status` for the current list. Push before deploying: from 2026-11-23, Community reads its categories from the database and shows "not available" without them.

---

## Offline guides

Production builds register a service worker. `offlineWorker()` in `vite.config.ts` writes `src/sw.js` to `dist/sw.js` with a build ID, and `src/lib/offline.ts` registers it once the page is idle.

- **Pages** are always fetched from the network first, so deploys arrive as before. Offline, the saved app shell answers.
- **Hashed code, fonts and the catalog** are kept per deploy, for the current and previous deploy.
- **Guide files:** the tagged pictures and shapes of the last 30 guide pages a visitor opens (`MAX_GUIDES`) are saved automatically. Browsing the catalog saves nothing.
- **API calls and other sites** always use the network.
- **Clearing:** "Clear saved build data" on the privacy page deletes every offline copy.
- **Kill switch:** `VITE_OFFLINE=off npm run build` ships a page that stops registering the worker, and a `sw.js` that deletes its caches and unregisters itself. Deploy it if the worker ever misbehaves.

---

## Privacy and the visit counter

The release configuration uses **babiiyi**, California, United States, and **toemasu1452@gmail.com** as supplied by the operator. These live in `src/lib/site.ts`. Implementation improvements are not legal clearance; see [Release status](#release-status).

- **Data:**
  - Accounts provide a private saved-build library.
  - Fonts are self-hosted under the included OFL license.
  - Skin files are processed locally. Saving a skin build uploads its PNG to private Supabase storage.
  - Player lookups reach Mojang through our API and can be cached or appear in hosting logs.
- **Local storage:**
  - Build progress, skin images and appearance preferences use local storage.
  - The privacy page can clear build data while keeping appearance preferences.
  - Offline copies use cache storage (public files only; no skins or lookups) and are cleared along with build data.
- **Page visits** are counted once per full page load, including reloads and repeat visits; internal route changes don't add visits. There are no cookies, stored visitor identifiers, page history, Vercel Web Analytics or counting prompt, and GPC/DNT turns counting off.
- **The counter** is one Redis integer (`bbb:page-visits:v1`), and the server requires same-origin request signals. Bot filters and origin checks don't prove a human visitor or stop determined manipulation. The total isn't unique people and may be cached for a few minutes.
- **Third parties:** Ko-fi and PayPal are plain external links, with no embedded widgets or scripts. The application ships without advertising code.
- **Notices:** third-party license texts are generated by the build into `public/third-party-notices.txt`. Don't claim that Minecraft game assets are licensed because a disclaimer is displayed.

---

## Deploying

Run `npm ci`, `npm test`, `npm run check:catalog`, `npm run build`, `npm run check:bundle` and `npm audit` before deploying; CI (`.github/workflows/ci.yml`) runs the same on every push and pull request. Vercel runs `npm run build`. Use the locked dependency versions and Node 24.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Build | Accounts, My Builds and Community. Browser-facing. |
| `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` | Server | HTTPS REST endpoint from the Upstash integration. |
| `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` | Server | Server-only database credential. |
| `VITE_OFFLINE=off` | Build | Offline kill switch (see [Offline guides](#offline-guides)). |

- **Secrets.** Never prefix database credentials with `VITE_` or put them in client code. `VISITOR_SALT` is no longer used.
- **The counter fails closed when deployed.** With configuration missing, POST doesn't count and GET returns 503. Only local development can use an in-memory count, and preview deployments don't write. The key `bbb:page-visits:v1` started a fresh total; older keys and CSV history are untouched.
- **Visit snapshots.** The optional `.github/workflows/record-visitors.yml` snapshots the total into `docs/page-visits.csv`; set the `SITE_URL` repository variable to turn it on. This is an operational record, not independent proof of audience size.
- **Security headers.** `vercel.json` sets a same-origin Content Security Policy, framing protection, content-type protection, a referrer policy and restricted device permissions. Static file and API paths are excluded from the SPA rewrite.
- **Test the real deployment.** Vite's dev server doesn't reproduce Vercel routing, caching or functions.
- **Skin lookups** are cached on Vercel's CDN only: a found skin for an hour (served for up to a week if Mojang fails), an unknown player or default skin for five minutes, and errors never.
- **Stale code.** After a deploy, a visitor holding stale code gets one automatic reload when a lazy chunk fails to load (`src/lib/recovery.ts`).

---

## Performance

### Budgets (enforced in CI)

```sh
npm run build
npm run check:bundle
```

- **What's counted.** The checker walks **static** imports from Vite's `.vite/manifest.json`, counting each shared file once per group. Startup is the entry plus HTML preloads. Each route is startup plus that route's static dependencies. Dynamic entries are listed separately.
- **Startup JS** has an **85 KiB gzip** hard ceiling. It is currently about 50.9 KB gzip.
- **Each route's JS** may be at most its total in `performance/bundle-baseline.json` plus **1 KiB**. That margin covers small module-wrapper differences; it isn't room for a new dependency. New lazy routes need a reviewed baseline entry.
- **CSS** is reported but has no hard budget.
- **The report** goes to `dist/performance-bundle.json`, even when a gate fails, and CI uploads it.
- **Gzip sizes** use Node's `gzipSync` defaults. They are reproducible bundle comparisons, not CDN or full-page transfer measurements.

The roughly 570 KB three.js preview chunk triggers Vite's chunk-size warning. It's lazy-loaded, and the written steps never wait for it.

### Browser measurements (informational)

```sh
npm run perf:browser -- --channel msedge --runs 5 --profile desktop --output performance/runs/desktop.json
npm run perf:browser -- --channel msedge --runs 5 --profile mobile --output performance/runs/mobile.json
npm run perf:browser -- --channel msedge --scenarios support,catalog,flat-item --runs 5 --immutable-assets --output performance/runs/deployment-cache.json
```

Build first. The runner serves `dist/` (or `--dist <dir>`) at `127.0.0.1:4175` and uses a fresh context per scenario and run, sampling a cold visit and a warm reload.

- **Settings:** desktop 1280×800 or mobile 390×844, 4× CPU slowdown, 150 ms latency, and 200,000 B/s down and 93,750 B/s up.
- **What's recorded:** "ready" is the moment the scenario's content first appears. LCP, CLS, long tasks and resource timings are observed until 1.5 s after ready.
- **Flags:** `--immutable-assets` adds the deployed `/assets/` cache header, and `--verify-skins` also tests a real PNG upload and an intercepted username lookup.
- **Accounts:** no account session is supplied and hosted Supabase requests are blocked.
- **Limits:** these are localhost lab numbers, not Vercel or field Core Web Vitals. Compare before and after with the same browser and settings on an idle machine. To compare against an older build, build it into a separate folder and pass that folder with `--dist`.

Raw runs go to the git-ignored `performance/runs/`. Reviewed summaries are committed:
- `browser-baseline.json`: first-phase timings
- `guide-resources-baseline.json`: guide input contracts and SHA-256 written-guide fingerprints, used by `check:guide-resources`
- `homepage-baseline.json`: demo and scheduling contracts, used by `check:homepage`
- `bundle-baseline.json`: route budgets

`--baseline --dist <reference>` captures a new reference under `performance/runs/` without overwriting the committed contracts.

Measured results for each phase are in the [Changelog](#changelog): 2026-11-17, and three entries on 2026-11-18.

---

## Testing

| Layer | Where | Run |
| --- | --- | --- |
| Engine, lib, API, worker, bundle | `src/**/*.test.ts`, `tests/*.test.ts` (322 tests in 29 files) | `npm test` |
| Database | `supabase/tests/*.sql` on PGlite via `tests/community-database.test.ts` | `npm test -- tests/community-database.test.ts` |
| Catalog integrity | `scripts/check-catalog.ts` | `npm run check:catalog` |
| Bundle budgets | `scripts/check-bundle.ts` | `npm run check:bundle` |
| Browser behavior | `tests/*.browser.mjs`, sharing `tests/browser-support.mjs` | `npm run check:site-behavior`, `check:offline`, `check:guide-resources`, `check:homepage` |

Unit tests cover engine output, saved-build and skin validation, account-switch clearing, API errors, and the offline worker's caching rules. The browser checks cover:
- 390 written-guide states
- the homepage demo combinations
- resource failure and retry
- offline reloads and deploy updates

`npm audit --audit-level=high` runs in CI. The last local audit (2026-11-18) reported 11 high-severity findings in dependencies, unchanged from the original lockfile; no audit bypass is in place.

---

## Release status

The site is verified locally and renamed **Block by Cube**. **Do not treat it as legally cleared.** This section is a practical checklist tied to the code, not a legal opinion or certification of California, EU/UK or children's-privacy compliance.

**Decisions to resolve before public promotion**

1. **Clear the name.** Block by Cube replaced a name shared with the existing [Block by Block organization](https://www.blockbyblock.org/). Exact-name web searches found no obvious matching brand, but that isn't a trademark search or legal clearance. The GitHub repository URL and internal counter keys stay unchanged.
2. **Review the extracted artwork.** The repository serves game textures directly. Minecraft's [Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines) distinguish branding, assets and permitted fan activities, so general fan-site permission isn't automatic permission for every use of extracted files. Get advice that covers this catalog, the public repository and the support payments. Software and font license notices don't license Mojang artwork. Alternatives would be original or licensed art, or browser-only imports where visitors supply their own files.
3. **Confirm operator disclosures.** A handle may not meet every identity or address requirement for an operator, a payment recipient or a child-directed service. Don't publish a home address without considering a business contact arrangement. California business-name or registration duties need a qualified reviewer.
4. **Assess the child audience.** Minecraft-inspired content may attract children. See the [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions). The age screen blocks under-13 sign-ups, but it isn't a parental-consent system. Revisit this before adding ads, public uploads or messaging.
5. **Finalize retention and providers.** IP addresses and usernames can reach hosting logs. Confirm Vercel, Upstash and Supabase retention, regions, access, backups and terms, then add precise retention to the privacy notice once verified.
6. **Confirm payment destinations.** Verify the Ko-fi (https://ko-fi.com/babiiyi) and PayPal (https://paypal.me/babiiyi) recipients and a successful checkout yourself before accepting money. Decide how refunds and recurring contributions work, and ask a tax professional about records. No tax-deductibility claim is made.

**Deployment checklist**

- Resolve the name and artwork questions above.
- Verify both support accounts, and check that the public contact email receives mail.
- Configure the final domain and HTTPS. After the domain and name decision, add the canonical origin, an absolute social-preview URL and a sitemap.
- Configure the counter's server-only credentials, provider access and retention. Keep Vercel Web Analytics off.
- Push pending Supabase migrations, set the Auth callback URLs, and verify sign-up, the age screen, saving and Community on the hosted project.
- Add edge/WAF rate limits and spending alerts for `/api/skin/*` and `/api/stats`. Origin and bot checks don't replace abuse protection.
- Test a real Vercel preview:
  - direct route loads
  - content types for textures, fonts and license text
  - CSP headers
  - API errors
  - a live skin lookup
  - missing assets that don't return `index.html`
- Test the production Redis counter: each full page load writes, GPC/DNT requests don't, and the total survives new function instances.
- Check the privacy notice against the actual host logs and provider settings.
- Test on a real iPhone with Safari, an Android phone with Chrome, and Firefox, plus keyboard-only use and a screen reader. No full WCAG conformance is claimed until a formal audit.
- Smoke-test at least one assembled item and a hollow 3D block. Generated counts don't prove material strength or glue stability.
- Record a rollback target and a process for security and privacy emails.

**Before adding advertising**

Any advertising needs its own implementation and legal review, covering:
- provider and site eligibility
- child-audience treatment and consent/withdrawal flows
- notices, contracts and CSP changes
- `ads.txt`
- layout stability
- hosting-plan terms ([Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) restricts the Hobby plan to non-commercial use)

**Open ideas:**
- pre-rendered public catalog and guide pages for search and sharing
- a smaller 3D download
- automated accessibility checks across devices
- a tested no-WebGL and network-error matrix

---

## AI use overview

**Summary.** This project is developed with Claude, Anthropic's model, used through Claude Code as an AI pair designer and engineer. I (the operator) set the goals, scope the work into phases, review every proposal, push back where I disagree, bring in feedback from real testers, and make every commit. Claude reads the codebase, proposes plans, makes edits in the working tree, and checks each change.

| | Who |
| --- | --- |
| Goals, scope, design direction, approval | Operator |
| Reading the code, audits, plans, edits | Claude |
| Verification (tests, type-check, build, bundle budgets, browser checks, screenshots) | Claude runs them; the operator reviews the results |
| Commits, pushes, deployments, accounts, payments, legal decisions | Operator only |

**Ground rules that carry across sessions:**
- Read and understand the code before planning.
- Plan before acting, and work in phases that can each be reviewed and committed on their own.
- Explain the reasoning and the alternatives considered.
- Nothing is done until the checks pass on the actual project folder.
- The AI never commits.
- Legal and release questions are flagged for a qualified person, not answered by the AI.

### Session 1, November 2026: UI, interaction and accessibility pass

The prompts below are lightly edited for spelling and clarity; their intent and scope are unchanged.

#### Results at a glance

| Area | Before | After |
| --- | --- | --- |
| Form field border contrast (WCAG 1.4.11) | 1.59:1 light, 1.42:1 dark | over 3:1 in both themes |
| Toasts (WCAG 2.2.1) | disappeared after 3–6 s | 8 s, pause on hover/focus, errors stay until dismissed |
| "Current page/stage" indicator (WCAG 1.4.1) | color only | color plus a 3px bar, with `aria-current` |
| `src/lib` modules | 28, many single-function | 18, grouped into labeled sections |
| First guide instruction on screen | 985px down (desktop), 1,360px (phone) | 752px (desktop), 869px (phone) |
| Page jump when pressing Next on a build step | 300–400px (desktop), ~220px (phone) | 0px on desktop; the 3D preview stays still on phones |
| Build steps on phones | page 712px wide, so the browser zoomed out | fits 320px and 390px screens |
| Skin uploads in production | blocked by the Content Security Policy | working, with tests |
| Unit tests | 238 | 240, all passing, plus type-check and build |

#### How I worked with the AI

- **Role, goal and constraints in every brief.** I gave Claude a role (web UI designer), a goal (find bad design, improve interactivity and visuals) and constraints (good coding practice, accessibility rules).
- **Understand before changing.** Each brief told it to read the codebase and understand how the site works before planning. The first answer was an audit with measured contrast ratios and file and line references, not code.
- **Phased scope.** I took the audit's plan in three phases: low-risk fixes, then shared patterns, then layout redesign. Each phase could be reviewed and committed on its own.
- **Built-in self-review.** After each phase I asked it to review every change, explain its reasoning and name the alternatives it considered. This caught real bugs before I saw them: focus lost when a toast closed, an animation that finished off screen, and a name clash between a prop and a variable.
- **Pushing back on architecture.** When I noticed one-function files, I asked why they existed. That led to a consolidation from 28 modules to 18, which I approved by rule ("group things under one label when it makes sense"), not file by file.
- **Approval gates for visible changes.** Layout changes were prototyped in a separate copy and shown as before/after screenshots before anything touched my project.
- **Design direction from my own taste.** I rejected the bevelled cube style in favor of solid color, and chose which items the homepage previews.
- **Real user feedback.** A tester found the Next button jarring. I gave Claude both candidate fixes and asked it to decide which was better practice and justify it before writing any code.
- **Verification as the definition of done.** Nothing counted as finished until the tests, `vue-tsc` and `vite build` passed on my actual project folder, and the behavior was measured in a browser.

#### Prompt log

**1. Audit**
> You are a web UI designer. Your goal is to find bad design and opportunities to improve the interactivity and visuals of my website. Follow good coding practices and accessibility (WCAG) rules. Before making any plans or changes, read the codebase and understand how the website works.

*Answer:* A read-only audit of every view, component and the global styles, with contrast calculated from the color tokens. It listed 15 findings with fixes. Highlights:
- Field borders fail WCAG 1.4.11.
- Toasts expire too fast for WCAG 2.2.1.
- A focusable link is invisible until stats load.
- The paint slider gives no feedback while dragging.
- Shared classes are scoped to a single component.
- Internal links reload the page.
- "Selected" is drawn five different ways.
- The guide stacks controls before the first step.

It proposed three phases and confirmed which existing patterns were already solid and should be left alone.

**2. Phase 1: low-risk fixes**
> Start with Phase 1. Afterwards, review each change you made: explain why you made it and what alternatives you considered.

*Answer:*
- Added a `--field-line` token and one shared field style.
- Made toasts pausable, with errors that stay until dismissed and focus returned on close.
- Hid the "How we count" link from Tab until it's visible.
- Made the slider show a live value while keeping the expensive rebuild on release.
- Moved `.link-button` and `.eyebrow` into global styles.
- Switched internal links to `RouterLink`.
- Moved the step position into the focused heading so screen readers announce it once, reliably.

Each change came with its reasoning and at least one alternative. The answer also corrected one claim from the audit.

**3. Phase 2: shared patterns**
> Start Phase 2. Review each change the same way: your reasoning and the alternatives you considered.

*Answer:*
- One style for "what you chose" (solid green) and one for "where you are" (a tint plus a bar, driven by `aria-current`).
- A readable 3D badge with a legend instead of a hover-only tooltip.
- One debounced live region for search results.
- A drop zone that no longer flickers.
- A visible username label.
- Focus moved to the new list after Community paging.
- A focus-ring gap, gentler word wrapping, and focus on each page's `<h1>`.
- Two choices called out that I might want to reverse.

**4. Questioning the file structure**
> What is the purpose of `pageFocus.ts`? It doesn't need its own file. Why does `colors.ts` have its own file too? A lot of files serve only one purpose.

*Answer:* Explained what each small module did and agreed the problem was one function per file, not small files in general. It suggested the rule "group code that changes together and is used together" and proposed a merge table: 28 modules down to about 19.

**5. Consolidation**
> I like it. Consolidate the files into a more general structure. The project shouldn't be overloaded with files; things should live under one file (one label) when it makes sense.

*Answer:*
- Merged 12 modules into `site`, `buildSettings`, `dom`, `guide`, `catalog`, `storage`, `engine/palette` and `engine/skin`, each with labeled sections.
- Moved the tests along with the code.
- Updated the README and comments that named old files.
- Explained two deviations from the plan. For example, skin checks went to `engine/skin.ts` so the saved-build tests keep exercising them.
- All tests, the type-check and the build passed.

**6. Phase 3: layout and engagement**
> Start Phase 3. As a web UI designer, improve the visual design and layout so the site is easier to use and looks beautiful. Change or add to the current layout, or add interactive, engaging design. Keep good coding practices and accessibility rules, and read the codebase before planning.

*Answer:* Prototyped in a separate copy and presented with before/after screenshots:
- A homepage "One pixel, one cube" demo: pick an item, watch it assemble row by row, and see real cube and paint counts from the build engine, with a link to the matching guide.
- A single guide progress card: a segmented stage track sized by step count, the step picker, and Print/Copy.
- A collapsible "Customize build" section.
- A one-line heads-up notice.

The first instruction moved from 985px to 752px down the page on desktop.

**7. Design direction**
> It looks nice, but I prefer the original block design: each cube should be a solid block of color, with no outline or shape.

*Answer:* Removed the bevel, rounded corners and shadow and kept a 2px gap between cubes. Added a faint edge to paint swatches only, so white paint stays visible.

**8. Finding a moved control**
> Where did the slider for the number of paint colors go?

*Answer:* It's in the collapsed "Customize build" section, whose summary shows the current value. The answer explained the trade-off of collapsing it.

**9. Homepage preview: 3D/2D toggle and new items**
> On the homepage, add a toggle between a 3D and a 2D animation, defaulting to 3D. Change the preview items to Rose, Poppy, Diamond Ore, Bucket of Axolotl and the Steve skin.

*Answer:*
- Added the toggle, a rotate-only 3D view that doesn't capture the scroll wheel, and real 3D models for flowers, blocks and the Steve skin.
- Added Steve's skin to the asset extractor.
- While testing, found a production bug: the Content Security Policy blocked every skin upload, because the code used `fetch()` on a `data:` URL. Fixed it with direct decoding and added tests.

**10. Matching the animations**
> In the 3D render, can you copy the fade-in animation that the 2D render uses?

*Answer:*
- Added a drop-in intro to the 3D viewer: each layer falls from one cube above, grows from 60% and fades in, bottom first, with the same timing and easing as the 2D CSS.
- Hands off to the normal model when done.
- Respects reduced motion.
- Checked with frame captures and with switching items mid-animation.

**11. Rotatable flat builds**
> For the 3D render, flowers show several sides, blocks show all six faces and skins are fully three-dimensional. For the 2D option, I want the flat build shown in the same 3D view, so people can spin it around.

*Answer:* My first request was ambiguous, so Claude asked a multiple-choice clarifying question before building; my reply above settled it. The 2D option now shows the flat build in the rotatable 3D viewer with the same drop-in animation. The flat colored board stays as the fallback for browsers without 3D support.

**12. Real user feedback: a jarring Next button**
> A test user reports a problem on the instructions page. During the building steps, every press of Next jerks the page up. It's jarring and unnecessary. There are two options: (a) don't reset the scroll position when the user presses Next, or (b) make the written building instructions and the "Gather for this step" list compact, or collapsible, so pressing Next doesn't move the page. Decide which is the better practice, explain why, and explain how you would implement it.

*Answer:* Measured first.
- Build steps were 1,100–1,200px tall on an 800px screen, so Next caused a 300–400px jump on desktop and about 220px on phones.
- It also found a separate phone bug: hidden screen-reader labels escaped a scroll box and widened build steps to 712px, so phones zoomed out.

It recommended the compact layout (b). Simply not scrolling (a) would leave readers partway down the new step and move keyboard focus off screen. It then laid out a seven-step plan and listed the alternatives it rejected.

**13. Implement and hand over**
> Looks good. Implement it and merge everything into the main build of the site so I can commit it.

*Answer:*
- Compact cube chips with a "Show paint names" toggle that stays open between steps.
- A one-row map header with the key under the map.
- Back/Next pinned to the bottom of the screen on desktop.
- A map that shrinks slightly on short laptop screens.
- The phone overflow fixed.
- On phones, the preview held still when you're watching it, with the new step announced to screen readers.

Measured result: no page movement on desktop at 1280×800, 1366×768 and 1440×900, and a still preview on 390px and 320px phones. Every changed file was confirmed identical to the tested version, and tests, type-check and build passed in my folder.

**14. Documenting the work**
> In the README, add an AI review of this collaboration: a section that shows my proficiency with AI-assisted development and prompt engineering. Include my prompts and a summary of your answers, and improve the prompts' wording a little so readers understand what I did.

*Answer:* This section.

#### AI review of the collaboration

*Written by Claude, reviewing the session as a whole.*

**What worked well**
- **The briefs reused a strong structure:** a role, a goal, constraints, then "read before you plan". That made the first deliverable an evidence-based audit instead of guesses, and set an accessibility bar every later change was held to.
- **Asking for reasoning and alternatives after every phase** turned each answer into a design review. It produced documented trade-offs and surfaced bugs during self-checks.
- **Thomas sized the work well.** He accepted a phased plan, approved structural changes by principle rather than micromanaging, and kept visual changes behind before/after approval.
- **He judged the output instead of accepting it.** He questioned single-purpose files, rejected a visual style he didn't like, and asked where a moved control went: the kind of review that catches discoverability regressions.
- **He brought real user evidence.** Framing the tester's complaint as "two options, decide and justify" got a measured diagnosis, which also exposed a hidden phone bug, before any code changed.
- **He kept ownership of the codebase.** The AI edited the working tree but never committed. Thomas reviewed the diffs and made the commits.

**What could be sharper next time**
- **Name the devices and success criteria up front,** for example "no page movement on Next at 1366×768 and on a 390px phone". The AI set those targets itself here, but stating them makes reviews faster.
- **Describe new features by their visible result.** The "3D render of the 2D items" request needed a clarifying round trip. One sentence describing the result ("the flat build in the 3D viewer, rotatable") would have avoided it.
- **Separate commits by concern as you go.** The skin-upload fix, the homepage demo and the guide layout ended up in one working tree. Committing each when it's approved keeps history easy to review and roll back.

### Session 2, 22 November 2026: cleanup, refactor and one living README

**Prompt log**

**1. Orientation**
> Read the whole project and give me a small paragraph of how the project works.

*Answer:* A one-paragraph summary of the stack (Vue 3, TypeScript, Vite, Vercel), the asset extraction, the image-to-cubes engine, the API functions, Supabase features, offline support and the test layers.

**2. Cleanup, refactor and documentation**
> Read through the codebase, remove everything that is not needed, and do a whole-codebase refactor and optimization, keeping only what is essential. Combine all of the README files into one living document that has changelogs and an AI use overview. Keep the tests and everything else. Make a plan before taking action on anything.

*Answer:* A read-only exploration in plan mode, with a baseline of 319 passing tests. It asked three questions before planning:
- **Scope:** dead code only, or whole features too? I chose dead code only.
- **History:** condense dated history or keep it all? I chose condense.
- **Commits:** I said I'd review and commit each phase myself.

The approved plan had three phases, each stopping for my review:
1. **Cleanup:**
   - removed a stray PDF and stale `.gitignore` entries
   - added the missing `.env.example`
   - gave the font and icon generators npm scripts
   - removed unused value exports
   - cleared old local build snapshots, which included an archived copy of `.env.local`

   It kept type exports that describe public function signatures and explained why.
2. **Refactor:**
   - moved the guide's cube-size field into `workbench.ts`, with three new tests
   - merged duplicate stage labels and lifecycle hooks
   - had the perf script reuse the shared browser helpers

   It measured each change. It built a shared "reduce motion" helper, saw it add 35 gzip bytes to every page's startup, and reverted it. It also checked the moved field end to end in a real browser, since the existing checks didn't cover it.
3. **Docs:** folded the release review and performance notes into this README, then deleted both files.

**3. Database review (23 November)**
> Look at my database and my Supabase configuration. How would I make the database more scalable, and more robust in case I want to add more things to it?

*Answer:* A read-only review of the six migrations, `config.toml` and every client query. It ranked the findings:
- **Bugs:** deleted skin images were never removed, five foreign keys had no index, and the moderation queue scanned past reviewed reports.
- **Making new features cheap to add:** repeated account checks and rate-limit code, unnamed constraints, and categories hard-coded in two places.
- **Scale:** offset pagination.
- **Configuration:** a custom SMTP provider is needed before real sign-up volume.

**4. Database foundations**
> Do sections 1 and 2.

*Answer:* One new migration, without editing any pushed migration.
- **Rate limits:** it chose a view over the existing tables rather than a new events table, so limits behave identically and the earlier quota tests still prove it.
- **No lock in the helpers:** it found that a shared lock inside them could deadlock a reply against a report on the same topic, and left the locking to each caller.
- **Queue indexes:** it ran `EXPLAIN` in PGlite and found that Postgres rewrites `= false` in a way the first index couldn't match, so it added a partial index for open reports.
- **Guard rails:** it checked the new structure tests against the old schema to confirm they catch the five unindexed foreign keys.
- **Left for later:** generated TypeScript types need the user's Supabase login and the pushed schema, so that step waits.

**AI review**
- **Asking for a plan first, then answering three scoping questions,** prevented the most expensive mistake available: reading "keep only what is essential" as permission to delete features.
- **Reviewing and committing each phase** kept every diff small enough to read.
- **What could be sharper:** "refactor/optimize" with no target metric leaves the AI to choose one. Here it used bundle bytes and test coverage. Naming the goal, such as faster guides, a smaller download or fewer files, would focus the work.

---

## Changelog

Newest first. Dates come from the commit history and the dated review and measurement notes this file replaced.

### 2026-11-23: Database foundations
- **New migration** `202611230001_database_foundations.sql`, with `supabase/tests/database_foundations.sql`. Push it before deploying this version.
- **Fixes:**
  - Deleting a saved build now deletes its skin image once nothing else uses it. Before, deleted images stayed in storage and still counted toward the 100-image limit.
  - Added indexes on the five foreign keys that had none.
  - Added indexes so the moderation queue stays fast as reviewed reports accumulate. Checked with `EXPLAIN` for both known values and generic plans.
- **Foundations for new features:**
  - one account check, `require_member`
  - shared rate-limit helpers over an `account_actions` view
  - categories as a table, with labels loaded by the client
  - real names for the two checks Postgres had numbered

  Limits, error codes and messages are unchanged, and every earlier SQL test passes as written.
- **Guard rails:** the SQL tests now fail if a table lacks row-level security, a foreign key lacks an index, or a check constraint has a numbered name. The test count went from 322 to 327.

### 2026-11-22: Cleanup, refactor and one README
- **Docs:** merged `RELEASE_REVIEW.md` and `performance/README.md` into this README, with a changelog and an AI use overview. Removed a broken link to `ACCESSIBILITY_REVIEW.md`.
- **Refactor:**
  - The guide's cube-size field logic now lives in `src/lib/workbench.ts` (`convertCubeSize`, `useCubeSizeField`), with tests, and reuses `CM_PER_INCH`.
  - `GuideViewer.vue` shares one stage-label map and one pair of lifecycle hooks.
  - `scripts/measure-performance.mjs` reuses `tests/browser-support.mjs`.
  - The guide routes are about 78 gzip bytes larger, and startup is unchanged. The test count went from 319 to 322.
- **Cleanup:**
  - added `.env.example`, plus the `npm run fonts` and `npm run icons` scripts
  - removed unused exports in `scripts/`, stale `.gitignore` entries and a stray tray-label PDF

### 2026-11-22: Offline guides, asset revisions and tray labels
- **Offline:** a service worker keeps the app shell and the last 30 opened guides available offline. Pages stay network-first, the code from the previous deploy is kept, Clear build data removes everything, and `VITE_OFFLINE=off` is a kill switch.
- **Asset revisions:** a content hash (`?v=`) on textures, shapes and photos allows year-long immutable caching, and `check:catalog` fails on a stale revision.
- **Printing:** tray-label sheets join the full printed guide.
- **Cleanup:** removed deprecated configuration and documentation files.

### 2026-11-18: Homepage, guide-resource and catalog performance phases
- **Guide resources (RF-03):**
  - Each guide decodes only the inputs its current view needs: a sprite, a face strip, a pot or a shape.
  - Flat Chest skips 74,312 decoded bytes of JSON. Flat Diamond Ore skips a 3,856-byte face strip.
  - The item route grew by 269 gzip bytes. 390 written-guide states stayed identical, and 270 tests passed.
- **Homepage (RF-04):**
  - Starter counts and the demo generators wait until they're within 200 px of the viewport.
  - Catalog static JS fell from 64,527 to 61,695 gzip bytes (−4.4%).
  - The CSS cube icon no longer pulls in the block generator. 280 tests passed.
- **Catalog index:**
  - Search and indexing moved to `catalogIndex.ts`.
  - 105 searches went from 18.95 to 4.27 ms, and 300 tab or group changes from 8.88 to 0.011 ms (Node CPU, 1,117 entries).
  - Startup JS fell from 51,067 to 50,600 gzip bytes. Visitor counters cancel idle work on unmount.
  - The browser checks share `tests/browser-support.mjs`. 284 tests passed.
- **Removed** the inactive advertising component and settings.

### 2026-11-17: Performance measurements and bundle budgets
- Added `perf:browser` lab measurements and bundle budgets (85 KiB startup ceiling, route baselines plus 1 KiB), with a CI report.
- Skin processing became lazy, cutting unconditional startup JS from 55,697 to 51,012 gzip bytes (−8.4%). The support route no longer fetches engine chunks.
- 255 tests and 346 browser samples. Desktop cold-ready medians: support 1,180 → 1,109 ms, and flat item guide 1,903 → 1,844 ms.

### 2026-11-15: Age screen, accessibility pass and homepage demo
- **Age screen:** sign-up blocks under-13 accounts in the browser and again in the database, and stores only the outcome.
- **UI and accessibility pass** (see [AI use overview](#session-1-november-2026-ui-interaction-and-accessibility-pass)):
  - contrast fixes, pausable toasts, and `aria-current` indicators
  - `src/lib` consolidated from 28 modules to 18
  - a compact guide layout with no page jump on Next
  - phone overflow fixed
- **Homepage demo** "One pixel, one cube", with a 3D/2D toggle and a drop-in animation.
- **Fix:** skin uploads blocked by the CSP.
- **Recovery:** one automatic reload when stale code fails to load after a deploy.

### 2026-11-10: Community
- Public usernames, a discussion board with topics and replies, and private reporting with a moderator queue. Each has SQL migrations and SQL tests.

### 2026-11-07: Accounts and My Builds
- Supabase accounts and a private saved-build library with skin image storage.
- Access hardened with row-level policies, and server-enforced limits of 100 builds and 100 images per account.

### 2026-11-05: Live visit count restored
- Reverted the presentation demo from 2026-10-06, so the support page shows the live total again.

### 2026-10-06: Presentation demo
- Temporarily showed a fixed demo visitor total (10,151) on the support page for a presentation.

### 2026-09-27 – 09-28: Craft shapes and photos
- Ten curated craft shapes (mob heads, chests, shield, dragon egg, enchanting table, beacon), new item textures and catalog metadata.
- Updated the Rose, Red Tulip and showcase photos, and removed some flavor text.

### 2026-09-22: Automatic page-visit counter
- The counter now adds one to a single Redis total per full page load, with no visitor identifiers. GPC/DNT and bot/origin filtering remain. This replaced the opt-in, HMAC/HyperLogLog design from 09-16, and old totals aren't merged.
- Support for the Vercel KV variable names, third-party notices derived from the runtime dependency graph, and the `StepInstructions` component.

### 2026-09-16: Public release review
- **Renamed** the project Block by Cube, with an original craft-cube icon and a clear non-affiliation notice.
- **Security:**
  - Added a same-origin CSP and framing protection.
  - Hardened the skin proxy: deadlines, a host allowlist, blocked redirects, and bounded and validated PNGs.
  - Uploads are checked before decoding.
- **Accessibility and layout:**
  - mobile navigation and footer fixes
  - light, dark and device themes
  - route focus and guarded arrow shortcuts
  - text equivalents for 3D layer grids
  - safety guidance with the materials list
- **Privacy:**
  - rewrote the privacy and payment terms to match the implementation
  - removed the extra analytics loader
  - added Clear build data
- **Maintenance:**
  - removed `@vercel/node` and 109 transitive packages, which left zero audit findings at the time
  - build-generated license notices, the catalog checker and the CI workflow
- **Verification:** 52 tests, and 1,105 catalog entries and 2,001 PNGs validated.

### 2026-09-15: First version
- Item, block, flower and skin guides with a 3D preview, the catalog with old/new textures, privacy and terms pages, the self-hosted Pixelify Sans font, and touch and desktop hints.
