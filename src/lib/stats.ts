import { loader } from './loader'

export interface Stats {
  total: number
  updatedAt: string
  method: string
  accuracy: string
}

let counted = false

/** Explicit sample data for presentations; never modifies the live counter. */
export const isStatsDemo = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === '1'

function privacySignalEnabled(): boolean {
  return navigator.doNotTrack === '1' ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

/** Count once per page load, including repeat visits, without cookies or identifiers. */
export function countVisit(): void {
  if (isStatsDemo || counted || typeof navigator === 'undefined' || navigator.webdriver || privacySignalEnabled()) return
  counted = true
  void fetch('/api/stats', {
    method: 'POST', credentials: 'omit', keepalive: true,
  }).catch(() => { /* Measurement failures never interrupt a guide. */ })
}

const loadLiveStats = loader<Stats>('/api/stats', 'Visit count unavailable')

export const loadStats = (): Promise<Stats> => isStatsDemo
  ? Promise.resolve({
    total: 10_000,
    updatedAt: new Date().toISOString(),
    method: 'Presentation demo with sample data.',
    accuracy: 'Sample data only; not measured visits.',
  })
  : loadLiveStats()
