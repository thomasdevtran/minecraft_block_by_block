begin;
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.saved_builds (
  id, fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
  current_step, total_steps, cube_count, paint_count
) values (
  '20000000-0000-4000-8000-000000000001', repeat('a', 64), 'Owner check', 'item', 'emerald',
  '/item/emerald?view=2d', 'test:emerald', '1', 0, 10, 96, 8
);
update public.saved_builds set current_step = 3
  where id = '20000000-0000-4000-8000-000000000001' and revision = 0;
do $$
begin
  assert (select current_step = 3 and revision = 1 from public.saved_builds where id = '20000000-0000-4000-8000-000000000001'), 'Owner save or revision failed';
  update public.saved_builds set current_step = 4
    where id = '20000000-0000-4000-8000-000000000001' and revision = 0;
  assert not found, 'A stale revision overwrote progress';
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert not exists (select from public.saved_builds), 'Another user can read private builds';
  update public.saved_builds set current_step = 5 where id = '20000000-0000-4000-8000-000000000001';
  assert not found, 'Another user can change private builds';
  begin
    insert into public.saved_builds (
      user_id, fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count
    ) values (
      '10000000-0000-4000-8000-000000000001', repeat('b', 64), 'Wrong owner', 'item', 'emerald',
      '/item/emerald?view=2d', 'test:emerald', '1', 0, 10, 96, 8
    );
    raise exception 'Another user can insert into a private library';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  assert (select not public from storage.buckets where id = 'build-skins'), 'Skin storage is public';
  assert not has_table_privilege('anon', 'public.saved_builds', 'SELECT'), 'Signed-out access is granted';
end;
$$;
select 'Ownership, private storage, and stale-save checks passed' as result;
rollback;
