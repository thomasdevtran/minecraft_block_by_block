# minecraft_block_by_block
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

## Old textures

`npm run extract` also downloads older official clients into `scripts/.cache/`:

- **Old/New toggle:** every catalog item is looked up in Minecraft 1.13.2, the last version before the 1.14 texture update, and gets a `classic` texture when it looks different. The set of renamed items lives in `CLASSIC_RENAMES`.
- **Rose:** the Rose was replaced by the Poppy in 1.7.2. It's listed under Plants → Flowers, using its texture from 1.6.4.

## Layout

- `src/engine/`: pure TypeScript. Image → cubes → paint palette → steps. No Vue, unit-tested.
- `src/components/GuideViewer.vue`: step UI, with `StepGrid.vue` (2D grid) and `VoxelPreview.vue` (three.js).
- `api/skin/[username].ts`: Vercel function that proxies Mojang's skin API. The Vite dev server reuses it.
- `scripts/extract-assets.ts`: item sprite extraction.
