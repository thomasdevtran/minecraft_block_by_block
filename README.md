# Block by Cube
A website that gives step by step instructions on how to put together blocks to make minecraft items irl!

One pixel = one cube. Every guide starts with a paint list and cube count, then paint steps, then build steps (row by row for items, layer by layer per body part for skins), with a 3D preview.

## Commands

```sh
npm install
npm run extract   # download the Minecraft client jar and write public/textures/items + public/data/items.json
npm run dev       # site + /api/skin/:username on http://localhost:5173
npm test          # engine unit tests
npm run build
```

`npm run extract -- 1.21.8` pins a specific Minecraft version. The jar is cached in `scripts/.cache/` (git-ignored).

`public/textures/` and `public/data/items.json` are **committed**, so a deploy only runs `npm run build`. `npm run extract` is a local maintenance step you run when bumping the Minecraft version; commit whatever it changes. Don't add it to the build — it downloads several client jars and would make deploys depend on Mojang's servers.

## Catalog review

Every item in Minecraft 26.3 was checked. The catalog includes an item when its inventory icon is a flat sprite or a full cube. Well-known blocks are pinned to a group in `BLOCK_GROUPS`, and all other full blocks are sorted by `AUTO_BLOCK_GROUPS`. `npm run extract` writes the auto-sorted ones to `scripts/.cache/auto-added-blocks.txt`. Rules live in `EXCLUDE_RULES` in `scripts/extract-assets.ts`, and `npm run extract` prints each excluded item.

Left out on purpose (38 items that would otherwise show up):

- **Explorer maps (16):** Abandoned Camp, Buried Ancient City, Buried Mineshaft, Buried Treasure, Buried Trial Chambers, Desert Pyramid, Desert Village, Jungle Pyramid, Ocean Monument, Plains Village, Savanna Village, Snowy Village, Swamp Hut, Taiga Village, Warm Ocean Ruins and Woodland Mansion. They're the regular Map with different marking colors. Map and Empty Map stay.
- **Waxed copper (16):** waxed bars, chains, doors and lanterns in all 4 oxidation stages. Their sprites are identical to the unwaxed versions, which stay.
- **Enchanted Golden Apple (1):** same sprite as Golden Apple.
- **Infested blocks (7):** they look exactly like normal stone, cobblestone, deepslate and stone bricks.
- **Glass panes (17):** Glass Pane and the 16 stained glass panes. They're mostly see-through, so cubes would only make a thin frame.
- **Technical (8):** Light, Structure Void, Debug Stick, Knowledge Book, Structure Block, Jigsaw Block, Test Block, Test Instance Block. Barrier and the command blocks stay in by request.

Items whose icon is a 3D model and can't be built from a flat sprite yet: Shield and Straw Bed, plus 3D blocks like stairs, beds and chests.

## Craft photos and starter projects

The homepage uses clearly labeled photo placeholders until real crafts are ready. Put photos in `public/crafts/`, then set `showcasePhoto` and the starter entries' `photo` paths in `src/lib/starterBuilds.ts` (for example `/crafts/rose.jpg`). The starter projects are Rose, Emerald and Red Tulip. Empty paths keep the placeholders. Use landscape crops; photos never replace the game-reference thumbnail.

Starter counts are calculated from current textures with an eight-color palette. Their links pin the same settings. No untested time or difficulty estimates are shown. Guides provide per-step cube legends, an enlarged current row, saved progress on this device, a full print layout, and links that preserve item build settings. Skin sharing links to the skin builder; uploaded images remain local.

## Old textures

`npm run extract` also downloads older official clients into `scripts/.cache/`:

- **Old/New toggle:** every catalog item is looked up in Minecraft 1.13.2, the last version before the 1.14 texture update, and gets a `classic` texture when it looks different. The set of renamed items lives in `CLASSIC_RENAMES`.
- **Rose:** the Rose was replaced by the Poppy in 1.7.2. It's listed under Plants → Flowers, using its texture from 1.6.4.

## Privacy and legal

The release configuration uses **babiiyi**, California, United States, and **toemasu1452@gmail.com** as supplied by the operator. Read [RELEASE_REVIEW.md](RELEASE_REVIEW.md) before publishing: implementation improvements are not legal clearance.

