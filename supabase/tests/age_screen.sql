begin;

-- New sign-ups: the site sends birth_month/birth_year in the user's metadata.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000060', 'adult@example.invalid', now(), '{"birth_month": 4, "birth_year": 1990, "theme": "kept"}'),
  ('10000000-0000-4000-8000-000000000061', 'no-answer@example.invalid', now(), '{}'),
  ('10000000-0000-4000-8000-000000000062', 'later-adult@example.invalid', now(), '{}');

do $$
declare
  this_month date := date_trunc('month', (now() at time zone 'utc')::date)::date;
begin
  assert (select passed from craft_private.age_screens where user_id = '10000000-0000-4000-8000-000000000060'),
    'An adult sign-up was not recorded as passed';
  assert (select raw_user_meta_data = '{"theme": "kept"}'::jsonb from auth.users where id = '10000000-0000-4000-8000-000000000060'),
    'The birth month and year were kept in the account metadata';
  assert not exists (select from craft_private.age_screens where user_id = '10000000-0000-4000-8000-000000000061'),
    'An account without an answer was given an outcome';

  begin
    insert into auth.users (id, raw_user_meta_data) values ('10000000-0000-4000-8000-000000000063',
      jsonb_build_object('birth_month', extract(month from this_month)::int, 'birth_year', extract(year from this_month)::int - 10));
    raise exception 'An under-13 sign-up was accepted';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select from auth.users where id = '10000000-0000-4000-8000-000000000063'), 'The under-13 account exists';

  begin
    insert into auth.users (id, raw_user_meta_data) values ('10000000-0000-4000-8000-000000000064', '{"birth_month": 13, "birth_year": 1990}');
    raise exception 'An impossible month was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into auth.users (id, raw_user_meta_data) values ('10000000-0000-4000-8000-000000000065', '{"birth_month": 4}');
    raise exception 'A partial answer was accepted';
  exception when check_violation then null;
  end;

  -- The 13th-birthday month itself counts as under 13, because the day is never asked.
  this_month := date_trunc('month', (now() at time zone 'utc')::date)::date;
  assert not craft_private.at_least_13(extract(month from this_month)::int, extract(year from this_month)::int - 13),
    'The 13th-birthday month counted as 13';
  assert craft_private.at_least_13(extract(month from this_month - interval '1 month')::int,
    extract(year from this_month - interval '1 month')::int - 13), 'Last month''s 13th birthday counted as under 13';
end;
$$;

-- An account without an answer can read but not save, and can't use Community until it answers.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000061","role":"authenticated"}', true);
do $$
begin
  assert public.my_age_screen() is null, 'An unanswered account reported an outcome';
  begin
    insert into public.saved_builds (user_id, fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count)
    values ('10000000-0000-4000-8000-000000000061', repeat('d', 64), 'Blocked', 'item', 'emerald', '/item/emerald?view=2d',
      'test:age', '1', 0, 10, 96, 8);
    raise exception 'An unanswered account saved a build';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_community_username('10000000-0000-4000-8000-000000000061', 'young_builder');
    raise exception 'An unanswered account chose a username';
  exception when sqlstate 'PT412' then null;
  end;
  begin
    perform public.confirm_age('10000000-0000-4000-8000-000000000060', 4, 1990);
    raise exception 'Another account''s age could be confirmed';
  exception when insufficient_privilege then null;
  end;
  assert not public.confirm_age('10000000-0000-4000-8000-000000000061', 1, extract(year from now())::int - 9),
    'An under-13 answer passed';
  -- The first answer is final.
  assert not public.confirm_age('10000000-0000-4000-8000-000000000061', 1, 1990), 'A second answer replaced the first';
  assert public.my_age_screen() = false, 'The failed outcome was not reported';
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000062","role":"authenticated"}', true);
do $$
begin
  assert public.confirm_age('10000000-0000-4000-8000-000000000062', 6, 2000), 'An adult answer failed';
  insert into public.saved_builds (user_id, fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
    current_step, total_steps, cube_count, paint_count)
  values ('10000000-0000-4000-8000-000000000062', repeat('e', 64), 'Allowed', 'item', 'emerald', '/item/emerald?view=2d',
    'test:age', '1', 0, 10, 96, 8);
  perform public.set_community_username('10000000-0000-4000-8000-000000000062', 'grown_builder');
  begin
    perform * from craft_private.age_screens;
    raise exception 'Signed-in users can read the age-check records';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  assert not has_function_privilege('anon', 'public.confirm_age(uuid, integer, integer)', 'EXECUTE'), 'Signed-out visitors can answer';
  assert not has_function_privilege('authenticated', 'craft_private.at_least_13(integer, integer)', 'EXECUTE'), 'The age rule is callable directly';
end;
$$;
select 'Age screen checks passed' as result;
rollback;
