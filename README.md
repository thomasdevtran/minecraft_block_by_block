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

## Layout

- `src/engine/`: pure TypeScript. Image → cubes → paint palette → steps. No Vue, unit-tested.
- `src/components/GuideViewer.vue`: step UI, with `StepGrid.vue` (2D grid) and `VoxelPreview.vue` (three.js).
- `api/skin/[username].ts`: Vercel function that proxies Mojang's skin API. The Vite dev server reuses it.
- `scripts/extract-assets.ts`: item sprite extraction.
