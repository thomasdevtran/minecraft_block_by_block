import { user } from './auth'
import { requireSupabase } from './supabase'

export const REPORT_REASONS = {
  spam: 'Spam or advertising',
  abuse: 'Harassment or abuse',
  unsafe: 'Unsafe or harmful content',
  other: 'Something else',
} as const
export type ReportReason = keyof typeof REPORT_REASONS
export type ReviewAction = 'dismiss' | 'hide' | 'restore'

export interface CommunityReport {
  report_id: string
  topic_id: string
  reply_id: string | null
  reason: ReportReason
  details: string
  reported_at: string
  reporter_name: string | null
  content_title: string
  content_body: string
  author_name: string | null
  content_hidden: boolean
  topic_hidden: boolean
  topic_locked: boolean
  report_revision: number
  content_revision: number
  resolution: 'dismissed' | 'hidden' | 'restored' | null
  reviewed_at: string | null
  reviewer_name: string | null
  moderator_note: string
}

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const reportLimits = new Set(['Wait 10 seconds between reports.', 'You can submit up to 10 reports in 24 hours.'])

async function accountRpc(name: string, args: Record<string, unknown>) {
  const account = user.value
  if (!account?.email_confirmed_at) throw new Error('Sign in with a confirmed email to continue.')
  const { data, error } = await requireSupabase().rpc(name, { ...args, expected_user_id: account.id })
  if (user.value?.id !== account.id) throw new Error('Your sign-in changed. Please try again.')
  if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Reporting and moderation are not available yet. Please check back later.')
  if (error?.code === '42501') throw new Error('You do not have permission to do this. Check your sign-in and refresh the page.')
  if (error?.code === 'PT404') throw new Error('This content is no longer available.')
  if (error?.code === 'PT409') throw new Error('This report or content changed. Refresh the queue before reviewing it.')
  if (error?.code === 'PT429') throw new Error(reportLimits.has(error.message) ? error.message : 'You’ve reached a reporting limit. Try again later.')
  if (error) throw new Error('Could not complete this action. Please try again.')
  return data as unknown
}

export async function isCommunityModerator(): Promise<boolean> {
  if (!user.value?.email_confirmed_at) return false
  return (await accountRpc('is_community_moderator', {})) === true
}

export async function reportCommunityContent(target: { topicId?: string; replyId?: string }, reason: ReportReason, details: string) {
  if (Boolean(target.topicId) === Boolean(target.replyId) || !UUID.test(target.topicId ?? target.replyId ?? '')) throw new Error('Choose one topic or reply to report.')
  if (!Object.hasOwn(REPORT_REASONS, reason)) throw new Error('Choose a report reason.')
  details = details.trim()
  if (details.length > 1000) throw new Error('Keep report details under 1,000 characters.')
  const id = await accountRpc('report_community_content', {
    reported_topic_id: target.topicId ?? null, reported_reply_id: target.replyId ?? null,
    report_reason: reason, report_details: details,
  })
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Could not submit your report. Please try again.')
  return id
}

export async function loadCommunityReportQueue(reviewed: boolean, page = 0) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 5000) throw new Error('Choose a valid queue page.')
  const rows = await accountRpc('community_report_queue', { reviewed, page_offset: page * 20 })
  if (!Array.isArray(rows)) throw new Error('Could not load reports. Please try again.')
  return { items: rows.slice(0, 20) as CommunityReport[], hasMore: rows.length > 20 }
}

export async function reviewCommunityReport(report: CommunityReport, action: ReviewAction, note: string) {
  if (!UUID.test(report.report_id) || !['dismiss', 'hide', 'restore'].includes(action)) throw new Error('Choose a valid report and action.')
  if (note.trim().length > 1000) throw new Error('Keep the moderator note under 1,000 characters.')
  const id = await accountRpc('review_community_report', {
    report_to_review: report.report_id, expected_report_revision: report.report_revision,
    expected_content_revision: report.content_revision, review_action: action, review_note: note.trim(),
  })
  if (id !== report.report_id) throw new Error('Could not save the review. Refresh the queue before trying again.')
}
