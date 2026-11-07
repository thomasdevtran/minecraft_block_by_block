import { faceConnectedGroups, touchesPlacedCube } from './connectivity'
import type { BuildModel, PartInfo } from './model'
import { dominantColor, FACES, voxelKey, type Face, type Voxel } from './voxels'

export interface Recipe {
  /** Letter code painted next to each cube in the build steps. */
  id: string
  /** Paint index per visible face. */
  faces: Partial<Record<Face, number>>
  /** Set when every visible face uses the same paint. */
  uniform: number | null
  count: number
}

export interface GridCell {
  col: number
  row: number
  recipe: string | null
  /** Paint index used to color the cell, or null for plain filler cubes. */
  paint: number | null
  state: 'now' | 'done'
  support?: boolean
}

export interface StepGrid {
  cols: number
  rows: number
  cells: GridCell[]
  /** Label for the bottom edge of the grid. */
  bottomLabel: string
}

export type Step =
  | { kind: 'paint'; title: string; text: string; recipes: string[] }
  | { kind: 'build'; title: string; text: string; grid: StepGrid; part: string; layer: number }
  | { kind: 'assemble'; title: string; text: string; parts: string[]; alignedParts: PartInfo[] }

export interface Materials {
  totalCubes: number
  paintedCubes: number
  plainCubes: number
  backingBoard: boolean
  /** Per paint index: cubes that need that paint, and total faces to paint. */
  perPaint: { cubes: number; faces: number }[]
}

export interface Guide {
  materials: Materials
  recipes: Recipe[]
  recipeOf: Map<Voxel<number>, Recipe>
  steps: Step[]
}

