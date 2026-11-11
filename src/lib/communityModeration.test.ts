import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isCommunityModerator, loadCommunityReportQueue, reportCommunityContent, reviewCommunityReport, type CommunityReport } from './communityModeration'

const mocks = vi.hoisted(() => ({
  user: { value: null as { id: string; email_confirmed_at: string | null } | null },
  fetch: vi.fn<typeof fetch>(),
}))
vi.mock('./auth', () => ({ user: mocks.user }))
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://moderation-test.example.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mocks.fetch },
  })
  return { requireSupabase: () => client }
})

const accountId = '10000000-0000-4000-8000-000000000030'
const topicId = '20000000-0000-4000-8000-000000000030'
const replyId = '30000000-0000-4000-8000-000000000030'
const reportId = '40000000-0000-4000-8000-000000000030'
const report = { report_id: reportId, report_revision: 2, content_revision: 4 } as CommunityReport
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const requestBody = (index = 0) => JSON.parse(String(mocks.fetch.mock.calls[index]?.[1]?.body))

beforeEach(() => {
  mocks.user.value = { id: accountId, email_confirmed_at: '2026-11-10' }
  mocks.fetch.mockReset()
})

describe('community reporting and moderation client', () => {
  it.each([{ topicId }, { replyId }])('reports exactly one target with the initiating account', async target => {
    mocks.fetch.mockResolvedValueOnce(json(reportId))
    await expect(reportCommunityContent(target, 'spam', '  Please review this  ')).resolves.toBe(reportId)
    expect(requestBody()).toEqual({
      expected_user_id: accountId, reported_topic_id: 'topicId' in target ? topicId : null,
      reported_reply_id: 'replyId' in target ? replyId : null, report_reason: 'spam', report_details: 'Please review this',
    })
  })

  it('rejects invalid targets and oversized details before making requests', async () => {
    await expect(reportCommunityContent({}, 'spam', '')).rejects.toThrow('one topic or reply')
    await expect(reportCommunityContent({ topicId, replyId }, 'spam', '')).rejects.toThrow('one topic or reply')
    await expect(reportCommunityContent({ topicId: 'invalid' }, 'spam', '')).rejects.toThrow('one topic or reply')
    await expect(reportCommunityContent({ topicId }, 'spam', 'x'.repeat(1001))).rejects.toThrow('1,000')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('requires confirmed sign-in and does not probe moderator membership while signed out', async () => {
    mocks.user.value = null
    await expect(isCommunityModerator()).resolves.toBe(false)
    await expect(reportCommunityContent({ topicId }, 'spam', '')).rejects.toThrow('confirmed email')
    mocks.user.value = { id: accountId, email_confirmed_at: null }
    await expect(loadCommunityReportQueue(false)).rejects.toThrow('confirmed email')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('gets moderator permission from the server', async () => {
    mocks.fetch.mockResolvedValueOnce(json(true))
    await expect(isCommunityModerator()).resolves.toBe(true)
    expect(requestBody()).toEqual({ expected_user_id: accountId })
  })

  it('requests a bounded queue page and detects more results', async () => {
    const rows = Array.from({ length: 21 }, () => report)
    mocks.fetch.mockResolvedValueOnce(json(rows))
    expect(await loadCommunityReportQueue(true, 2)).toEqual({ items: rows.slice(0, 20), hasMore: true })
    expect(requestBody()).toEqual({ expected_user_id: accountId, reviewed: true, page_offset: 40 })
  })

  it.each(['dismiss', 'hide', 'restore'] as const)('sends both revision checks when moderators %s', async action => {
    mocks.fetch.mockResolvedValueOnce(json(reportId))
    await reviewCommunityReport(report, action, '  Reviewed  ')
    expect(requestBody()).toEqual({
      expected_user_id: accountId, report_to_review: reportId, expected_report_revision: 2,
      expected_content_revision: 4, review_action: action, review_note: 'Reviewed',
    })
  })

  it.each([
    ['42501', 403, 'database details', 'do not have permission'],
    ['PT404', 404, 'database details', 'no longer available'],
    ['PT409', 409, 'database details', 'Refresh the queue'],
    ['PT429', 429, 'Wait 10 seconds between reports.', 'Wait 10 seconds'],
    ['PT429', 429, 'database details', 'reporting limit'],
    ['PGRST202', 404, 'database details', 'not available yet'],
  ])('translates %s without exposing internal details', async (code, status, message, expected) => {
    mocks.fetch.mockResolvedValueOnce(json({ code, message }, status))
    await expect(reportCommunityContent({ topicId }, 'spam', '')).rejects.toThrow(expected)
  })

  it('discards queue data after the account switches', async () => {
    mocks.fetch.mockImplementationOnce(async () => {
      mocks.user.value = { id: 'different-account', email_confirmed_at: '2026-11-10' }
      return json([report])
    })
    await expect(loadCommunityReportQueue(false)).rejects.toThrow('sign-in changed')
  })

  it('rejects unexpected server responses and invalid pages', async () => {
    mocks.fetch.mockResolvedValueOnce(json(null))
    await expect(reportCommunityContent({ topicId }, 'spam', '')).rejects.toThrow('Could not submit')
    await expect(loadCommunityReportQueue(false, -1)).rejects.toThrow('valid queue page')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
})
