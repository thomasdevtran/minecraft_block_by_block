import { describe, expect, it } from 'vitest'
import { checkConnectivity } from './connectivity'
import { itemToModel } from './item'
import { buildPalette } from './palette'
import { fromHex, type PixelImage } from './pixels'
import { faceUv, skinToModel, type SkinOptions } from './skin'
import { buildGuide, recipeCode } from './steps'
import { FACES } from './voxels'

function blank(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

function fill(img: PixelImage, x: number, y: number, w: number, h: number, hex: string, alpha = 255) {
  const { r, g, b } = fromHex(hex)
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const k = (j * img.width + i) * 4
      img.data.set([r, g, b, alpha], k)
    }
  }
}

/** Gray base skin with every overlay region left transparent. */
function graySkin(): PixelImage {
  const img = blank(64, 64)
  fill(img, 0, 0, 64, 64, '#808080')
  fill(img, 32, 0, 32, 16, '#000000', 0)
  fill(img, 0, 32, 56, 16, '#000000', 0)
  fill(img, 0, 48, 16, 16, '#000000', 0)
  fill(img, 48, 48, 16, 16, '#000000', 0)
  return img
}

const skinOpts: SkinOptions = { model: 'classic', hollow: true, overlay: true, maxPaints: 16, simplePaint: false }

describe('palette', () => {
  it('merges near-identical shades and respects the paint limit', () => {
    const counts = new Map([
      ['#ff0000', 10],
      ['#fe0101', 5],
      ['#00ff00', 3],
      ['#0000ff', 2],
    ])
    const merged = buildPalette(counts, 10)
    expect(merged.palette).toHaveLength(3)
    expect(merged.lookup.get('#fe0101')).toBe(merged.lookup.get('#ff0000'))
    expect(merged.palette.reduce((n, p) => n + p.count, 0)).toBe(20)

    const limited = buildPalette(counts, 2)
    expect(limited.palette).toHaveLength(2)
    expect(limited.palette.reduce((n, p) => n + p.count, 0)).toBe(20)
  })

  it('labels recipes like spreadsheet columns', () => {
    expect([0, 25, 26, 27].map(recipeCode)).toEqual(['A', 'Z', 'AA', 'AB'])
  })
})

describe('items', () => {
  it('makes one cube per visible pixel and counts every cube in the steps', () => {
    const img = blank(16, 16)
    fill(img, 7, 4, 2, 12, '#3f9b35') // stem
    fill(img, 5, 1, 6, 3, '#d32f2f') // flower
    const model = itemToModel(img, { maxPaints: 12, simplePaint: false })
    expect(model.voxels).toHaveLength(24 + 18)
    expect(model.palette.map((p) => p.name)).toEqual(['Green', 'Red'])

    const guide = buildGuide(model)
    expect(guide.materials.totalCubes).toBe(42)
    expect(guide.materials.perPaint.map((p) => p.cubes)).toEqual([24, 18])
    const build = guide.steps.filter((s) => s.kind === 'build')
    expect(build).toHaveLength(15)
    const placed = build.reduce((n, s) => n + (s.kind === 'build' ? s.grid.cells.filter((c) => c.state === 'now').length : 0), 0)
    expect(placed).toBe(42)
    expect(build[0].kind === 'build' && build[0].text).toBe('From the left: skip 2, A A')
    expect(checkConnectivity(model.voxels).pieces).toBe(1)
  })

  it('warns when pixels only touch at the corners', () => {
    const img = blank(16, 16)
    for (let i = 0; i < 5; i++) fill(img, i, i, 1, 1, '#999999')
    const report = checkConnectivity(itemToModel(img, { maxPaints: 4, simplePaint: false }).voxels)
    expect(report.pieces).toBe(5)
    expect(report.bridgeSpots.length).toBe(8)
  })
})

