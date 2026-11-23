begin;

-- Groundwork for adding features: indexed foreign keys, one account check, shared rate-limit
-- helpers, categories as data, and clean-up of skin images nobody uses any more.

-- 1. Indexes. Postgres doesn't index foreign keys on its own, so deleting a topic, reply, report or
-- account had to scan these tables to find the rows that point at it.
create index community_reports_topic on craft_private.community_reports (topic_id);
create index community_reports_reply on craft_private.community_reports (reply_id);
create index community_reports_reviewer on craft_private.community_reports (reviewed_by);
create index community_moderation_actions_report on craft_private.community_moderation_actions (report_id);
create index community_moderation_actions_moderator on craft_private.community_moderation_actions (moderator_id);

-- The queue filters on (resolution is not null) = reviewed, so the open queue no longer has to step
-- past every reviewed report. Postgres rewrites "= false" as "resolution is null" when it plans for a
-- known value, which only the partial index matches; the expression index serves everything else.
create index community_report_queue_by_state on craft_private.community_reports ((resolution is not null), created_at, id);
create index community_report_queue_open on craft_private.community_reports (created_at, id) where resolution is null;
drop index craft_private.community_report_queue;

-- 2. Skin images. Deleting a saved build used to leave its image behind, and those images still
-- counted toward the 100-image upload limit. Owners can now delete an image once none of their
-- saved builds use it; the app does that straight after deleting the build.
create policy "Delete own unused build images" on storage.objects for delete to authenticated using (
  bucket_id = 'build-skins'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select from public.saved_builds build where build.image_path = objects.name)
);

-- 3. Names for the two checks Postgres could only number. New constraints should always be named.
alter table public.saved_builds rename constraint saved_builds_check to saved_builds_step_range;
alter table public.saved_builds rename constraint saved_builds_check1 to saved_builds_kind_fields;

-- 4. One account check for every write. Add future rules (bans, MFA, account age) here, and every
-- function that calls it picks them up.
create function craft_private.require_member(expected_user_id uuid, unconfirmed_message text) returns uuid
language plpgsql set search_path = '' as $$
declare
  account_id uuid := auth.uid();
begin
  -- Also protects an in-flight request if the browser switches accounts.
  if account_id is null or account_id is distinct from expected_user_id then
    raise insufficient_privilege using message = 'The signed-in account has changed.';
  end if;
  if not exists (select from auth.users where id = account_id and email_confirmed_at is not null) then
    raise insufficient_privilege using message = unconfirmed_message;
  end if;
  perform craft_private.require_age_screen(account_id);
  return account_id;
end;
$$;
revoke all on function craft_private.require_member(uuid, text) from public, anon, authenticated;

-- 5. Rate limits. Every action that counts toward a limit, read from the tables that already record
-- it. A new kind of action is one more branch here plus a require_cooldown/require_quota call.
create view craft_private.account_actions with (security_invoker = true) as
  select author_id as user_id, 'topic'::text as kind, created_at from public.community_topics
  union all
  select author_id, 'reply', created_at from public.community_replies
  union all
  select reporter_id, 'report', created_at from craft_private.community_reports;
revoke all on craft_private.account_actions from public, anon, authenticated;

-- Callers must already hold their own per-account advisory lock, so parallel requests can't both pass.
-- These helpers deliberately take no lock of their own: a shared one, taken after the row locks
-- that replies and reports hold on a topic, could deadlock.
create function craft_private.require_cooldown(account_id uuid, action_kinds text[], cooldown interval, limit_message text)
returns void language plpgsql set search_path = '' as $$
begin
  if exists (select from craft_private.account_actions where user_id = account_id
      and kind = any (action_kinds) and created_at > pg_catalog.clock_timestamp() - cooldown) then
    raise sqlstate 'PT429' using message = limit_message;
  end if;
end;
$$;

create function craft_private.require_quota(account_id uuid, action_kind text, max_count integer, period interval, limit_message text)
returns void language plpgsql set search_path = '' as $$
begin
  if (select count(*) from craft_private.account_actions where user_id = account_id
      and kind = action_kind and created_at > pg_catalog.clock_timestamp() - period) >= max_count then
    raise sqlstate 'PT429' using message = limit_message;
  end if;
