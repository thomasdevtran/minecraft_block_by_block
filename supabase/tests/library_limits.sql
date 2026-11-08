begin;
insert into auth.users (id) values ('10000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare
  n integer;
begin
  for n in 1..100 loop
    insert into public.saved_builds (
      fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count
    ) values (
      md5(n::text) || md5(n::text), 'Limit check', 'item', 'emerald',
      '/item/emerald?view=2d', 'test:emerald', '1', 0, 10, 96, 8
    );
  end loop;
  begin
    insert into public.saved_builds (
      fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count
    ) values (
      repeat('f', 64), 'Over limit', 'item', 'emerald',
      '/item/emerald?view=2d', 'test:emerald', '1', 0, 10, 96, 8
    );
    raise exception 'Build limit was bypassed';
  exception when check_violation then null;
  end;
  begin
    insert into public.saved_builds (
      fingerprint, title, kind, item_id, resume_path, guide_key, engine_version,
      current_step, total_steps, cube_count, paint_count
    ) values (
      md5('1') || md5('1'), 'Duplicate at limit', 'item', 'emerald',
      '/item/emerald?view=2d', 'test:emerald', '1', 0, 10, 96, 8
    );
    raise exception 'Duplicate save was not detected';
  exception when unique_violation then null;
  end;
  for n in 1..100 loop
    insert into storage.objects (bucket_id, name) values (
      'build-skins', '10000000-0000-4000-8000-000000000003/' || md5(n::text) || md5(n::text) || '.png'
    );
  end loop;
  begin
    insert into storage.objects (bucket_id, name) values (
      'build-skins', '10000000-0000-4000-8000-000000000003/' || repeat('f', 64) || '.png'
    );
    raise exception 'Image limit was bypassed';
  exception when insufficient_privilege then null;
  end;
  assert craft_private.can_upload_build_skin(
    '10000000-0000-4000-8000-000000000003/' || md5('1') || md5('1') || '.png'
  ), 'An existing image cannot be reused at the limit';
  assert not craft_private.can_upload_build_skin(
    '10000000-0000-4000-8000-000000000004/' || repeat('a', 64) || '.png'
  ), 'Another owner image path is allowed';
end;
$$;
reset role;
select 'Build and image limits, duplicate reuse, and ownership checks passed' as result;
rollback;
