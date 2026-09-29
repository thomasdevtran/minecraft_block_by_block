import { PNG } from 'pngjs'

export type UV = [number, number, number, number]

/** Sample a face at normalized coordinates, including mirrored UVs and quarter turns. */
export function sampleFace(png: PNG, uv: UV, u: number, v: number, rotation = 0): [number, number, number, number] {
  for (let turn = 0; turn < ((rotation / 90) % 4 + 4) % 4; turn++) [u, v] = [v, 1 - u]
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(uv[0] + (uv[2] - uv[0]) * u)))
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(uv[1] + (uv[3] - uv[1]) * v)))
  const i = (y * png.width + x) * 4
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!]
}

export function faceImage(png: PNG, uv: UV, rotation = 0): PNG {
  const out = new PNG({ width: 16, height: 16 })
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    out.data.set(sampleFace(png, uv, (x + .5) / 16, (y + .5) / 16, rotation), (y * 16 + x) * 4)
  }
  return out
}