end;
$$;
revoke all on function craft_private.require_cooldown(uuid, text[], interval, text),
  craft_private.require_quota(uuid, text, integer, interval, text) from public, anon, authenticated;

-- 6. Categories as data. Add one with an insert; retire one by setting accepts_topics = false
-- (its topics stay readable). Retire categories rather than deleting them: topics still point at them.
create table public.community_categories (
  id text primary key constraint community_category_id_format check (id collate "C" ~ '^[a-z][a-z0-9_]{1,23}$'),
  label text not null constraint community_category_label_length check (char_length(label) between 1 and 40 and label ~ '[^[:space:]]'),
  sort_order integer not null default 0,
  accepts_topics boolean not null default true
);
insert into public.community_categories (id, label, sort_order) values
  ('help', 'Build Help', 1),
  ('finished', 'Finished Builds', 2),
  ('ideas', 'Ideas & Feedback', 3);
alter table public.community_categories enable row level security;
revoke all on public.community_categories from public, anon, authenticated;
grant select on public.community_categories to anon, authenticated;
create policy "Read community categories" on public.community_categories
  for select to anon, authenticated using (true);
alter table public.community_topics
  drop constraint community_topics_category_check,
  add constraint community_topics_category_fkey foreign key (category) references public.community_categories (id);

-- 7. The earlier write functions, rebuilt on the shared checks. Behaviour, error codes and limits are
-- unchanged, apart from also rejecting categories that no longer accept topics.
create or replace function public.set_community_username(expected_user_id uuid, new_username text)
returns setof public.community_profiles
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := craft_private.require_member(expected_user_id, 'Confirm your email before choosing a community username.');
begin
  return query
    insert into public.community_profiles as profile (user_id, username)
    values (account_id, pg_catalog.lower(pg_catalog.btrim(new_username)))
    on conflict (user_id) do update
      set username = excluded.username,
          updated_at = case when profile.username = excluded.username then profile.updated_at
            else pg_catalog.statement_timestamp() end
    returning profile.*;
end;
$$;

create or replace function craft_private.require_community_poster(expected_user_id uuid, posting_reply boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  account_id uuid := craft_private.require_member(expected_user_id, 'Confirm your email before posting.');
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:' || account_id::text, 0));
  if not exists (select from public.community_profiles where user_id = account_id) then
    raise sqlstate 'PT403' using message = 'Choose a community username before posting.';
  end if;
  perform craft_private.require_cooldown(account_id, array['topic', 'reply'], interval '30 seconds',
    'Wait 30 seconds between community posts.');
  if posting_reply then
    perform craft_private.require_quota(account_id, 'reply', 30, interval '24 hours', 'You can post up to 30 replies in 24 hours.');
  else
    perform craft_private.require_quota(account_id, 'topic', 5, interval '24 hours', 'You can post up to 5 topics in 24 hours.');
  end if;
  return account_id;
end;
$$;

create or replace function public.create_community_topic(expected_user_id uuid, topic_category text, topic_title text, topic_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := craft_private.require_community_poster(expected_user_id, false);
  new_topic_id uuid;
begin
  if not exists (select from public.community_categories where id = topic_category and accepts_topics) then
    raise check_violation using message = 'Choose a category.';
  end if;
  insert into public.community_topics (author_id, category, title, body, created_at)
    values (account_id, topic_category, pg_catalog.btrim(topic_title), pg_catalog.btrim(topic_body), pg_catalog.clock_timestamp())
    returning id into new_topic_id;
  return new_topic_id;
end;
$$;

create or replace function public.report_community_content(expected_user_id uuid, reported_topic_id uuid,
  reported_reply_id uuid, report_reason text, report_details text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := craft_private.require_member(expected_user_id, 'Sign in with a confirmed email to report content.');
  parent_id uuid := reported_topic_id;
  report_id uuid;
begin
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
  perform craft_private.require_cooldown(account_id, array['report'], interval '10 seconds', 'Wait 10 seconds between reports.');
  perform craft_private.require_quota(account_id, 'report', 10, interval '24 hours', 'You can submit up to 10 reports in 24 hours.');
  insert into craft_private.community_reports (reporter_id, topic_id, reply_id, reason, details)
    values (account_id, parent_id, reported_reply_id, report_reason, pg_catalog.btrim(coalesce(report_details, '')))
    returning id into report_id;
  return report_id;
end;
$$;

commit;
