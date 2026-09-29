/** Palette indices follow FACES; -1 means a hidden, unpainted face. */
export type ShapeCube = [number, number, number, number, number, number, number, number, number]
export interface ShapeData {
  size: [number, number, number]
  palette: string[]
  cubes: ShapeCube[]
}

export function validateShape(value: unknown): asserts value is ShapeData {
  const data = value as ShapeData | null
  if (!data || !Array.isArray(data.size) || data.size.length !== 3 || !data.size.every(n => Number.isInteger(n) && n > 0 && n <= 32) ||
    !Array.isArray(data.palette) || !data.palette.length || !data.palette.every(c => /^#[0-9a-f]{6}$/i.test(c)) ||
    !Array.isArray(data.cubes) || !data.cubes.length || data.cubes.length > 32768) throw new Error('Invalid build shape.')
  const seen = new Set<string>()
  for (const cube of data.cubes) {
    if (!Array.isArray(cube) || cube.length !== 9 || !cube.every(Number.isInteger) ||
      cube.slice(0, 3).some((n, i) => n < 0 || n >= data.size[i]!) ||
      cube.slice(3).some(n => n < -1 || n >= data.palette.length)) throw new Error('Invalid cube in build shape.')
    const key = cube.slice(0, 3).join(',')
    if (seen.has(key)) throw new Error('Duplicate cube in build shape.')
    seen.add(key)
  }
}

