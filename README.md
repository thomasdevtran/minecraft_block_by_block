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

## Accounts and My Builds

Accounts use Supabase Auth. The private `saved_builds` table stores item/skin settings, counts and the explicitly saved step. Skin PNGs use the private `build-skins` bucket. Users can save an existing local build from its guide, then reopen it from My Builds on another device.

Copy `.env.example` to `.env.local` and set the project's URL and publishable key. Set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the hosting build environment. These are browser-facing values. The frontend uses row-level access policies for every user's data.

For a new Supabase project, apply `supabase/migrations/202611070001_saved_builds.sql`, then run `supabase/tests/saved_builds.sql` in its SQL editor. The test rolls back its temporary records. Configure Authentication URL settings to allow the local and deployed `/account` callback URLs. Email confirmation and password recovery use these callbacks. Set the project's exact HTTPS origin in `vercel.json`'s `connect-src` when switching projects.

Saving the same build again updates its place after checking the saved revision. Concurrent changes produce a reload message. Generation changes that alter recipes or steps must bump `GUIDE_ENGINE_VERSION` in `src/lib/savedBuilds.ts`. A mismatched engine or catalog version reopens at Materials.

Apply `supabase/migrations/202611070002_library_limits.sql` after the initial schema, then run `supabase/tests/library_limits.sql`. Initial server-enforced limits are 100 saved builds and 100 private skin images per account, with the bucket's 1 MB file limit. The database serializes quota checks per owner. Duplicate saves and reusing an existing image remain supported at the limit. Contact the operator to remove unused cloud images when necessary.

### Community development: usernames

The community work uses `supabase/migrations/202611070003_community_profiles.sql` and `src/lib/communityProfiles.ts`. The username migration is installed on the hosted project. Signed-in users can open **Community username** on `/account` to choose or edit their name. The panel loads only when opened and requires a confirmed email. On a project without the migration, it reports that usernames are not available yet; sign-in and the library remain usable.

Public profiles contain only an account ID, username, and creation/update timestamps. They never contain email addresses, auth metadata, or moderator permissions. Usernames use 3–24 lowercase ASCII letters, numbers, or underscores, starting with a letter; official/system names are reserved. Users explicitly choose a username rather than deriving one from their email.

All writes go through `set_community_username(expected_user_id, new_username)`. It verifies the authenticated owner and email confirmation in the database, normalizes the name, and atomically creates or updates the caller's profile. Direct profile writes are denied. The expected account protects requests that cross an account switch; client helpers also discard responses after a switch. Existing usernames remain unchanged after a failed save. Account deletion removes the corresponding profile.

Run `npm test -- src/lib/communityProfiles.test.ts tests/community-database.test.ts` to review this step without network access. The development-only PGlite dependency runs the actual migrations and SQL assertions in a disposable PostgreSQL database with minimal Auth/Storage schema stubs. It also reruns the existing library ownership and quota SQL checks. This does not emulate Supabase Auth or the REST API; a hosted integration check is still required after approval and before release. The SQL checks in `supabase/tests/community_profiles.sql` roll back their temporary users and profiles.

For deployment later, apply the additive migration before enabling the username UI. An application rollback can leave the new table in place without affecting accounts or libraries. For a disposable review database only, the schema can be removed by dropping `public.set_community_username(uuid, text)` and then `public.community_profiles`; doing so deletes any community usernames, so it is not the production rollback path.

### Community development: topics and replies

The local review adds `/community`, `/community/new`, and `/community/:topicId`. The board has Build Help, Finished Builds, and Ideas & Feedback categories and shows 20 topics or replies per page. Visitors can read visible discussions. Posting requires a confirmed email and a public community username. Titles and messages render as plain text. Account deletion unlinks the author from existing posts, which display “Deleted account.”

Apply `supabase/migrations/202611100001_community_discussions.sql` after the username migration in a review database. The board displays an unavailable message on projects without the new tables. The migration grants read access to visible content and restricts writes to the authenticated posting functions. The database checks account identity, text limits, locked/hidden topics, and a shared 30-second cooldown plus rolling 24-hour limits of five topics and 30 replies. Run `npm test -- src/lib/communityDiscussions.test.ts tests/community-database.test.ts` for local client and SQL checks. The SQL assertions use a rolled-back transaction with test accounts.

The discussions migration is pending for hosted Supabase. Keep this slice in review until reporting and moderation controls are ready for public posting. Editing, guide step links, and photos are separate review steps. To roll back the application, hide/remove the Community routes and leave the additive tables in place so discussion data is preserved.

`public/textures/` and `public/data/items.json` are **committed**, so a deploy only runs `npm run build`. `npm run extract` is a local maintenance step you run when bumping the Minecraft version; commit whatever it changes. Don't add it to the build — it downloads several client jars and would make deploys depend on Mojang's servers.

## Catalog review

