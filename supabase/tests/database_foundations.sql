begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000050', 'foundations-a@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000051', 'foundations-b@example.invalid', now());
insert into public.community_profiles (user_id, username) values
  ('10000000-0000-4000-8000-000000000050', 'foundation_a'),
  ('10000000-0000-4000-8000-000000000051', 'foundation_b');

-- Skin images: deletable by their owner once no saved build uses them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000050"}', true);
do $$
declare
  image constant text := '10000000-0000-4000-8000-000000000050/' || repeat('d', 64) || '.png';
  deleted integer;
begin
  insert into storage.objects (bucket_id, name) values ('build-skins', image);
  insert into public.saved_builds (
    id, fingerprint, title, kind, image_path, skin_model, resume_path, guide_key, engine_version,
    current_step, total_steps, cube_count, paint_count
  ) values (
    '20000000-0000-4000-8000-000000000050', repeat('d', 64), 'Image owner', 'skin', image, 'classic',
    '/skin/guide?view=2d', 'test:skin', '1', 0, 10, 96, 8
  );
  delete from storage.objects where name = image;
  get diagnostics deleted = row_count;
  assert deleted = 0, 'An image still used by a saved build was deleted';
  delete from public.saved_builds where id = '20000000-0000-4000-8000-000000000050';
  delete from storage.objects where name = image;
  get diagnostics deleted = row_count;
  assert deleted = 1, 'The owner could not delete an unused image';
  insert into storage.objects (bucket_id, name) values ('build-skins', image);
end;
$$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000051"}', true);
do $$
declare deleted integer;
begin
  delete from storage.objects where name like '10000000-0000-4000-8000-000000000050/%';
  get diagnostics deleted = row_count;
  assert deleted = 0, 'Another account deleted someone else''s image';
end;
$$;

-- Categories are data: readable by everyone, changed only by the database operator.
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  assert (select array_agg(id order by sort_order) from public.community_categories) = array['help', 'finished', 'ideas'],
    'The built-in categories are missing or out of order';
  assert not has_table_privilege('anon', 'public.community_categories', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Anonymous category writes are granted';
  assert not has_table_privilege('authenticated', 'public.community_categories', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Account category writes are granted';
end;
$$;
reset role;
insert into public.community_categories (id, label, sort_order) values ('showcase', 'Showcase', 4);
update public.community_categories set accepts_topics = false where id = 'ideas';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000050"}', true);
do $$
declare
  topic_id uuid := public.create_community_topic(
    '10000000-0000-4000-8000-000000000050', 'showcase', 'A new category', 'Added with an insert');
begin
  assert exists (select from public.community_topics where id = topic_id and category = 'showcase'),
    'A newly added category did not accept topics';
end;
$$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000051"}', true);
do $$
begin
  begin
    perform public.create_community_topic('10000000-0000-4000-8000-000000000051', 'ideas', 'Retired category', 'Not accepted');
    raise exception 'A retired category accepted a topic';
  exception when check_violation then null;
  end;
  begin
    perform public.create_community_topic('10000000-0000-4000-8000-000000000050', 'help', 'Wrong account', 'Account changed');
    raise exception 'The shared account check let a caller post for another user';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  begin
    insert into public.community_topics (category, title, body) values ('missing', 'Unknown category', 'Example');
    raise exception 'A topic was stored in a category that does not exist';
  exception when foreign_key_violation then null;
  end;
end;
$$;

-- Structure: rules every future migration should keep.
do $$
declare
  problems text;
begin
  select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into problems
  from pg_constraint c
  where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'craft_private'::regnamespace)
    and not exists (select from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);
  assert problems is null, 'Foreign keys without an index: ' || problems;

  select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') into problems
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  where c.contype = 'c' and c.connamespace in ('public'::regnamespace, 'craft_private'::regnamespace)
    and (c.conname ~ '_check[0-9]+$' or c.conname = t.relname || '_check');
  assert problems is null, 'Checks with numbered names; name them: ' || problems;

  select string_agg(t.oid::regclass::text, ', ') into problems
  from pg_class t
  where t.relkind = 'r' and t.relnamespace in ('public'::regnamespace, 'craft_private'::regnamespace)
    and not t.relrowsecurity;
  assert problems is null, 'Tables without row level security: ' || problems;

  assert not has_table_privilege('authenticated', 'craft_private.account_actions', 'SELECT'), 'Account activity is readable';
  assert not has_table_privilege('anon', 'craft_private.account_actions', 'SELECT'), 'Account activity is readable';
  assert not has_function_privilege('authenticated', 'craft_private.require_member(uuid,text)', 'EXECUTE'), 'Account check exposed';
  assert not has_function_privilege('authenticated', 'craft_private.require_cooldown(uuid,text[],interval,text)', 'EXECUTE'), 'Cooldown helper exposed';
  assert not has_function_privilege('authenticated', 'craft_private.require_quota(uuid,text,integer,interval,text)', 'EXECUTE'), 'Quota helper exposed';
end;
$$;

select 'Image clean-up, category, shared check, and schema rule checks passed' as result;
rollback;
