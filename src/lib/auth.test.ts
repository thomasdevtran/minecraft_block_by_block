import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(), getSession: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { auth: { onAuthStateChange: mocks.subscribe, getSession: mocks.getSession } },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ error: null })
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