export function recipeCode(n: number): string {
  let s = ''
  n += 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function recipeKey(v: Voxel<number>): string | null {
  if (v.interior) return null
  const main = dominantColor(v.faces)
  if (main === null) return null
  if (FACES.every((f) => v.faces[f] === null || v.faces[f] === main)) return `all:${main}`
  return FACES.map((f) => `${f}:${v.faces[f] ?? '-'}`).join('|')
}

export function buildGuide(model: BuildModel): Guide {
  const materials: Materials = {
    totalCubes: model.voxels.length,
    paintedCubes: 0,
    plainCubes: 0,
    backingBoard: model.kind === 'item' && faceConnectedGroups(model.voxels).length > 1,
    perPaint: model.palette.map(() => ({ cubes: 0, faces: 0 })),
  }

  const byKey = new Map<string, { recipe: Recipe; voxels: Voxel<number>[] }>()
  for (const v of model.voxels) {
    const key = recipeKey(v)
    if (key === null) {
      materials.plainCubes++
      continue
    }
    materials.paintedCubes++

    let group = byKey.get(key)
    if (!group) {
      const faces: Recipe['faces'] = {}
      for (const f of FACES) if (v.faces[f] !== null) faces[f] = v.faces[f]!
      const uniform = key.startsWith('all:') ? dominantColor(v.faces) : null
      group = { recipe: { id: '', faces, uniform, count: 0 }, voxels: [] }
      byKey.set(key, group)
    }
    group.recipe.count++
    group.voxels.push(v)
  }

  // Simple recipes first, then the most common ones.
  const groups = [...byKey.values()].sort(
    (a, b) =>
      Number(a.recipe.uniform === null) - Number(b.recipe.uniform === null) ||
      b.recipe.count - a.recipe.count ||
      (a.recipe.uniform ?? 0) - (b.recipe.uniform ?? 0),
  )
  const recipeOf = new Map<Voxel<number>, Recipe>()
  groups.forEach((g, i) => {
    g.recipe.id = recipeCode(i)
    for (const v of g.voxels) recipeOf.set(v, g.recipe)
  })
  const recipes = groups.map((g) => g.recipe)

  for (const recipe of recipes) {
    if (recipe.uniform !== null) {
      const paint = materials.perPaint[recipe.uniform]
      paint.cubes += recipe.count
      paint.faces += recipe.count * FACES.length
      continue
    }
    const paints = Object.values(recipe.faces)
    for (const paint of paints) materials.perPaint[paint].faces += recipe.count
    for (const paint of new Set(paints)) materials.perPaint[paint].cubes += recipe.count
  }

  const steps: Step[] = [...paintSteps(model, recipes)]
  if (model.kind === 'item') steps.push(...itemBuildSteps(model, recipeOf, materials.backingBoard))
  else steps.push(...layerBuildSteps(model, recipeOf))

  return { materials, recipes, recipeOf, steps }
}

const MIXED_RECIPES_PER_STEP = 8

function paintSteps(model: BuildModel, recipes: Recipe[]): Step[] {
  const steps: Step[] = []
  for (const r of recipes.filter((r) => r.uniform !== null)) {
    const paint = model.palette[r.uniform!]
    steps.push({
      kind: 'paint',
      title: `Paint ${r.count} cube${r.count === 1 ? '' : 's'} ${paint.name}`,
      text: `Paint all six sides with paint #${paint.id} (${paint.name}). Keep these cubes in a tray labeled "${r.id}".`,
      recipes: [r.id],
    })
  }
  const mixed = recipes.filter((r) => r.uniform === null)
  const batches = Math.ceil(mixed.length / MIXED_RECIPES_PER_STEP)
  for (let b = 0; b < batches; b++) {
    const chunk = mixed.slice(b * MIXED_RECIPES_PER_STEP, (b + 1) * MIXED_RECIPES_PER_STEP)
    const count = chunk.reduce((n, r) => n + r.count, 0)
    steps.push({
      kind: 'paint',
      title: `Paint ${count} multi-color cube${count === 1 ? '' : 's'}${batches > 1 ? ` (${b + 1} of ${batches})` : ''}`,
      text: 'These cubes show more than one color. Paint each side as listed. Sides not listed are hidden, so leave them plain or match a neighbor.',
      recipes: chunk.map((r) => r.id),
    })
  }
  return steps
}

function itemBuildSteps(model: BuildModel, recipeOf: Map<Voxel<number>, Recipe>, backingBoard: boolean): Step[] {
  const vs = model.voxels
  if (vs.length === 0) return []
  const minX = Math.min(...vs.map((v) => v.x))
  const maxX = Math.max(...vs.map((v) => v.x))
  const minY = Math.min(...vs.map((v) => v.y))
  const maxY = Math.max(...vs.map((v) => v.y))
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const layers = [...new Set(vs.map((v) => v.y))].sort((a, b) => a - b)
  let separateSections = false

  return layers.map((y, i) => {
    const row = vs.filter((v) => v.y === y).sort((a, b) => a.x - b.x)
    const throughRow = vs.filter(v => v.y <= y)
    const cells: GridCell[] = throughRow.map(v => ({
      col: v.x - minX,
      row: maxY - v.y,
      recipe: recipeOf.get(v)?.id ?? null,
      paint: dominantColor(v.faces),
      state: v.y === y ? 'now' : 'done',
    }))
    const wasSeparate = separateSections
    separateSections = !backingBoard && faceConnectedGroups(throughRow).length > 1
    let attachmentNote = ''
    if (backingBoard) {
      attachmentNote = 'Glue each cube to the backing board in the position shown.'
    } else if (separateSections) {
      attachmentNote = 'Lay the build flat and dry-fit the separate sections. Glue cubes within each section where they touch. Leave the gaps shown in the map until a later row connects the sections.'
    } else if (wasSeparate) {
      attachmentNote = 'This row joins the sections. Glue them together where their faces meet.'
    }
    const placement = `From the left: ${describeRun(row.map(v => v.x - minX), row.map(v => recipeOf.get(v)?.id ?? '·'))}`
    return {
      kind: 'build',
      title: `Row ${i + 1} of ${layers.length}: place ${row.length} cube${row.length === 1 ? '' : 's'}`,
      text: attachmentNote ? `${attachmentNote} ${placement}` : placement,
      grid: { cols, rows, cells, bottomLabel: 'Bottom (lay flat, build upward)' },
      part: 'item',
      layer: y,
    }
  })
}

/** "skip 2, A A B, skip 1, C" */
function describeRun(positions: number[], labels: string[]): string {
  const parts: string[] = []
  let cursor = 0
  let group: string[] = []
  const flush = () => {
    if (group.length) parts.push(group.join(' '))
    group = []
  }
  positions.forEach((p, i) => {
    if (p > cursor) {
      flush()
      parts.push(`skip ${p - cursor}`)
    }
    group.push(labels[i])
    cursor = p + 1
  })
  flush()
  return parts.join(', ')
}

/** Builds each part (in `model.parts` order) one horizontal layer at a time, from the bottom up. */
function layerBuildSteps(model: BuildModel, recipeOf: Map<Voxel<number>, Recipe>): Step[] {
  const steps: Step[] = []
  const subject = { skin: 'character', block: 'block', plant: 'plant', item: 'item', object: 'build' }[model.kind]
  const multiPart = model.parts.length > 1
  const placed = new Set<string>()
  const plant = model.kind === 'plant'
  const plantConnected = plant && faceConnectedGroups(model.voxels).length === 1

  for (const part of model.parts) {
    const partId = part.id
    const partVoxels = model.voxels.filter((v) => v.part === partId)
    // Sprites often have empty rows at the top, so only count layers that have cubes.
    const layers = [...new Set(partVoxels.map((v) => v.ly))].sort((a, b) => a - b)
    layers.forEach((ly, index) => {
      const layer = partVoxels.filter((v) => v.ly === ly)
      const plain = layer.filter((v) => !recipeOf.has(v)).length
      const cells: GridCell[] = layer.map((v) => ({
        col: v.lx,
        row: v.lz,
        recipe: recipeOf.get(v)?.id ?? null,
        paint: dominantColor(v.faces),
        state: 'now',
        ...(v.support && { support: true }),
      }))
      const attachmentNote = plant ? plantLayerNote(layer, placed, plantConnected) : ''
      if (plant) for (const v of layer) placed.add(voxelKey(v.x, v.y, v.z))
      const label = `Layer ${index + 1} of ${layers.length}`
      steps.push({
        kind: 'build',
        title: multiPart ? `${part.name}: ${label.toLowerCase()}` : label,
        text:
          `Place ${layer.length} cube${layer.length === 1 ? '' : 's'} in a ${part.w}×${part.d} layer${index === 0 || attachmentNote ? '' : ' on top of the last one'}. ` +
          (index === 0 && part.firstLayerNote ? `${part.firstLayerNote} ` : '') +
          attachmentNote +
          (plain ? `${plain} of them are plain filler cubes (no paint). ` : '') +
          // A full layer over a hollow middle has nothing to rest on, so it goes on as one glued sheet.
          (ly > 0 && layer.length === part.w * part.d && partVoxels.filter((v) => v.ly === ly - 1).length < layer.length
            ? 'The layer below is hollow, so glue this whole layer together flat on the table first, then set it on top like a lid. '
            : '') +
          `The bottom of the grid is the front of the ${subject}.`,
        grid: { cols: part.w, rows: part.d, cells, bottomLabel: 'Front' },
        part: partId,
        layer: ly,
      })
    })
  }

  if (model.kind === 'skin') steps.push(...assemblySteps(new Map(model.parts.map((p) => [p.id, p]))))
  return steps
}

function plantLayerNote(layer: Voxel<number>[], placed: ReadonlySet<string>, connected: boolean): string {
  if (!placed.size) return ''
  const supports = layer.filter(v => v.support)
  const location = (v: Voxel<number>) => `row ${v.lz + 1}, column ${v.lx + 1}`
  let note = ''
  if (supports.length) {
    const instruction = supports.length === 1 ? 'Place the marked support cube first' : 'Place the marked support cubes first'
    note = `${instruction} at ${supports.map(location).join(' and ')}. Count from the top left of the map and glue each support to the cube directly beneath it. `
  }
  const groups = faceConnectedGroups(layer)
  const detached = groups.filter(group => !group.some(v => touchesPlacedCube(v, placed)))
  if (detached.length) {
    const starts = detached.map(group => location(group[0])).join(' and ')
    return note + (connected
      ? `Use a temporary stand to hold each separate section, starting at ${starts}. Count from the top left of the map. Keep each stand in place until a later layer joins the section and the glue sets. `
      : `The separate sections starting at ${starts} have no attachment at this step. Count from the top left of the map. For a single-piece craft, use the flat guide with a backing board. `)
  }
  if (layer.some(v => !touchesPlacedCube(v, placed))) {
    note += 'Start where the cubes touch the build, then glue the rest outward from those cubes. Let the glue set before adding the next layer. '
  }
  return note
}

function assemblySteps(parts: Map<string, PartInfo>): Step[] {
  const arm = parts.get('rightArm')!
  const head = parts.get('head')!
  const body = parts.get('body')!
  const frontOverhang = head.origin[2] + head.d - body.origin[2] - body.d
  const backOverhang = body.origin[2] - head.origin[2]
  const sequence = [
    {
      title: 'Join the legs',
      text: 'Glue the right leg and left leg side by side with their fronts and bottoms lined up. From the front, the right leg is on your left.',
      parts: ['rightLeg', 'leftLeg'],
    },
    {
      title: 'Add the body',
      text: 'Glue the body on top of the legs. It is exactly as wide and deep as both legs together.',
      parts: ['body'],
    },
    {
      title: 'Attach the arms',
      text: `Glue an arm to each side of the body, level with the top and flush front and back. The arms are ${arm.w} cubes wide, and the right arm goes on your left.`,
      parts: ['rightArm', 'leftArm'],
    },
    {
      title: 'Put the head on',
      text: `Center the head on the body. Leave ${frontOverhang} cubes overhanging the front and ${backOverhang} cubes overhanging the back. Glue where the head touches the body.`,
      parts: ['head'],
    },
  ]
  const alignedParts: PartInfo[] = []
  return sequence.map(step => {
    alignedParts.push(...step.parts.map(id => parts.get(id)!))
    return { kind: 'assemble', ...step, alignedParts: [...alignedParts] }
  })
}
