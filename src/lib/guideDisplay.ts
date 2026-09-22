import type { GridCell, Recipe, Step } from '../engine/steps'

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
