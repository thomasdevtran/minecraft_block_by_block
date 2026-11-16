begin;

-- Neutral age screen. Sign-up asks everyone for a birth month and year; under-13s are not given an
-- account, so no personal information is collected from them. Only the outcome is kept here: the
-- birth month and year are checked and then removed from the new account's metadata.
create table craft_private.age_screens (
  -- Deferred so the sign-up trigger below can record the outcome before the user row is written.
  user_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  passed boolean not null,
  screened_at timestamptz not null default now()
);
alter table craft_private.age_screens enable row level security;
revoke all on craft_private.age_screens from public, anon, authenticated;

-- True when someone born in this month and year is 13 or older today. The day is never asked, so
-- the month of a 13th birthday still counts as under 13. Mirrors oldEnough() in src/lib/auth.ts.
create function craft_private.at_least_13(birth_month integer, birth_year integer) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  today date := (pg_catalog.now() at time zone 'utc')::date;
begin
  if birth_month is null or birth_year is null or birth_month not between 1 and 12
    or birth_year < 1900 or birth_year > pg_catalog.date_part('year', today) then
    raise check_violation using message = 'Enter a valid birth month and year.';
  end if;
  return pg_catalog.make_date(birth_year + 13, birth_month, 1) < pg_catalog.date_trunc('month', today)::date;
end;
$$;
revoke all on function craft_private.at_least_13(integer, integer) from public, anon, authenticated;

-- Runs before every new Auth user is written. Sign-ups from the site carry birth_month/birth_year in
-- their metadata: an under-13 answer rejects the sign-up outright, and otherwise the two fields are
-- removed from the row before it is stored, so the birth date is never kept. Changing NEW needs no
-- extra rights on auth.users. Accounts created without an answer (the dashboard, or before this
-- check existed) are asked once on /account.
create function craft_private.screen_new_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  month_text text := new.raw_user_meta_data ->> 'birth_month';
  year_text text := new.raw_user_meta_data ->> 'birth_year';
begin
  if month_text is null and year_text is null then
    return new;
  end if;
  if month_text is null or year_text is null or month_text !~ '^[0-9]{1,2}$' or year_text !~ '^[0-9]{4}$' then
    raise check_violation using message = 'Enter a valid birth month and year.';
  end if;
  if not craft_private.at_least_13(month_text::integer, year_text::integer) then
    raise insufficient_privilege using message = 'Accounts are not available.';
  end if;
  insert into craft_private.age_screens (user_id, passed) values (new.id, true);
  new.raw_user_meta_data := new.raw_user_meta_data - 'birth_month' - 'birth_year';
  return new;
end;
$$;
revoke all on function craft_private.screen_new_account() from public, anon, authenticated;
create trigger screen_new_account before insert on auth.users
  for each row execute function craft_private.screen_new_account();

-- For accounts that have no answer yet. The first answer is final, so it can't be retried.
create function public.confirm_age(expected_user_id uuid, birth_month integer, birth_year integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  result boolean;
begin
  if account_id is null or account_id is distinct from expected_user_id then
    raise insufficient_privilege using message = 'The signed-in account has changed.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('age:' || account_id::text, 0));
  select passed into result from craft_private.age_screens where user_id = account_id;
  if found then
    return result;
  end if;
  result := craft_private.at_least_13(birth_month, birth_year);
  insert into craft_private.age_screens (user_id, passed) values (account_id, result);
  return result;
end;
$$;

-- The signed-in account's outcome: true, false, or null when it hasn't answered yet.
create function public.my_age_screen() returns boolean
language sql stable security definer set search_path = '' as $$
  select passed from craft_private.age_screens where user_id = auth.uid();
$$;

create function craft_private.passed_age_screen() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from craft_private.age_screens where user_id = auth.uid() and passed);
$$;

create function craft_private.require_age_screen(account_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select from craft_private.age_screens where user_id = account_id and passed) then
    raise sqlstate 'PT412' using message = 'Confirm your age on your Account page first.';
  end if;
end;
$$;

revoke all on function public.confirm_age(uuid, integer, integer), public.my_age_screen(),
  craft_private.passed_age_screen(), craft_private.require_age_screen(uuid) from public, anon, authenticated;
grant execute on function public.confirm_age(uuid, integer, integer), public.my_age_screen(),
  craft_private.passed_age_screen() to authenticated;

-- Saving builds and uploading skins need a passed check. Reading and deleting stay open, so anyone
-- can still see and remove what they saved before the check existed.
create policy "Age check before saving builds" on public.saved_builds as restrictive
  for insert to authenticated with check (craft_private.passed_age_screen());
create policy "Age check before updating builds" on public.saved_builds as restrictive
  for update to authenticated using (craft_private.passed_age_screen()) with check (craft_private.passed_age_screen());
create policy "Age check before uploading build images" on storage.objects as restrictive
  for insert to authenticated with check (bucket_id <> 'build-skins' or craft_private.passed_age_screen());

-- Community: a username, posts and reports also need a passed check. These are the earlier
-- functions unchanged apart from the require_age_screen line.
create or replace function public.set_community_username(expected_user_id uuid, new_username text)
returns setof public.community_profiles
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
begin
  -- Also protects an in-flight request if the browser switches accounts.
  if account_id is null or expected_user_id is distinct from account_id then
    raise insufficient_privilege using message = 'The signed-in account has changed.';
  end if;
  if not exists (
    select from auth.users where id = account_id and email_confirmed_at is not null
  ) then
    raise insufficient_privilege using message = 'Confirm your email before choosing a community username.';
  end if;
  perform craft_private.require_age_screen(account_id);

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
  account_id uuid := auth.uid();
  checked_at timestamptz;
begin
  if account_id is null or account_id is distinct from expected_user_id then
    raise insufficient_privilege using message = 'The signed-in account has changed.';
  end if;
  if not exists (select from auth.users where id = account_id and email_confirmed_at is not null) then
    raise insufficient_privilege using message = 'Confirm your email before posting.';
  end if;
  perform craft_private.require_age_screen(account_id);
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

create or replace function public.report_community_content(expected_user_id uuid, reported_topic_id uuid,
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
  perform craft_private.require_age_screen(account_id);
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

commit;
