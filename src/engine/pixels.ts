export interface PixelImage {
  width: number
  height: number
  /** RGBA bytes, row by row from the top-left. */
  data: Uint8ClampedArray | Uint8Array
}

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Pixels below this alpha count as empty (no cube). */
export const ALPHA_CUTOFF = 128

export function getPixel(img: PixelImage, x: number, y: number): Rgba {
  const i = (y * img.width + x) * 4
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] }
}

export function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function fromHex(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Browser only: encode pixels as a PNG data URL, e.g. for an <img>. */
export function pixelsToDataUrl(img: PixelImage): string {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  return canvas.toDataURL('image/png')
}

/** Browser only: decode an image URL or uploaded file into raw pixels. */
export async function loadPixels(src: string | Blob): Promise<PixelImage> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { width: canvas.width, height: canvas.height, data }
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url)
  }
}
