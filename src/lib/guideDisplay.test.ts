import { describe, expect, it } from 'vitest'
import type { GridCell, Recipe, Step } from '../engine/steps'
import { activeRow, cubesForStep } from './guideDisplay'

const recipes: Recipe[] = [
  { id: 'A', uniform: 0, faces: { front: 0 }, count: 12 },
  { id: 'B', uniform: null, faces: { front: 0, top: 1 }, count: 4 },
]
const cells: GridCell[] = [
  { col: 0, row: 2, recipe: 'A', paint: 0, state: 'done' },
  { col: 1, row: 1, recipe: 'A', paint: 0, state: 'now' },
  { col: 2, row: 1, recipe: 'A', paint: 0, state: 'now' },
  { col: 4, row: 1, recipe: 'B', paint: 0, state: 'now' },
  { col: 5, row: 1, recipe: null, paint: null, state: 'now' },
]
describe('instruction display', () => {
  it('counts only current cubes and keeps mixed-face recipes and filler distinct', () => {
    const step: Step = { kind: 'build', title: '', text: '', part: 'item', layer: 1, grid: { cols: 7, rows: 3, cells, bottomLabel: 'Front' } }
    expect(cubesForStep(step, recipes)).toEqual([
      { recipe: recipes[0], count: 2 }, { recipe: recipes[1], count: 1 }, { recipe: null, count: 1 },
    ])
  })
  it('keeps leading, internal and trailing gaps in the enlarged row', () => {
    expect(activeRow(cells, 7)?.map(cell => cell ? cell.recipe ?? 'filler' : 'gap'))
      .toEqual(['gap', 'A', 'A', 'gap', 'B', 'filler', 'gap'])
  })
  it('does not flatten a multi-row layer into a misleading strip', () => {
    expect(activeRow([...cells, { ...cells[0]!, state: 'now' }], 7)).toBeNull()
    expect(activeRow([], 7)).toBeNull()
  })
})
