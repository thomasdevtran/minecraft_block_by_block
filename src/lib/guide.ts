import type { BuildModel } from '../engine/model'
import type { GridCell, Guide, Recipe, Step } from '../engine/steps'

/*
 * What the guide screen shows for a step: which cubes the 3D preview highlights, how many of each
 * cube to gather, and the enlarged current row.
 */

// ---------------------------------------------------------------------------------------------
// 3D preview roles
// ---------------------------------------------------------------------------------------------

/** How the 3D preview draws each cube. */
export const ROLE = { hidden: 0, ghost: 1, solid: 2, focus: 3 } as const

/** Which cubes to show for a step. `step` is null for the materials overview. */
export function rolesForStep(model: BuildModel, guide: Guide, step: Step | null): Uint8Array {
  const roles = new Uint8Array(model.voxels.length)
  const partOrder = new Map(model.parts.map((p, i) => [p.id, i]))
  const aligned = new Set(step?.kind === 'assemble' ? step.alignedParts.map(part => part.id) : [])
  model.voxels.forEach((v, i) => {
    if (!step) {
      roles[i] = ROLE.solid
    } else if (step.kind === 'paint') {
      const recipe = guide.recipeOf.get(v)
      roles[i] = recipe && step.recipes.includes(recipe.id) ? ROLE.focus : ROLE.ghost
    } else if (step.kind === 'assemble') {
      roles[i] = step.parts.includes(v.part) ? ROLE.focus : aligned.has(v.part) ? ROLE.solid : ROLE.hidden
    } else if (model.kind === 'item') {
      roles[i] = v.y < step.layer ? ROLE.solid : v.y === step.layer ? ROLE.focus : ROLE.hidden
    } else {
      const mine = partOrder.get(v.part)!
      const current = partOrder.get(step.part)!
      if (mine < current) roles[i] = ROLE.solid
      else if (mine > current) roles[i] = ROLE.hidden
      else roles[i] = v.ly < step.layer ? ROLE.solid : v.ly === step.layer ? ROLE.focus : ROLE.hidden
    }
  })
  return roles
}

// ---------------------------------------------------------------------------------------------
// Written instructions
// ---------------------------------------------------------------------------------------------

/** Count only the cubes being added, never the faded context from earlier rows. */
export function cubesForStep(step: Step, recipes: Recipe[]) {
  if (step.kind === 'assemble') return []
  if (step.kind === 'paint') return recipes.filter(r => step.recipes.includes(r.id))
    .map(recipe => ({ recipe, count: recipe.count }))
  const counts = new Map<string | null, number>()
  for (const cell of step.grid.cells) {
    if (cell.state === 'now') counts.set(cell.recipe, (counts.get(cell.recipe) ?? 0) + 1)
  }
  const result: { recipe: Recipe | null; count: number }[] = recipes
    .filter(r => counts.has(r.id)).map(recipe => ({ recipe, count: counts.get(recipe.id)! }))
  if (counts.has(null)) result.push({ recipe: null, count: counts.get(null)! })
  return result
}

/** Preserve empty columns so enlarging a row never changes its placement. */
export function activeRow(cells: GridCell[], cols: number): (GridCell | null)[] | null {
  const current = cells.filter(c => c.state === 'now')
  if (!current.length || new Set(current.map(c => c.row)).size !== 1) return null
  const byColumn = new Map(current.map(c => [c.col, c]))
  return Array.from({ length: cols }, (_, col) => byColumn.get(col) ?? null)
}
