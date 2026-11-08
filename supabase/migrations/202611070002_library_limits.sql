begin;

create schema if not exists craft_private;
revoke all on schema craft_private from public;
grant usage on schema craft_private to authenticated;

create function craft_private.limit_saved_builds() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise insufficient_privilege using message = 'Build ownership does not match the signed-in account.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  -- Let duplicate saves reach the existing unique constraint and reopen their saved record.
  if exists (select from public.saved_builds where user_id = new.user_id and fingerprint = new.fingerprint) then
    return new;
  end if;
  if (select count(*) from public.saved_builds where user_id = new.user_id) >= 100 then
    raise check_violation using message = 'Your library can store up to 100 builds.';
  end if;
  return new;
end;
$$;
revoke all on function craft_private.limit_saved_builds() from public;
create trigger saved_build_limit before insert on public.saved_builds
  for each row execute function craft_private.limit_saved_builds();

create function craft_private.can_upload_build_skin(object_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
begin
  if account_id is null or object_name is null or object_name !~ ('^' || account_id::text || '/[a-f0-9]{64}\.png$') then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account_id::text, 0));
  if exists (select from storage.objects where bucket_id = 'build-skins' and name = object_name) then
    return true;
  end if;
  return (select count(*) from storage.objects
    where bucket_id = 'build-skins' and name like account_id::text || '/%') < 100;
end;
$$;
revoke all on function craft_private.can_upload_build_skin(text) from public;
grant execute on function craft_private.can_upload_build_skin(text) to authenticated;
create policy "Limit private build image uploads" on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'build-skins' or craft_private.can_upload_build_skin(name)
  );

commit;
