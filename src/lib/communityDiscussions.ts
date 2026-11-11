import { user } from './auth'
import { requireSupabase } from './supabase'

export const COMMUNITY_CATEGORIES = {
  help: 'Build Help',
  finished: 'Finished Builds',
  ideas: 'Ideas & Feedback',
} as const

export type CommunityCategory = keyof typeof COMMUNITY_CATEGORIES
type Author = { username: string } | null

export interface TopicSummary {
  id: string
  title: string
  category: CommunityCategory
  created_at: string
  author: Author
}

export interface CommunityTopic extends TopicSummary {
  body: string
  locked: boolean
}

export interface CommunityReply {
  id: string
  body: string
  created_at: string
  author: Author
}

const PAGE_SIZE = 20
const TOPIC_FIELDS = 'id,title,category,created_at,author:community_profiles(username)'
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

export function isCommunityReturnPath(path: string) {
  return path === '/community' || path === '/community/new' || path === '/community/moderation'
    || (path.startsWith('/community/') && UUID.test(path.slice('/community/'.length)))
}

const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export const communityDate = (value: string) => dates.format(new Date(value))

function readError(code: string) {
  return new Error(code === '42P01' || code === 'PGRST205'
    ? 'Discussions are not available yet. Please check back later.'
    : 'Could not load the discussion. Please try again.')
}

function pageOf<T>(rows: T[]) {
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
}

export async function listCommunityTopics(category: CommunityCategory | '', page = 0) {
  let query = requireSupabase().from('community_topics').select(TOPIC_FIELDS)
  if (category) query = query.eq('category', category)
  const start = page * PAGE_SIZE
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(start, start + PAGE_SIZE).overrideTypes<TopicSummary[], { merge: false }>()
  if (error) throw readError(error.code)
  return pageOf(data)
}

export async function loadCommunityTopic(id: string): Promise<CommunityTopic | null> {
  if (!UUID.test(id)) return null
  const { data, error } = await requireSupabase().from('community_topics').select(`${TOPIC_FIELDS},body,locked`)
    .eq('id', id).maybeSingle().overrideTypes<CommunityTopic, { merge: false }>()
  if (error) throw readError(error.code)
  return data
}

export async function listCommunityReplies(id: string, page = 0) {
  if (!UUID.test(id)) return pageOf<CommunityReply>([])
  const start = page * PAGE_SIZE
  const { data, error } = await requireSupabase().from('community_replies')
    .select('id,body,created_at,author:community_profiles(username)').eq('topic_id', id)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(start, start + PAGE_SIZE).overrideTypes<CommunityReply[], { merge: false }>()
  if (error) throw readError(error.code)
  return pageOf(data)
}

const postingLimits = new Set([
  'Wait 30 seconds between community posts.',
  'You can post up to 30 replies in 24 hours.',
  'You can post up to 5 topics in 24 hours.',
])

async function publish(rpc: 'create_community_topic' | 'create_community_reply', fields: Record<string, string>) {
  const account = user.value
  if (!account) throw new Error('Sign in to post in Community.')
  if (!account.email_confirmed_at) throw new Error('Confirm your email before posting.')
  const { data, error } = await requireSupabase().rpc(rpc, { ...fields, expected_user_id: account.id })
  if (user.value?.id !== account.id) throw new Error('Your sign-in changed. Please try again.')
  if (error?.code === 'PT403') throw new Error('Choose a community username before posting.')
  if (error?.code === 'PT409') throw new Error('This topic is closed or unavailable.')
  if (error?.code === 'PT429') throw new Error(postingLimits.has(error.message) ? error.message : 'You’ve reached a posting limit. Try again later.')
  if (error?.code === '42501') throw new Error('Sign in with a confirmed email before posting.')
  if (error?.code === 'PGRST202' || error?.code === '42883') throw readError('42P01')
  if (error || typeof data !== 'string' || !UUID.test(data)) throw new Error('Could not publish your post. Please try again.')
  return data
}

export async function createCommunityTopic(category: CommunityCategory, title: string, body: string) {
  title = title.trim()
  body = body.trim()
  if (!Object.hasOwn(COMMUNITY_CATEGORIES, category)) throw new Error('Choose a category.')
  if (title.length < 5 || title.length > 120) throw new Error('Use a title between 5 and 120 characters.')
  if (!body || body.length > 4000) throw new Error('Enter a message of up to 4,000 characters.')
  return publish('create_community_topic', { topic_category: category, topic_title: title, topic_body: body })
}

export async function createCommunityReply(topicId: string, body: string) {
  body = body.trim()
  if (!UUID.test(topicId)) throw new Error('This topic is closed or unavailable.')
  if (!body || body.length > 2000) throw new Error('Enter a reply of up to 2,000 characters.')
  return publish('create_community_reply', { parent_topic_id: topicId, reply_body: body })
}
