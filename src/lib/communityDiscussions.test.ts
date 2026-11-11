import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCommunityReply, createCommunityTopic, isCommunityReturnPath, listCommunityTopics, loadCommunityTopic } from './communityDiscussions'

const mocks = vi.hoisted(() => ({
  user: { value: null as { id: string; email_confirmed_at: string | null } | null },
  fetch: vi.fn<typeof fetch>(),
}))
vi.mock('./auth', () => ({ user: mocks.user }))
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://community-test.example.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mocks.fetch },
  })
  return { requireSupabase: () => client }
})

const topicId = '20000000-0000-4000-8000-000000000001'
const accountId = '10000000-0000-4000-8000-000000000001'
const replyId = '30000000-0000-4000-8000-000000000001'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  mocks.user.value = { id: accountId, email_confirmed_at: '2026-11-10' }
  mocks.fetch.mockReset()
})

describe('community discussion client', () => {
  it('filters topics and uses the extra record to detect another page', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, title: `Topic ${i}`, category: 'help' }))
    mocks.fetch.mockResolvedValueOnce(json(rows))
    const page = await listCommunityTopics('help', 1)
    expect(page).toEqual({ items: rows.slice(0, 20), hasMore: true })
    const url = new URL(String(mocks.fetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('category')).toBe('eq.help')
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc')
    expect(url.searchParams.get('offset')).toBe('20')
    expect(url.searchParams.get('limit')).toBe('21')
  })

  it('treats a hidden or missing topic as unavailable', async () => {
    mocks.fetch.mockResolvedValueOnce(json([]))
    await expect(loadCommunityTopic(topicId)).resolves.toBeNull()
  })

  it('does not query invalid topic IDs and allows only known local return routes', async () => {
    for (const path of ['/community', '/community/new', '/community/moderation', `/community/${topicId}`]) expect(isCommunityReturnPath(path)).toBe(true)
    for (const path of ['//other.example/community', '/community/../account', '/community/new?next=//other.example', '/community/%2fexample', 'https://example.invalid/community']) {
      expect(isCommunityReturnPath(path)).toBe(false)
    }
    await expect(loadCommunityTopic('invalid')).resolves.toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('shows a friendly fallback when the migration is missing', async () => {
    mocks.fetch.mockResolvedValueOnce(json({ code: 'PGRST205', message: 'database details' }, 404))
    await expect(listCommunityTopics('')).rejects.toThrow('not available yet')
  })

  it('publishes trimmed content with the initiating account and reads the new ID', async () => {
    mocks.fetch.mockResolvedValueOnce(json(topicId)).mockResolvedValueOnce(json(replyId))
    await expect(createCommunityTopic('help', '  Acacia Boat help  ', '  Which row joins them? ')).resolves.toBe(topicId)
    await expect(createCommunityReply(topicId, '  Row three.  ')).resolves.toBe(replyId)
    const calls = mocks.fetch.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, JSON.parse(String(init?.body))])
    expect(calls).toEqual([
      ['/rest/v1/rpc/create_community_topic', { expected_user_id: accountId, topic_category: 'help', topic_title: 'Acacia Boat help', topic_body: 'Which row joins them?' }],
      ['/rest/v1/rpc/create_community_reply', { expected_user_id: accountId, parent_topic_id: topicId, reply_body: 'Row three.' }],
    ])
  })

  it('blocks invalid text and ineligible sessions before making a write request', async () => {
    await expect(createCommunityTopic('help', 'short', ' \n ')).rejects.toThrow('Enter a message')
    await expect(createCommunityReply(topicId, 'x'.repeat(2001))).rejects.toThrow('2,000')
    mocks.user.value = { id: accountId, email_confirmed_at: null }
    await expect(createCommunityReply(topicId, 'Reply')).rejects.toThrow('Confirm your email')
    mocks.user.value = null
    await expect(createCommunityTopic('help', 'Valid title', 'Message')).rejects.toThrow('Sign in')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['PT403', 403, 'internal details', 'Choose a community username'],
    ['PT409', 409, 'internal details', 'closed or unavailable'],
    ['PT429', 429, 'Wait 30 seconds between community posts.', 'Wait 30 seconds'],
    ['PT429', 429, 'internal details', 'posting limit'],
  ])('handles posting failure %s', async (code, status, message, expected) => {
    mocks.fetch.mockResolvedValueOnce(json({ code, message }, status))
    await expect(createCommunityReply(topicId, 'Reply')).rejects.toThrow(expected)
  })

  it('discards a successful response when the account changed in flight', async () => {
    mocks.fetch.mockImplementationOnce(async () => {
      mocks.user.value = null
      return json(replyId)
    })
    await expect(createCommunityReply(topicId, 'Reply')).rejects.toThrow('sign-in changed')
  })
})
