begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000010', 'community-a@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000011', 'community-b@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000012', 'unconfirmed@example.invalid', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000010","role":"authenticated"}', true);
select * from public.set_community_username('10000000-0000-4000-8000-000000000010', ' Cube_Crafter ');

do $$
declare
  original_created timestamptz;
  original_updated timestamptz;
  invalid_name text;
begin
  assert (select username = 'cube_crafter' from public.community_profiles
    where user_id = '10000000-0000-4000-8000-000000000010'), 'Username was not normalized';
  select created_at, updated_at into original_created, original_updated from public.community_profiles
    where user_id = '10000000-0000-4000-8000-000000000010';
  perform public.set_community_username('10000000-0000-4000-8000-000000000010', 'cube_crafter');
  assert (select created_at = original_created and updated_at = original_updated from public.community_profiles
    where user_id = '10000000-0000-4000-8000-000000000010'), 'An identical save changed the timestamps';
  perform public.set_community_username('10000000-0000-4000-8000-000000000010', 'emerald_builder');
  assert (select username = 'emerald_builder' and created_at = original_created and updated_at >= original_updated
    from public.community_profiles where user_id = '10000000-0000-4000-8000-000000000010'), 'Own username update failed';

  foreach invalid_name in array array[
    'ab', '1builder', repeat('a', 25), 'has spaces', '<script>', 'émeraude',
    'Admin', 'administrator', 'moderator', 'support', 'system', 'blockbycube', 'block_by_cube', 'deleted_user'
  ] loop
    begin
      perform public.set_community_username('10000000-0000-4000-8000-000000000010', invalid_name);
      raise exception 'Invalid or reserved username accepted: %', invalid_name;
    exception when check_violation then null;
    end;
  end loop;
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000010', null);
    raise exception 'A null username was accepted';
  exception when not_null_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select * from public.set_community_username('10000000-0000-4000-8000-000000000011', 'wood_builder');
do $$
begin
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000011', ' EMERALD_BUILDER ');
    raise exception 'A duplicate username was accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000010', 'stolen_profile');
    raise exception 'A different account profile could be changed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_community_username(null, 'missing_owner');
    raise exception 'An expected account was not required';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_profiles (user_id, username)
      values ('10000000-0000-4000-8000-000000000011', 'direct_insert');
    raise exception 'Direct profile insertion was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_profiles set username = 'direct_update';
    raise exception 'Direct profile updates were permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.community_profiles;
    raise exception 'Direct profile deletion was permitted';
  exception when insufficient_privilege then null;
  end;
  assert (select username = 'emerald_builder' from public.community_profiles
    where user_id = '10000000-0000-4000-8000-000000000010'), 'Another account profile was changed';
end;
$$;

-- A caller cannot claim email confirmation in editable JWT metadata.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000012","role":"authenticated","user_metadata":{"email_verified":true}}', true);
do $$
begin
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000012', 'unconfirmed_user');
    raise exception 'An unconfirmed account created a profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000010', 'missing_session');
    raise exception 'A missing account session created a profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  assert (select count(*) = 2 from public.community_profiles
    where user_id in ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011')), 'Public usernames are not readable';
  assert not has_table_privilege('anon', 'public.community_profiles', 'INSERT'), 'Anonymous profile creation is granted';
  assert not has_table_privilege('authenticated', 'public.community_profiles', 'UPDATE'), 'Direct profile editing is granted';
  assert not has_function_privilege('anon', 'public.set_community_username(uuid,text)', 'EXECUTE'), 'Anonymous username RPC execution is granted';
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000010', 'anonymous_user');
    raise exception 'An anonymous user called the username RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform email from auth.users;
    raise exception 'Private auth emails became readable';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  assert (select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = 'community_profiles')
    = array['user_id', 'username', 'created_at', 'updated_at'], 'Private or role fields were added to public profiles';
  delete from auth.users where id = '10000000-0000-4000-8000-000000000010';
  assert not exists (select from public.community_profiles
    where user_id = '10000000-0000-4000-8000-000000000010'), 'Account deletion did not remove its profile';
end;
$$;
select 'Community username, confirmation, ownership, and public/private access checks passed' as result;
rollback;
