export function paintLimit(value: unknown, fallback: number): number {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isInteger(number) && number >= 2 && number <= 32 ? number : fallback
}

export function flag(value: unknown, fallback: boolean): boolean {
  return value === '1' ? true : value === '0' ? false : fallback
}