The Minecraft 26.3 catalog contains 1,117 builds: flat inventory sprites, full textured cubes, and ten curated craft shapes. Well-known blocks are pinned to a group in `BLOCK_GROUPS`, and all other full blocks are sorted by `AUTO_BLOCK_GROUPS`. Mirrored face textures are supported, including Observer and Dried Kelp Block. `npm run extract` writes the auto-sorted blocks to `scripts/.cache/auto-added-blocks.txt`. Rules live in `EXCLUDE_RULES` in `scripts/extract-assets.ts`, and extraction prints each excluded item. A pinned version uses its locally cached client jar when available.

Items have subgroups for combat, tools, armor, food, brewing, transport, decoration, materials, collectibles, spawn eggs, and mob heads. Plant groups include newer flowers and saplings, Nether plants and aquatic plants/coral. Categorization lives in the extractor and `scripts/catalog-metadata.ts`, so regenerating assets preserves it. Flower grouping alone does not enable a crossed 3D model for ground-cover plants.

Music discs, armor trims, and banner patterns use specific names. Search matches words across names, IDs, groups, category keywords and aliases; “enchanted golden apple” finds Golden Apple with a note about the shared painted appearance.

`scripts/craft-shapes.ts` generates Creeper Head, Skeleton Skull, Wither Skeleton Skull, Zombie Head, Chest, Ender Chest, Shield, Dragon Egg, Enchanting Table and Beacon from game textures. Their geometry lives in `public/data/shapes/` and uses the existing paint, layer, print, share and progress flows. Heads retain their native 8-cube dimensions. Hollow shapes retain hidden supports where a stepped shell would otherwise disconnect. The chest has a fixed lid, the enchanting table omits its animated book, and the beacon models the solid core/base without glass or a light beam; each guide explains these craft adaptations. No physical craft validation is claimed.

Left out on purpose (38 items that would otherwise show up):

- **Explorer maps (16):** Abandoned Camp, Buried Ancient City, Buried Mineshaft, Buried Treasure, Buried Trial Chambers, Desert Pyramid, Desert Village, Jungle Pyramid, Ocean Monument, Plains Village, Savanna Village, Snowy Village, Swamp Hut, Taiga Village, Warm Ocean Ruins and Woodland Mansion. They're the regular Map with different marking colors. Map and Empty Map stay.
- **Waxed copper (16):** waxed bars, chains, doors and lanterns in all 4 oxidation stages. Their sprites are identical to the unwaxed versions, which stay.
- **Enchanted Golden Apple (1):** same sprite as Golden Apple.
- **Infested blocks (7):** they look exactly like normal stone, cobblestone, deepslate and stone bricks.
- **Glass panes (17):** Glass Pane and the 16 stained glass panes. They're mostly see-through, so cubes would only make a thin frame.
- **Technical (8):** Light, Structure Void, Debug Stick, Knowledge Book, Structure Block, Jigsaw Block, Test Block, Test Instance Block. Barrier and the command blocks stay in by request.

Most other non-cube models, including stairs and beds, remain unsupported. The ten curated shapes above are explicit exceptions, not a general-purpose renderer for every Minecraft model.

## Craft photos and starter projects

The homepage uses clearly labeled photo placeholders until real crafts are ready. Put photos in `public/crafts/`, then set `showcasePhoto` and the starter entries' `photo` paths in `src/lib/starterBuilds.ts` (for example `/crafts/rose.jpg`). The starter projects are Rose, Emerald and Red Tulip. Empty paths keep the placeholders. Use landscape crops; photos never replace the game-reference thumbnail.

Starter counts are calculated from current textures with an eight-color palette. Their links pin the same settings. No untested time or difficulty estimates are shown. Guides provide per-step cube legends, an enlarged current row, saved progress on this device, a full print layout, and links that preserve item build settings. Skin sharing links to the skin builder; uploaded images remain local.

## Old textures

`npm run extract` also downloads older official clients into `scripts/.cache/`:

- **Old/New toggle:** every catalog item is looked up in Minecraft 1.13.2, the last version before the 1.14 texture update, and gets a `classic` texture when it looks different. The set of renamed items lives in `CLASSIC_RENAMES`.
- **Rose:** the Rose was replaced by the Poppy in 1.7.2. It's listed under Plants → Flowers, using its texture from 1.6.4.

## Privacy and legal

The release configuration uses **babiiyi**, California, United States, and **toemasu1452@gmail.com** as supplied by the operator. Read [RELEASE_REVIEW.md](RELEASE_REVIEW.md) before publishing: implementation improvements are not legal clearance.

- Accounts provide a private saved-build library. Fonts are self-hosted under the included OFL license.
- Skin files are processed locally. Saving a skin build uploads its PNG to private Supabase storage. Player lookups reach Mojang through our API and can be cached or present in hosting logs.
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
