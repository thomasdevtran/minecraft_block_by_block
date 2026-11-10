begin;

-- Only public community identity belongs here. Auth data and moderator permissions
-- must never be copied into this readable table or accepted from user metadata.
create table public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_username_format check (
    username collate "C" ~ '^[a-z][a-z0-9_]{2,23}$'
    and username not in (
      'admin', 'administrator', 'moderator', 'support', 'system',
      'blockbycube', 'block_by_cube', 'deleted_user'
    )
  )
);

alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public, anon, authenticated;
grant select on public.community_profiles to anon, authenticated;
create policy "Read public community usernames" on public.community_profiles
  for select to anon, authenticated using (true);

-- No direct writes, including by the profile's owner. The RPC sets ownership,
-- verifies email confirmation, and controls which fields can be changed.
create function public.set_community_username(expected_user_id uuid, new_username text)
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
revoke all on function public.set_community_username(uuid, text) from public, anon, authenticated;
grant execute on function public.set_community_username(uuid, text) to authenticated;

commit;
