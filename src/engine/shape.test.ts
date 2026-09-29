import { describe, expect, it } from 'vitest'
import { checkConnectivity } from './connectivity'
import { shapeToModel, validateShape, type ShapeData } from './shape'
import { buildGuide } from './steps'
import { FACE_NORMALS, FACES } from './voxels'

const shapes = import.meta.glob<ShapeData>('../../public/data/shapes/*.json', { eager: true, import: 'default' })
const shape = (id: string): ShapeData => shapes[`../../public/data/shapes/${id}.json`]!

describe('new craft guides', () => {
  it.each(['creeper_head', 'skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'chest', 'ender_chest', 'shield', 'dragon_egg', 'enchanting_table', 'beacon'])('%s has connected geometry, painted exposed faces and complete instructions', id => {
    const data = shape(id)
    validateShape(data)
    const occupied = new Set(data.cubes.map(c => c.slice(0, 3).join(',')))
    for (const c of data.cubes) FACES.forEach((face, i) => {
      const [dx, dy, dz] = FACE_NORMALS[face]
      if (!occupied.has(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`)) expect(c[i + 3], `${id}: unpainted exposed ${face}`).toBeGreaterThanOrEqual(0)
    })
    for (const hollow of [false, true]) for (const simplePaint of [false, true]) {
      const model = shapeToModel(data, { hollow, simplePaint, maxPaints: 12 })
      expect(checkConnectivity(model.voxels).pieces).toBe(1)
      const guide = buildGuide(model)
      expect(guide.steps.reduce((n, s) => n + (s.kind === 'build' ? s.grid.cells.length : 0), 0)).toBe(model.voxels.length)
      expect(guide.materials.paintedCubes + guide.materials.plainCubes).toBe(model.voxels.length)
      expect(guide.recipes.reduce((n, r) => n + r.count, 0)).toBe(guide.materials.paintedCubes)
    }
  })
  it('keeps heads at native 8-cube scale and removes only enclosed filler', () => {
    const data = shape('creeper_head')
    expect(data.size).toEqual([8, 8, 8])
    expect(shapeToModel(data, { hollow: false, simplePaint: false, maxPaints: 12 }).voxels).toHaveLength(512)
    expect(shapeToModel(data, { hollow: true, simplePaint: false, maxPaints: 12 }).voxels).toHaveLength(296)
  })
  it('rejects malformed coordinates, duplicate cubes and invalid paint indices', () => {
    const data = shape('creeper_head')
    expect(() => validateShape({ ...data, cubes: [data.cubes[0], data.cubes[0]] })).toThrow('Duplicate')
    expect(() => validateShape({ ...data, cubes: [[-1, 0, 0, 0, 0, 0, 0, 0, 0]] })).toThrow()
    expect(() => validateShape({ ...data, cubes: [[0, 0, 0, 99999, 0, 0, 0, 0, 0]] })).toThrow()
  })
})
