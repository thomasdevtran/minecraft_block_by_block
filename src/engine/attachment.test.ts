import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { checkConnectivity } from './connectivity'
import { flowerToModel } from './flower'
import { itemToModel } from './item'
import { buildGuide } from './steps'

function texture(path: string) {
  return PNG.sync.read(readFileSync(new URL(`../../public/textures/${path}`, import.meta.url)))
}

describe('attachment instructions', () => {
  it.each(['items', 'classic/items'])('dry-fits the Acacia Boat until row three joins the sections (%s)', directory => {
    const model = itemToModel(texture(`${directory}/acacia_boat.png`), { maxPaints: 12, simplePaint: false })
    const guide = buildGuide(model)
    const rows = guide.steps.filter(step => step.kind === 'build')
    expect(rows.slice(0, 3).map(step =>
      checkConnectivity(model.voxels.filter(cube => cube.y <= step.layer)).pieces,
    )).toEqual([2, 2, 1])
    expect(guide.materials.backingBoard).toBe(false)
    expect(rows[0].text).toContain('dry-fit')
    expect(rows[1].text).toContain('dry-fit')
    expect(rows[2].text).toContain('This row joins the sections')
    expect(rows[3].text).not.toContain('dry-fit')
    expect(rows.reduce((count, step) => count + step.grid.cells.filter(cell => cell.state === 'now').length, 0))
      .toBe(guide.materials.totalCubes)
  })

  it('includes a backing board and mounting instructions for flat builds with permanent gaps', () => {
    const model = itemToModel(texture('items/cornflower.png'), { maxPaints: 12, simplePaint: false })
    const guide = buildGuide(model)
    expect(checkConnectivity(model.voxels).pieces).toBeGreaterThan(1)
    expect(guide.materials.backingBoard).toBe(true)
    expect(guide.steps.find(step => step.kind === 'build')?.text).toContain('Glue each cube to the backing board')
  })

  it('adds two supported bridges to layer six of the Potted Cornflower and includes them in the guide', () => {
    const model = flowerToModel(texture('items/cornflower.png'), {
      pot: texture('pot.png'), maxPaints: 12, simplePaint: true,
    })
    const guide = buildGuide(model)
    const layers = guide.steps.filter(step => step.kind === 'build')
    const supports = model.voxels.filter(cube => cube.support)
    expect(supports.map(({ x, y, z }) => [x, y, z])).toEqual([[5, 9, 7], [7, 9, 10]])
    for (const cube of supports) {
      expect(model.voxels.some(other => other.x === cube.x && other.y === cube.y - 1 && other.z === cube.z)).toBe(true)
      expect(guide.recipeOf.has(cube)).toBe(true)
    }
    const placed: typeof model.voxels = []
    for (const step of layers) {
      placed.push(...model.voxels.filter(cube => cube.part === step.part && cube.ly === step.layer))
      expect(checkConnectivity(placed).pieces, step.title).toBe(1)
    }
    const layer = layers.find(step => step.part === 'plant' && step.layer === 5)!
    expect(layer.grid.cells.filter(cell => cell.support).map(({ col, row }) => [col, row])).toEqual([[5, 7], [7, 10]])
    expect(layer.text).toContain('Place the marked support cubes first')
    expect(layer.text).toContain('row 8, column 6')
    expect(layer.text).toContain('row 11, column 8')
    expect(guide.materials.totalCubes).toBe(249)
    expect(layers.reduce((count, step) => count + step.grid.cells.length, 0)).toBe(guide.materials.totalCubes)
  })
})
