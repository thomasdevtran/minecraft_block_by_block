begin;

create table public.community_topics (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.community_profiles(user_id) on delete set null,
  category text not null check (category in ('help', 'finished', 'ideas')),
  title text not null check (char_length(title) between 5 and 120 and title ~ '[^[:space:]]'),
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  locked boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.community_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.community_topics(id) on delete cascade,
  author_id uuid references public.community_profiles(user_id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index community_topics_recent on public.community_topics (created_at desc, id desc) where not hidden;
create index community_topics_category_recent on public.community_topics (category, created_at desc, id desc) where not hidden;
create index community_replies_topic_order on public.community_replies (topic_id, created_at, id);
create index community_topics_author_date on public.community_topics (author_id, created_at desc);
create index community_replies_author_date on public.community_replies (author_id, created_at desc);

alter table public.community_topics enable row level security;
alter table public.community_replies enable row level security;
revoke all on public.community_topics, public.community_replies from public, anon, authenticated;
grant select on public.community_topics, public.community_replies to anon, authenticated;
create policy "Read visible community topics" on public.community_topics
  for select to anon, authenticated using (not hidden);
create policy "Read visible replies in visible topics" on public.community_replies
  for select to anon, authenticated using (
    not hidden and exists (select from public.community_topics topic where topic.id = topic_id and not topic.hidden)
  );

-- Called only by the two write functions. Use an account-specific lock so parallel
-- requests cannot pass the same cooldown or quota check before either inserts.
create function craft_private.require_community_poster(expected_user_id uuid, posting_reply boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  checked_at timestamptz;
begin
  if account_id is null or account_id is distinct from expected_user_id then
    raise insufficient_privilege using message = 'The signed-in account has changed.';
  end if;
  if not exists (select from auth.users where id = account_id and email_confirmed_at is not null) then
    raise insufficient_privilege using message = 'Confirm your email before posting.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:' || account_id::text, 0));
  if not exists (select from public.community_profiles where user_id = account_id) then
    raise sqlstate 'PT403' using message = 'Choose a community username before posting.';
  end if;
  checked_at := pg_catalog.clock_timestamp();
  if exists (select from public.community_topics where author_id = account_id and created_at > checked_at - interval '30 seconds')
     or exists (select from public.community_replies where author_id = account_id and created_at > checked_at - interval '30 seconds') then
    raise sqlstate 'PT429' using message = 'Wait 30 seconds between community posts.';
  end if;
  if posting_reply then
    if (select count(*) from public.community_replies where author_id = account_id and created_at > checked_at - interval '24 hours') >= 30 then
      raise sqlstate 'PT429' using message = 'You can post up to 30 replies in 24 hours.';
    end if;
  elsif (select count(*) from public.community_topics where author_id = account_id and created_at > checked_at - interval '24 hours') >= 5 then
    raise sqlstate 'PT429' using message = 'You can post up to 5 topics in 24 hours.';
  end if;
  return account_id;
end;
$$;
revoke all on function craft_private.require_community_poster(uuid, boolean) from public, anon, authenticated;

create function public.create_community_topic(expected_user_id uuid, topic_category text, topic_title text, topic_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := craft_private.require_community_poster(expected_user_id, false);
  new_topic_id uuid;
begin
  insert into public.community_topics (author_id, category, title, body, created_at)
    values (account_id, topic_category, pg_catalog.btrim(topic_title), pg_catalog.btrim(topic_body), pg_catalog.clock_timestamp())
    returning id into new_topic_id;
  return new_topic_id;
end;
$$;

create function public.create_community_reply(expected_user_id uuid, parent_topic_id uuid, reply_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := craft_private.require_community_poster(expected_user_id, true);
  new_reply_id uuid;
begin
  -- Serialize replies with any future moderator change to the parent topic.
  perform 1 from public.community_topics where id = parent_topic_id and not locked and not hidden for update;
  if not found then
    raise sqlstate 'PT409' using message = 'This topic is closed or unavailable.';
  end if;
  insert into public.community_replies (topic_id, author_id, body, created_at)
    values (parent_topic_id, account_id, pg_catalog.btrim(reply_body), pg_catalog.clock_timestamp())
    returning id into new_reply_id;
  return new_reply_id;
end;
$$;

revoke all on function public.create_community_topic(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_community_reply(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_community_topic(uuid, text, text, text) to authenticated;
grant execute on function public.create_community_reply(uuid, uuid, text) to authenticated;

commit;
