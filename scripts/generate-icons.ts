/**
 * Draws the original wooden craft-cube mark as PNG icons. No game textures or grass-block branding.
 *
 *   npx tsx scripts/generate-icons.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** Same shapes as favicon.svg, on its 16×16 grid. Later shapes draw on top. */
const SHAPES: [color: string, points: [number, number][]][] = [
  ['#ecc58a', [[8, 1], [15, 4.5], [8, 8], [1, 4.5]]],
  ['#c78350', [[1, 4.5], [8, 8], [8, 15], [1, 11.5]]],
  ['#885c3d', [[15, 4.5], [8, 8], [8, 15], [15, 11.5]]],
]

function inside(x: number, y: number, poly: [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** `padding` leaves a margin (in grid units) and `background` fills behind, for home-screen icons. */
function render(size: number, background: string | null, padding = 0): Buffer {
  const png = new PNG({ width: size, height: size })
  const scale = size / (16 + padding * 2)
  const samples = 4 // supersampling per axis for smooth diagonal edges
  const bg = background ? hex(background) : null
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / scale - padding
          const y = (py + (sy + 0.5) / samples) / scale - padding
          const shape = SHAPES.findLast(([, poly]) => inside(x, y, poly))
          const c = shape ? hex(shape[0]) : bg
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a++
        }
      }
      const i = (py * size + px) * 4
      const n = samples * samples
      if (a) png.data.set([r / a, g / a, b / a, (a / n) * 255].map(Math.round), i)
    }
  }
  return PNG.sync.write(png)
}

function hex(value: string): [number, number, number] {
  const n = parseInt(value.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

writeFileSync(join(PUBLIC, 'favicon-32.png'), render(32, null))
writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), render(180, '#f4efe4', 2))
writeFileSync(join(PUBLIC, 'icon-512.png'), render(512, '#f4efe4', 2))
console.log('Wrote favicon-32.png, apple-touch-icon.png and icon-512.png')
