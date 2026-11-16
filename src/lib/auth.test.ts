import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(), getSession: vi.fn(), load: vi.fn(),
}))
vi.mock('./supabase', () => {
  const client = { auth: { onAuthStateChange: mocks.subscribe, getSession: mocks.getSession } }
  return {
    accountsEnabled: true,
    sessionStorageKey: 'sb-test-auth-token',
    requireSupabase: mocks.load,
    // Behaves as if the client had already loaded, so the listeners attach on import.
    whenSupabaseLoads: (listener: (c: typeof client) => void) => listener(client),
  }
})
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ error: null })
  mocks.load.mockResolvedValue(undefined)
})

function session(id: string) {
  return { user: { id } } as Session
}

describe('account recovery state', () => {
  it('clears recovery mode on sign-out and keeps it cleared for the next account', async () => {
    const auth = await import('./auth')
    const notify = mocks.subscribe.mock.calls[0][0] as (event: AuthChangeEvent, value: Session | null) => void
    notify('PASSWORD_RECOVERY', session('owner-a'))
    expect(auth.recoveringPassword.value).toBe(true)
    notify('SIGNED_OUT', null)
    expect(auth.recoveringPassword.value).toBe(false)
    notify('SIGNED_IN', session('owner-b'))
    expect(auth.recoveringPassword.value).toBe(false)
  })

  it('keeps recovery mode for token refreshes and clears it when the account changes', async () => {
    const auth = await import('./auth')
    const notify = mocks.subscribe.mock.calls[0][0] as (event: AuthChangeEvent, value: Session | null) => void
    notify('PASSWORD_RECOVERY', session('owner-a'))
    notify('TOKEN_REFRESHED', session('owner-a'))
    expect(auth.recoveringPassword.value).toBe(true)
    notify('SIGNED_IN', session('owner-b'))
    expect(auth.recoveringPassword.value).toBe(false)
  })
})

describe('loading the account library', () => {
  it('does not load Supabase for a visitor with no saved sign-in', async () => {
    const auth = await import('./auth')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(auth.authReady.value).toBe(true)
    expect(auth.user.value).toBeNull()
  })
})

describe('age screen', () => {
  it('matches the database rule: the 13th-birthday month still counts as under 13', async () => {
    const { oldEnough } = await import('./auth')
    const today = new Date(Date.UTC(2026, 10, 15)) // 15 November 2026
    expect(oldEnough(10, 2013, today)).toBe(true) // turned 13 in October
    expect(oldEnough(11, 2013, today)).toBe(false) // turns 13 sometime this month
    expect(oldEnough(12, 2013, today)).toBe(false)
    expect(oldEnough(1, 2014, today)).toBe(false)
    expect(oldEnough(12, 2012, today)).toBe(true)
    expect(oldEnough(4, 1990, today)).toBe(true)
  })
})