describe('skin UV mapping', () => {
  const [w, h, d] = [8, 12, 4]

  it('wraps the side strip so neighboring faces meet at shared edges', () => {
    for (let ly = 0; ly < h; ly++) {
      // left side → front
      expect(faceUv('front', 0, ly, d - 1, w, h, d)[0] - faceUv('left', 0, ly, d - 1, w, h, d)[0]).toBe(1)
      // front → right side
      expect(faceUv('right', w - 1, ly, d - 1, w, h, d)[0] - faceUv('front', w - 1, ly, d - 1, w, h, d)[0]).toBe(1)
      // right side → back
      expect(faceUv('back', w - 1, ly, 0, w, h, d)[0] - faceUv('right', w - 1, ly, 0, w, h, d)[0]).toBe(1)
      // same row across the strip
      expect(faceUv('front', 0, ly, d - 1, w, h, d)[1]).toBe(faceUv('back', 0, ly, 0, w, h, d)[1])
    }
  })

  it('puts the front edge of the top face right above the top row of the front face', () => {
    for (let lx = 0; lx < w; lx++) {
      const top = faceUv('top', lx, h - 1, d - 1, w, h, d)
      const front = faceUv('front', lx, h - 1, d - 1, w, h, d)
      expect(front[0]).toBe(top[0])
      expect(front[1] - top[1]).toBe(1)
    }
  })

  it('reads each face of a real skin layout', () => {
    const img = graySkin()
    fill(img, 8, 8, 8, 8, '#d32f2f') // head front
    fill(img, 8, 0, 8, 8, '#2f6ad0') // head top
    fill(img, 40, 8, 8, 8, '#f5d90a') // hat front (overlay)
    fill(img, 40, 20, 4, 12, '#3f9b35') // right arm's outer side

    const model = skinToModel(img, skinOpts)
    const paint = (hex: string) => model.palette.findIndex((p) => p.hex === hex)
    const headFront = model.voxels.find((v) => v.part === 'head' && v.lz === 7 && v.ly === 3 && v.lx === 3)!
    expect(model.palette[headFront.faces.front!].name).toBe('Yellow')
    expect(headFront.faces.top).toBeNull()

    const headTop = model.voxels.find((v) => v.part === 'head' && v.ly === 7 && v.lx === 2 && v.lz === 2)!
    expect(model.palette[headTop.faces.top!].name).toBe('Blue')

    const armOuter = model.voxels.find((v) => v.part === 'rightArm' && v.lx === 0 && v.ly === 5 && v.lz === 2)!
    expect(model.palette[armOuter.faces.left!].name).toBe('Green')
    expect(paint('#000000')).toBe(-1)

    // The arm's inner side presses against the body, so it is never painted.
    const armInner = model.voxels.find((v) => v.part === 'rightArm' && v.lx === 3 && v.ly === 5 && v.lz === 2)!
    expect(armInner.faces.right).toBeNull()
  })

  it('mirrors the right limbs for legacy 64×32 skins', () => {
    const img = blank(64, 32)
    fill(img, 0, 0, 64, 32, '#808080')
    fill(img, 40, 20, 4, 12, '#3f9b35') // right arm's outer side
    const model = skinToModel(img, skinOpts)
    const leftOuter = model.voxels.find((v) => v.part === 'leftArm' && v.lx === 3 && v.ly === 5 && v.lz === 1)!
    expect(model.palette[leftOuter.faces.right!].name).toBe('Green')
  })
})

describe('skin cube counts', () => {
  const img = blank(64, 64)
  fill(img, 0, 0, 64, 64, '#808080')

  it.each([
    ['classic', true, 1168],
    ['classic', false, 1664],
    ['slim', true, 296 + 264 + 2 * 152 + 2 * 124],
    ['slim', false, 512 + 384 + 2 * 192 + 2 * 144],
  ] as const)('%s hollow=%s uses %i cubes', (model, hollow, cubes) => {
    const m = skinToModel(img, { ...skinOpts, model, hollow })
    expect(m.voxels).toHaveLength(cubes)
    const guide = buildGuide(m)
    expect(guide.materials.totalCubes).toBe(cubes)
    const placed = guide.steps.reduce((n, s) => n + (s.kind === 'build' ? s.grid.cells.length : 0), 0)
    expect(placed).toBe(cubes)
  })

  it('only leaves cubes plain when none of their faces show', () => {
    const m = skinToModel(img, { ...skinOpts, hollow: false })
    const guide = buildGuide(m)
    const hidden = m.voxels.filter((v) => FACES.every((f) => v.faces[f] === null)).length
    expect(guide.materials.plainCubes).toBe(hidden)
    expect(guide.materials.paintedCubes + guide.materials.plainCubes).toBe(1664)
  })
})
