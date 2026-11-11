begin;

alter table public.community_topics add column moderation_revision integer not null default 0;
alter table public.community_replies add column moderation_revision integer not null default 0;

-- Membership is assigned by the database operator, never from profile/JWT metadata.
create table craft_private.community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table craft_private.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  topic_id uuid not null references public.community_topics(id) on delete cascade,
  reply_id uuid references public.community_replies(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'unsafe', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default clock_timestamp(),
  resolution text check (resolution in ('dismissed', 'hidden', 'restored')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  moderator_note text not null default '' check (char_length(moderator_note) <= 1000),
  revision integer not null default 0
);
create unique index community_report_topic_once on craft_private.community_reports (reporter_id, topic_id) where reply_id is null;
create unique index community_report_reply_once on craft_private.community_reports (reporter_id, reply_id) where reply_id is not null;
create index community_report_queue on craft_private.community_reports (created_at, id);
create index community_reporter_date on craft_private.community_reports (reporter_id, created_at desc);

create table craft_private.community_moderation_actions (
  id bigint generated always as identity primary key,
  report_id uuid references craft_private.community_reports(id) on delete set null,
  moderator_id uuid references auth.users(id) on delete set null,
  topic_id uuid not null,
  reply_id uuid,
  action text not null check (action in ('dismiss', 'hide', 'restore')),
  note text not null check (char_length(note) <= 1000),
  created_at timestamptz not null default clock_timestamp()
);
alter table craft_private.community_moderators enable row level security;
alter table craft_private.community_reports enable row level security;
alter table craft_private.community_moderation_actions enable row level security;
revoke all on craft_private.community_moderators, craft_private.community_reports,
  craft_private.community_moderation_actions from public, anon, authenticated;

create function craft_private.require_community_moderator(expected_user_id uuid) returns uuid
language plpgsql set search_path = '' as $$
declare account_id uuid := auth.uid();
begin
  if account_id is null or account_id is distinct from expected_user_id
    or not exists (select from auth.users where id = account_id and email_confirmed_at is not null) then
    raise insufficient_privilege using message = 'Moderator access required.';
  end if;
  -- Prevent revocation racing a privileged operation that is already underway.
  perform 1 from craft_private.community_moderators where user_id = account_id for share;
  if not found then raise insufficient_privilege using message = 'Moderator access required.'; end if;
  return account_id;
end;
$$;
revoke all on function craft_private.require_community_moderator(uuid) from public, anon, authenticated;

create function public.is_community_moderator(expected_user_id uuid) returns boolean
language sql security definer set search_path = '' as $$
  select coalesce(auth.uid() = expected_user_id and exists (
    select from craft_private.community_moderators m join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid() and u.email_confirmed_at is not null
  ), false);
$$;

create function public.report_community_content(expected_user_id uuid, reported_topic_id uuid,
  reported_reply_id uuid, report_reason text, report_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  parent_id uuid := reported_topic_id;
  report_id uuid;
  checked_at timestamptz;
begin
  if account_id is null or account_id is distinct from expected_user_id
    or not exists (select from auth.users where id = account_id and email_confirmed_at is not null) then
    raise insufficient_privilege using message = 'Sign in with a confirmed email to report content.';
  end if;
  if (reported_topic_id is null) = (reported_reply_id is null) then
    raise check_violation using message = 'Choose one topic or reply to report.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community-reports:' || account_id::text, 0));
  -- Retries return the same receipt, including after a moderator has reviewed it.
  select id into report_id from craft_private.community_reports where reporter_id = account_id
    and ((reported_reply_id is not null and reply_id = reported_reply_id)
      or (reported_topic_id is not null and topic_id = reported_topic_id and reply_id is null));
  if found then return report_id; end if;
  if reported_reply_id is not null then
    select topic_id into parent_id from public.community_replies where id = reported_reply_id and not hidden;
  end if;
  perform 1 from public.community_topics where id = parent_id and not hidden for share;
  if not found then raise sqlstate 'PT404' using message = 'This content is no longer available.'; end if;
  if reported_reply_id is not null then
    perform 1 from public.community_replies where id = reported_reply_id and not hidden for share;
    if not found then raise sqlstate 'PT404' using message = 'This content is no longer available.'; end if;
  end if;
  checked_at := clock_timestamp();
  if exists (select from craft_private.community_reports where reporter_id = account_id and created_at > checked_at - interval '10 seconds') then
    raise sqlstate 'PT429' using message = 'Wait 10 seconds between reports.';
  end if;
  if (select count(*) from craft_private.community_reports where reporter_id = account_id and created_at > checked_at - interval '24 hours') >= 10 then
    raise sqlstate 'PT429' using message = 'You can submit up to 10 reports in 24 hours.';
  end if;
  insert into craft_private.community_reports (reporter_id, topic_id, reply_id, reason, details)
    values (account_id, parent_id, reported_reply_id, report_reason, btrim(coalesce(report_details, '')))
    returning id into report_id;
  return report_id;
