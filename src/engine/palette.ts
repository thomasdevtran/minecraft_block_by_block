import { fromHex, toHex } from './pixels'

export interface PaletteEntry {
  /** Paint number shown to the user, starting at 1. */
  id: number
  hex: string
  name: string
  /** How many faces (or pixels) use this paint. */
  count: number
}

export interface PaletteResult {
  palette: PaletteEntry[]
  /** Original hex → index into `palette`. */
  lookup: Map<string, number>
}

type Lab = [number, number, number]

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

export function hexToOklab(hex: string): Lab {
  const { r, g, b } = fromHex(hex)
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s,
  ]
}

export function oklabToHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return toHex({
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  })
}

function dist2(p: Lab, q: Lab): number {
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
}

const COLOR_NAMES: [string, string][] = [
  ['Black', '#000000'], ['Charcoal', '#36393d'], ['Dark Gray', '#5a5a5a'], ['Gray', '#8a8a8a'],
  ['Light Gray', '#bdbdbd'], ['White', '#ffffff'], ['Cream', '#f3e5c0'], ['Beige', '#d8c29d'],
  ['Tan', '#c19a6b'], ['Light Brown', '#a0703f'], ['Brown', '#7b4a24'], ['Dark Brown', '#4a2c17'],
  ['Maroon', '#6e1423'], ['Dark Red', '#9b1c1c'], ['Red', '#d32f2f'], ['Pink', '#f48fb1'],
  ['Hot Pink', '#e0457b'], ['Peach', '#f7b98b'], ['Orange', '#ef7d1a'], ['Dark Orange', '#b95a0f'],
  ['Gold', '#d4a017'], ['Yellow', '#f5d90a'], ['Pale Yellow', '#f6ee94'], ['Lime', '#8bd346'],
  ['Green', '#3f9b35'], ['Dark Green', '#255d1f'], ['Olive', '#6b7a2a'], ['Teal', '#1f8a86'],
  ['Cyan', '#3ec7d6'], ['Light Blue', '#8ec5f0'], ['Blue', '#2f6ad0'], ['Navy', '#1d2c6b'],
  ['Purple', '#7e3fb3'], ['Lavender', '#b79be0'], ['Magenta', '#c030b0'], ['Skin', '#e8b48a'],
  ['Forest Green', '#123d14'], ['Espresso', '#2b1b10'], ['Dark Olive', '#3b4a1a'], ['Midnight Blue', '#141a3d'],
  ['Dark Purple', '#3a1a4d'], ['Dark Teal', '#0f3d3b'], ['Burgundy', '#4a0f1a'], ['Slate', '#4b5a6b'],
  ['Khaki', '#948150'], ['Off White', '#d6d8cc'],
]
const NAMED_LABS = COLOR_NAMES.map(([name, hex]) => [name, hexToOklab(hex)] as const)

export function nearestColorName(hex: string): string {
  const lab = hexToOklab(hex)
  let best = NAMED_LABS[0][0]
  let bestD = Infinity
  for (const [name, ref] of NAMED_LABS) {
    // Hue matters more than lightness when naming: dark green should still read as green.
    const d = 0.5 * (lab[0] - ref[0]) ** 2 + (lab[1] - ref[1]) ** 2 + (lab[2] - ref[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  return best
}

interface Cluster {
  lab: Lab
  weight: number
  members: string[]
}

/** Colors closer than this (in OKLab units) are treated as the same paint. */
export const MERGE_DISTANCE = 0.035

/**
 * Turns a histogram of exact colors into at most `maxPaints` paints.
 * Near-identical shades are merged first, then the pair of groups that costs
 * the least to combine (Ward's method) is merged until the limit is met.
 */
export function buildPalette(counts: Map<string, number>, maxPaints: number): PaletteResult {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const clusters: Cluster[] = []
  const mergeD2 = MERGE_DISTANCE ** 2

  for (const [hex, weight] of sorted) {
    const lab = hexToOklab(hex)
    const near = clusters.find((c) => dist2(c.lab, lab) < mergeD2)
    if (near) absorb(near, { lab, weight, members: [hex] })
    else clusters.push({ lab, weight, members: [hex] })
  }

  const limit = Math.max(1, maxPaints)
  while (clusters.length > limit) {
    let bi = 0
    let bj = 1
    let bestCost = Infinity
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]
        const b = clusters[j]
        const cost = ((a.weight * b.weight) / (a.weight + b.weight)) * dist2(a.lab, b.lab)
        if (cost < bestCost) {
          bestCost = cost
          bi = i
          bj = j
        }
      }
    }
    absorb(clusters[bi], clusters[bj])
    clusters.splice(bj, 1)
  }

  clusters.sort((a, b) => b.weight - a.weight)
  const lookup = new Map<string, number>()
  const palette = clusters.map((c, i) => {
    for (const m of c.members) lookup.set(m, i)
    const hex = oklabToHex(c.lab)
    return { id: i + 1, hex, name: nearestColorName(hex), count: c.weight }
  })
  disambiguateNames(palette)
  return { palette, lookup }
}

/** "Red" + "Red" becomes "Red (light)" + "Red (dark)"; three or more get numbered shades. */
function disambiguateNames(palette: PaletteEntry[]): void {
  const groups = new Map<string, PaletteEntry[]>()
  for (const p of palette) groups.set(p.name, [...(groups.get(p.name) ?? []), p])
  for (const [name, group] of groups) {
    if (group.length < 2) continue
    group.sort((a, b) => hexToOklab(b.hex)[0] - hexToOklab(a.hex)[0])
    group.forEach((p, i) => {
      p.name = group.length === 2 ? `${name} (${i === 0 ? 'light' : 'dark'})` : `${name} (shade ${i + 1})`
    })
  }
}

function absorb(into: Cluster, from: Cluster): void {
  const total = into.weight + from.weight
  into.lab = [
    (into.lab[0] * into.weight + from.lab[0] * from.weight) / total,
    (into.lab[1] * into.weight + from.lab[1] * from.weight) / total,
    (into.lab[2] * into.weight + from.lab[2] * from.weight) / total,
  ]
  into.weight = total
  into.members.push(...from.members)
}
