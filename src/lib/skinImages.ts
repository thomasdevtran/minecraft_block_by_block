import { loadPixels } from '../engine/pixels'

const MAX_SKIN_BYTES = 1024 * 1024

/** Check the bounded PNG header before handing any bytes to the image decoder. */
export async function readSkinPng(source: Blob | string): Promise<Blob> {
  let blob: Blob
  if (typeof source === 'string') {
    if (!source.startsWith('data:image/png;base64,') || source.length > 1_400_000) {
      throw new Error('Choose a valid skin PNG up to 1 MB.')
    }
    blob = await fetch(source).then(response => response.blob())
  } else {
    blob = source
  }
  if (blob.size > MAX_SKIN_BYTES) throw new Error('Choose a skin PNG up to 1 MB.')
  const header = new DataView(await blob.slice(0, 33).arrayBuffer())
  if (header.byteLength < 33 || header.getUint32(0) !== 0x89504e47 ||
    header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) {
    throw new Error('This file is not a valid PNG skin.')
  }
  if (header.getUint32(16) !== 64 || ![32, 64].includes(header.getUint32(20))) {
    throw new Error('Use a 64×64 or 64×32 skin PNG.')
  }
  return blob
}

export async function loadSkinPixels(source: Blob | string) {
  return loadPixels(await readSkinPng(source))
}
