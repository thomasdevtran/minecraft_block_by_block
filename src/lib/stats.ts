import { ref } from 'vue'
import { loader } from './loader'
import { whenIdle } from './schedule'
import { readStored, writeStored } from './storage'

export interface Stats {
  total: number
  updatedAt: string
  method: string
  accuracy: string
}

type Choice = 'allow' | 'deny' | null
const KEY = 'privacy:visitor-count:v1'
const stored = readStored<Choice>(KEY, null)
export const visitorChoice = ref<Choice>(stored === 'allow' || stored === 'deny' ? stored : null)
let counted = false

export function privacySignalEnabled(): boolean {
  return typeof navigator !== 'undefined' &&
    (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true)
}

export function setVisitorChoice(choice: Exclude<Choice, null>): void {
  visitorChoice.value = choice
  writeStored(KEY, choice)
  if (choice === 'allow') countVisit()
}

/** Recheck consent inside the deferred callback in case permission was withdrawn. */
export function countVisit(): void {
  if (counted || typeof navigator === 'undefined' || navigator.webdriver) return
  if (visitorChoice.value !== 'allow' || privacySignalEnabled()) return
  whenIdle(() => {
    if (counted || visitorChoice.value !== 'allow' || privacySignalEnabled()) return
    counted = true
    void fetch('/api/stats', {
      method: 'POST', headers: { 'X-Visitor-Consent': 'granted' },
      credentials: 'omit', keepalive: true,
    }).catch(() => { /* Optional measurement never interrupts a guide. */ })
  })
}

export const loadStats = loader<Stats>('/api/stats', 'Visitor count unavailable')
