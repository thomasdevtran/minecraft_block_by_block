import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMyCommunityProfile, normalizeCommunityUsername, saveMyCommunityUsername } from './communityProfiles'

const mocks = vi.hoisted(() => ({
  currentUser: { value: { id: 'owner-a' } as { id: string } | null },
  getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
  rpc: vi.fn(), single: vi.fn(),
}))
vi.mock('./auth', () => ({ user: mocks.currentUser }))
vi.mock('./supabase', () => ({
  requireSupabase: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc }),
}))

const profile = { user_id: 'owner-a', username: 'cube_crafter', created_at: '2026-11-07', updated_at: '2026-11-07' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.currentUser.value = { id: 'owner-a' }
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-a', email_confirmed_at: '2026-11-07' } }, error: null })
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null })
  mocks.rpc.mockReturnValue({ single: mocks.single })
  mocks.single.mockResolvedValue({ data: profile, error: null })
})

describe('community usernames', () => {
  it('normalizes a chosen public name', () => {
    expect(normalizeCommunityUsername('  Cube_Crafter  ')).toBe('cube_crafter')
  })

  it.each(['ab', '1builder', 'has spaces', '<script>', 'émeraude', 'a'.repeat(25)])('rejects invalid name %s', value => {
    expect(() => normalizeCommunityUsername(value)).toThrow('3–24')
  })

  it.each(['Admin', 'moderator', ' SUPPORT ', 'system', 'blockbycube', 'block_by_cube', 'administrator', 'deleted_user'])('reserves official name %s', value => {
    expect(() => normalizeCommunityUsername(value)).toThrow('reserved')
  })

  it('loads only public profile fields for the verified account', async () => {
    expect(await loadMyCommunityProfile()).toEqual(profile)
    expect(mocks.from).toHaveBeenCalledWith('community_profiles')
    expect(mocks.select).toHaveBeenCalledWith('user_id, username, created_at, updated_at')
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'owner-a')
  })

  it('returns null for an account that has not chosen a username', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await loadMyCommunityProfile()).toBeNull()
  })

  it('uses the guarded RPC without sending email, metadata, or editable ownership', async () => {
    expect(await saveMyCommunityUsername(' Cube_Crafter ')).toEqual(profile)
    expect(mocks.rpc).toHaveBeenCalledWith('set_community_username', {
      expected_user_id: 'owner-a', new_username: 'cube_crafter',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('requires a confirmed email before sending a write', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-a', email_confirmed_at: null } }, error: null })
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('Confirm your email')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not query or save profiles when signed out', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(loadMyCommunityProfile()).rejects.toThrow('Sign in')
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('Sign in')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not write if the account changed while checking sign-in', async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.currentUser.value = { id: 'owner-b' }
      return { data: { user: { id: 'owner-a', email_confirmed_at: '2026-11-07' } }, error: null }
    })
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('sign-in changed')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not rebind a pending save to the new account returned by Auth', async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.currentUser.value = { id: 'owner-b' }
      return { data: { user: { id: 'owner-b', email_confirmed_at: '2026-11-07' } }, error: null }
    })
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('sign-in changed')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('requires a restored local session before asking Auth for an account', async () => {
    mocks.currentUser.value = null
    await expect(loadMyCommunityProfile()).rejects.toThrow('Sign in')
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it.each(['read', 'save'])('discards a completed %s after an account switch', async operation => {
    const complete = async () => {
      mocks.currentUser.value = { id: 'owner-b' }
      return { data: profile, error: null }
    }
    mocks.maybeSingle.mockImplementation(complete)
    mocks.single.mockImplementation(complete)
    await expect(operation === 'read' ? loadMyCommunityProfile() : saveMyCommunityUsername('cube_crafter'))
      .rejects.toThrow('sign-in changed')
  })

  it('translates a uniqueness conflict without exposing database details', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: '23505', message: 'private database detail' } })
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('already taken')
  })

  it.each(['42P01', 'PGRST205'])('reports a missing profile table safely (%s)', async code => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code } })
    await expect(loadMyCommunityProfile()).rejects.toThrow('not available yet')
  })

  it.each(['42883', 'PGRST202'])('reports a missing save operation safely (%s)', async code => {
    mocks.single.mockResolvedValue({ data: null, error: { code } })
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('not available yet')
  })

  it('offers a retry for other service failures without exposing database details', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: '08006', message: 'private database detail' } })
    mocks.single.mockResolvedValue({ data: null, error: { code: '08006', message: 'private database detail' } })
    await expect(loadMyCommunityProfile()).rejects.toThrow('Could not load')
    await expect(saveMyCommunityUsername('cube_crafter')).rejects.toThrow('Could not save')
  })
})
