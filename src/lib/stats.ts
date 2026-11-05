import { loader } from './loader'

export interface Stats {
  total: number
  updatedAt: string
  method: string
  accuracy: string
}

let counted = false

function privacySignalEnabled(): boolean {
  return navigator.doNotTrack === '1' ||
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

/** Count once per page load, including repeat visits, without cookies or identifiers. */
export function countVisit(): void {
  if (counted || typeof navigator === 'undefined' || navigator.webdriver || privacySignalEnabled()) return
  counted = true
  void fetch('/api/stats', {
    method: 'POST', credentials: 'omit', keepalive: true,
  }).catch(() => { /* Measurement failures never interrupt a guide. */ })
}

export const loadStats = loader<Stats>('/api/stats', 'Visit count unavailable')
