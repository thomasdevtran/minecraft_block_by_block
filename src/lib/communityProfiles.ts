import { user as signedInUser } from './auth'
import { requireSupabase } from './supabase'

export interface CommunityProfile {
  user_id: string
  username: string
  created_at: string
  updated_at: string
}

const PROFILE_FIELDS = 'user_id, username, created_at, updated_at'
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'moderator', 'support', 'system',
  'blockbycube', 'block_by_cube', 'deleted_user',
])

export function normalizeCommunityUsername(value: string): string {
  const username = value.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) {
    throw new Error('Use 3–24 letters, numbers, or underscores, starting with a letter.')
  }
  if (RESERVED_USERNAMES.has(username)) throw new Error('That username is reserved. Choose another one.')
  return username
}

function checkAccount(accountId: string): void {
  if (signedInUser.value?.id !== accountId) {
    throw new Error('Your sign-in changed. Reload your account before continuing.')
  }
}

async function communityAccount() {
  const expectedAccountId = signedInUser.value?.id
  if (!expectedAccountId) throw new Error('Sign in to manage your community username.')
  const client = requireSupabase()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new Error('Sign in to manage your community username.')
  checkAccount(expectedAccountId)
  if (user.id !== expectedAccountId) throw new Error('Your sign-in changed. Reload your account before continuing.')
  return { client, account: user }
}

export async function loadMyCommunityProfile(): Promise<CommunityProfile | null> {
  const { client, account } = await communityAccount()
  const { data, error } = await client.from('community_profiles')
    .select(PROFILE_FIELDS).eq('user_id', account.id).maybeSingle()
  checkAccount(account.id)
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    throw new Error('Community usernames are not available yet. Please check back later.')
  }
  if (error) throw new Error('Could not load your community username. Please try again.')
  return data as CommunityProfile | null
}

export async function saveMyCommunityUsername(value: string): Promise<CommunityProfile> {
  const username = normalizeCommunityUsername(value)
  const { client, account } = await communityAccount()
  if (!account.email_confirmed_at) throw new Error('Confirm your email before choosing a community username.')
  const { data, error } = await client.rpc('set_community_username', {
    expected_user_id: account.id,
    new_username: username,
  }).single()
  checkAccount(account.id)
  if (error?.code === '23505') throw new Error('That username is already taken. Choose another one.')
  if (error?.code === '42501') throw new Error('Sign in with a confirmed email before choosing a community username.')
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    throw new Error('Community usernames are not available yet. Please check back later.')
  }
  if (error || !data) throw new Error('Could not save your community username. Please try again.')
  return data as CommunityProfile
}
