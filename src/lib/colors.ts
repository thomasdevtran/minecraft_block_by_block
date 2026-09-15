import { fromHex } from '../engine/pixels'

/** Black or white, whichever reads better on top of `hex`. */
export function textOn(hex: string): string {
  const { r, g, b } = fromHex(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b1712' : '#ffffff'
}
