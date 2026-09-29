import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { faceImage } from '../scripts/texture-uv.ts'

describe('block face texture coordinates', () => {
  const texture = new PNG({ width: 16, height: 32 })
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) texture.data.set([x, y, 0, 255], (y * 16 + x) * 4)
  it('preserves the original first frame for untransformed textures', () => {
    expect(faceImage(texture, [0, 0, 16, 16]).data).toEqual(texture.data.subarray(0, 16 * 16 * 4))
  })
  it('mirrors observer tops and dried kelp side faces without rotating the other axis', () => {
    expect([...faceImage(texture, [0, 16, 16, 0]).data.subarray(0, 4)]).toEqual([0, 15, 0, 255])
    expect([...faceImage(texture, [16, 0, 0, 16]).data.subarray(0, 4)]).toEqual([15, 0, 0, 255])
  })
  it('preserves clockwise rotation', () => {
    expect([...faceImage(texture, [0, 0, 16, 16], 90).data.subarray(0, 4)]).toEqual([0, 15, 0, 255])
  })
})