end;
$$;

create function public.community_report_queue(expected_user_id uuid, reviewed boolean, page_offset integer)
returns table (
  report_id uuid, topic_id uuid, reply_id uuid, reason text, details text, reported_at timestamptz,
  reporter_name text, content_title text, content_body text, author_name text,
  content_hidden boolean, topic_hidden boolean, topic_locked boolean, report_revision integer, content_revision integer,
  resolution text, reviewed_at timestamptz, reviewer_name text, moderator_note text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform craft_private.require_community_moderator(expected_user_id);
  if page_offset is null or page_offset < 0 or page_offset > 100000 or reviewed is null then
    raise check_violation using message = 'Invalid queue page.';
  end if;
  return query select r.id, r.topic_id, r.reply_id, r.reason, r.details, r.created_at,
    reporter.username, t.title, case when r.reply_id is null then t.body else reply.body end,
    author.username, case when r.reply_id is null then t.hidden else reply.hidden end,
    t.hidden, t.locked, r.revision, case when r.reply_id is null then t.moderation_revision else reply.moderation_revision end,
    r.resolution, r.reviewed_at, reviewer.username, r.moderator_note
  from craft_private.community_reports r
  join public.community_topics t on t.id = r.topic_id
  left join public.community_replies reply on reply.id = r.reply_id
  left join public.community_profiles reporter on reporter.user_id = r.reporter_id
  left join public.community_profiles author on author.user_id = case when r.reply_id is null then t.author_id else reply.author_id end
  left join public.community_profiles reviewer on reviewer.user_id = r.reviewed_by
  where (r.resolution is not null) = reviewed
  order by r.created_at, r.id limit 21 offset page_offset;
end;
$$;

create function public.review_community_report(expected_user_id uuid, report_to_review uuid,
  expected_report_revision integer, expected_content_revision integer, review_action text, review_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  moderator_id uuid := craft_private.require_community_moderator(expected_user_id);
  report craft_private.community_reports%rowtype;
  parent_id uuid;
  content_version integer;
  note text := btrim(coalesce(review_note, ''));
begin
  if review_action is null or review_action not in ('dismiss', 'hide', 'restore') or char_length(note) > 1000 then
    raise check_violation using message = 'Invalid review action or note.';
  end if;
  select topic_id into parent_id from craft_private.community_reports where id = report_to_review;
  -- Every report/review locks parent before reply/report, avoiding opposing lock orders.
  perform 1 from public.community_topics where id = parent_id for update;
  select * into report from craft_private.community_reports where id = report_to_review for update;
  if not found or report.revision is distinct from expected_report_revision then
    raise sqlstate 'PT409' using message = 'This report changed. Refresh the queue before reviewing it.';
  end if;
  if (review_action in ('dismiss', 'hide') and report.resolution is not null)
    or (review_action = 'restore' and report.resolution is distinct from 'hidden') then
    raise sqlstate 'PT409' using message = 'This report changed. Refresh the queue before reviewing it.';
  end if;
  if report.reply_id is null then
    select moderation_revision into content_version from public.community_topics where id = report.topic_id;
  else
    select moderation_revision into content_version from public.community_replies where id = report.reply_id for update;
  end if;
  if review_action <> 'dismiss' then
    if content_version is distinct from expected_content_revision then
      raise sqlstate 'PT409' using message = 'This content changed. Refresh the queue before reviewing it.';
    end if;
    if report.reply_id is null then
      update public.community_topics set hidden = (review_action = 'hide'), moderation_revision = moderation_revision + 1 where id = report.topic_id;
    else
      update public.community_replies set hidden = (review_action = 'hide'), moderation_revision = moderation_revision + 1 where id = report.reply_id;
    end if;
  end if;
  update craft_private.community_reports set resolution = case review_action when 'dismiss' then 'dismissed' when 'hide' then 'hidden' else 'restored' end,
    reviewed_by = moderator_id, reviewed_at = clock_timestamp(), moderator_note = note, revision = revision + 1 where id = report_to_review;
  insert into craft_private.community_moderation_actions (report_id, moderator_id, topic_id, reply_id, action, note)
    values (report.id, moderator_id, report.topic_id, report.reply_id, review_action, note);
  return report_to_review;
end;
$$;

revoke all on function public.is_community_moderator(uuid) from public, anon, authenticated;
revoke all on function public.report_community_content(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.community_report_queue(uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.review_community_report(uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.is_community_moderator(uuid),
  public.report_community_content(uuid, uuid, uuid, text, text),
  public.community_report_queue(uuid, boolean, integer),
  public.review_community_report(uuid, uuid, integer, integer, text, text) to authenticated;

commit;