- No accounts or advertising scripts at launch. Fonts are self-hosted under the included OFL license.
- Uploaded skin files stay local. Player lookups reach Mojang through our API and can be cached or present in hosting logs.
- Build progress, skin images and appearance preferences use local storage. The privacy page can clear build data while preserving appearance preferences.
- **Page visits** are counted automatically once per full page load, including reloads and repeat visits. Internal route changes do not add visits. No cookies, stored visitor identifiers, page history or Vercel Web Analytics script are used. GPC/DNT disables counting.
- There is no counting prompt. The server increments a single Redis integer and requires same-origin request signals. Bot filters and origin checks are not proof of a human visitor and do not prevent determined counter manipulation. The total is not unique people and may be cached for a few minutes.
- Ko-fi and PayPal remain external links. Verify the recipient accounts before release; the repository does not prove ownership.
- Do not claim that Minecraft game assets are licensed simply because a disclaimer is displayed. The name collision and extracted asset distribution need review.
- Third-party license texts are generated by the build into `public/third-party-notices.txt`.

## Deploying

See [ACCESSIBILITY_REVIEW.md](ACCESSIBILITY_REVIEW.md) for the latest responsive, keyboard, image-description and local build checks, plus the remaining hosted-preview and real-device checks.

Run `npm ci`, `npm test`, `npm run check:catalog`, `npm run build`, and `npm audit` before deploying. Vercel runs `npm run build`. Use the locked dependency versions and a Node version supported by the installed Vite release (this review used Node 24).

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` | HTTPS REST endpoint from the Upstash integration. |
| `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN` | Server-only database credential. |

Never prefix database credentials with `VITE_` or put them in client code. `VISITOR_SALT` is no longer used because the counter does not generate visitor identifiers.

The counter fails closed in deployed environments when configuration is missing: POST does not count and GET returns 503. Local development alone can use an in-memory count. Preview deployments do not write to the counter.

The new key `bbb:page-visits:v1` starts a fresh page-visit total on deployment. Historical unique-browser estimates are a different measurement and are not merged. Existing database keys and CSV history are untouched.

The optional `.github/workflows/record-visitors.yml` snapshots the aggregate in `docs/page-visits.csv`. Set `SITE_URL` to the deployed HTTPS origin to activate it. This is an operational record, not independent proof of audience size. No analytics dashboard is required.

`vercel.json` includes a same-origin Content Security Policy, framing protection, content-type protection, a referrer policy and restricted device permissions. Static file/API paths are excluded from the SPA rewrite. Test the actual deployment: Vite's dev server does not reproduce Vercel routing, caching or function execution. `npm run preview` serves the built frontend with the security headers but does not run serverless APIs.

Hashed Vite assets use immutable caching. Versioned textures use the catalog's Minecraft version in their URL. If textures change without a version change, update the cache-busting scheme. The catalog revalidates after a short CDN interval; fonts have a bounded cache rather than permanent caching.

Advertising remains off. Enabling it requires a separate implementation and legal review, including consent, child-audience treatment, provider settings, CSP, privacy disclosures, payment/hosting terms and production tests. See the release review.

## Layout

- `src/engine/`: pure TypeScript. Image → cubes → paint palette → steps. No Vue, unit-tested.
- `src/components/GuideViewer.vue`: step UI, with `StepGrid.vue` (2D grid) and `VoxelPreview.vue` (three.js, loaded lazily so the 570 KB chunk never blocks the written steps).
- `src/views/CatalogView.vue`: the 1,105-item grid. Renders 60 tiles at a time — block tiles draw their faces from CSS background images, which are never lazy-loaded, so rendering the whole list would pull ~1 MB of textures on first paint.
- `api/skin/[username].ts`: Vercel function that proxies Mojang's skin API.
- `api/stats.ts`: the visitor counter, `GET` and `POST` in one file.
- `vite.config.ts`: `devApi()` mounts both functions on the dev server, so `npm run dev` needs no extra tools.
- `scripts/extract-assets.ts`: item sprite extraction.
