begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000020', 'topics-a@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000021', 'topics-b@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000022', 'topics-c@example.invalid', null),
  ('10000000-0000-4000-8000-000000000023', 'topics-d@example.invalid', now());
insert into public.community_profiles (user_id, username) values
  ('10000000-0000-4000-8000-000000000020', 'topic_builder_a'),
  ('10000000-0000-4000-8000-000000000021', 'topic_builder_b'),
  ('10000000-0000-4000-8000-000000000022', 'topic_builder_c');
insert into public.community_topics (id, category, title, body, locked, hidden) values
  ('20000000-0000-4000-8000-000000000020', 'help', 'Locked topic', 'Locked topic body', true, false),
  ('20000000-0000-4000-8000-000000000021', 'help', 'Hidden topic', 'Hidden topic body', false, true);
insert into public.community_replies (topic_id, body, hidden) values
  ('20000000-0000-4000-8000-000000000020', 'A hidden reply', true),
  ('20000000-0000-4000-8000-000000000021', 'Reply under a hidden topic', false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000020"}', true);
do $$
declare
  a constant uuid := '10000000-0000-4000-8000-000000000020';
  b constant uuid := '10000000-0000-4000-8000-000000000021';
  topic_id uuid;
begin
  begin
    perform public.create_community_topic(b, 'help', 'Wrong account', 'Account changed');
    raise exception 'A caller could post for another user';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_community_topic(a, 'other', 'Invalid category', 'Example');
    raise exception 'An invalid category was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_community_topic(a, 'help', 'Invalid body', E'\t\n');
    raise exception 'A blank post was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_community_topic(a, 'help', 'Long post', repeat('x', 4001));
    raise exception 'An oversized post was accepted';
  exception when check_violation then null;
  end;
  topic_id := public.create_community_topic(a, 'help', '  Acacia Boat question  ', ' Where should I dry-fit the sections? ');
  perform set_config('community.test_topic', topic_id::text, true);
  assert exists (select from public.community_topics where id = topic_id and author_id = a
    and title = 'Acacia Boat question' and body = 'Where should I dry-fit the sections?'), 'Topic author or trimmed content incorrect';
  begin
    perform public.create_community_reply(a, topic_id, 'Too soon');
    raise exception 'A reply bypassed the shared cooldown after a topic';
  exception when sqlstate 'PT429' then null;
  end;
  assert not has_table_privilege('authenticated', 'public.community_topics', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Direct topic writes are granted';
  assert not has_table_privilege('authenticated', 'public.community_replies', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Direct reply writes are granted';
  assert not has_function_privilege('authenticated', 'craft_private.require_community_poster(uuid,boolean)', 'EXECUTE'), 'Private guard exposed';
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000021"}', true);
do $$
declare
  b constant uuid := '10000000-0000-4000-8000-000000000021';
  topic_id constant uuid := current_setting('community.test_topic')::uuid;
  closed_id uuid;
  reply_id uuid;
begin
  foreach closed_id in array array[
    '20000000-0000-4000-8000-000000000020'::uuid,
    '20000000-0000-4000-8000-000000000021'::uuid,
    '20000000-0000-4000-8000-000000000099'::uuid
  ] loop
    begin
      perform public.create_community_reply(b, closed_id, 'Unavailable');
      raise exception 'A closed, hidden, or missing topic accepted a reply';
    exception when sqlstate 'PT409' then null;
    end;
  end loop;
  begin
    perform public.create_community_reply(b, topic_id, repeat('x', 2001));
    raise exception 'An oversized reply was accepted';
  exception when check_violation then null;
  end;
  reply_id := public.create_community_reply(b, topic_id, '  Dry-fit rows one and two first.  ');
  assert exists (select from public.community_replies where id = reply_id and author_id = b
    and body = 'Dry-fit rows one and two first.'), 'Reply author or trimmed content incorrect';
  begin
    perform public.create_community_topic(b, 'help', 'Cooldown topic', 'Too soon');
    raise exception 'A topic bypassed the shared cooldown after a reply';
  exception when sqlstate 'PT429' then null;
  end;
  begin
    update public.community_topics set body = 'Unauthorised edit' where id = topic_id;
    raise exception 'A regular account edited a topic directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000022","user_metadata":{"email_verified":true}}', true);
do $$
begin
  begin
    perform public.create_community_topic('10000000-0000-4000-8000-000000000022', 'help', 'Unconfirmed topic', 'Example');
    raise exception 'An unconfirmed account could post';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000023"}', true);
do $$
begin
  begin
    perform public.create_community_reply('10000000-0000-4000-8000-000000000023', current_setting('community.test_topic')::uuid, 'No username');
    raise exception 'An account without a public username could reply';
  exception when sqlstate 'PT403' then null;
  end;
end;
$$;

reset role;
-- Move the test posts outside the rolling window, then seed today's quotas.
update public.community_topics set created_at = now() - interval '25 hours' where id = current_setting('community.test_topic')::uuid;
update public.community_replies set created_at = now() - interval '25 hours' where topic_id = current_setting('community.test_topic')::uuid;
insert into public.community_topics (author_id, category, title, body, created_at)
  select '10000000-0000-4000-8000-000000000020', 'ideas', 'Quota topic ' || n, 'Example', now() - interval '1 hour'
  from generate_series(1, 5) n;
insert into public.community_replies (topic_id, author_id, body, created_at)
  select current_setting('community.test_topic')::uuid, '10000000-0000-4000-8000-000000000021', 'Quota reply ' || n, now() - interval '1 hour'
  from generate_series(1, 30) n;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000020"}', true);
do $$
declare a constant uuid := '10000000-0000-4000-8000-000000000020';
begin
  begin
    perform public.create_community_topic(a, 'help', 'Sixth topic', 'Over quota');
    raise exception 'The topic quota was not enforced';
  exception when sqlstate 'PT429' then null;
  end;
  perform public.create_community_reply(a, current_setting('community.test_topic')::uuid, 'Topic quota does not block replies');
end;
$$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000021"}', true);
do $$
declare b constant uuid := '10000000-0000-4000-8000-000000000021';
begin
  begin
    perform public.create_community_reply(b, current_setting('community.test_topic')::uuid, 'Over quota');
    raise exception 'The reply quota was not enforced';
  exception when sqlstate 'PT429' then null;
  end;
  perform public.create_community_topic(b, 'ideas', 'Independent quotas', 'Reply quota does not block topics');
end;
$$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  assert exists (select from public.community_topics where id = current_setting('community.test_topic')::uuid), 'Public topic was unreadable';
  assert exists (select from public.community_replies where body = 'Dry-fit rows one and two first.'), 'Public reply was unreadable';
  assert not exists (select from public.community_topics where id = '20000000-0000-4000-8000-000000000021'), 'Hidden topic was readable';
  assert not exists (select from public.community_replies where body in ('A hidden reply', 'Reply under a hidden topic')), 'Hidden replies were readable';
  assert not has_function_privilege('anon', 'public.create_community_topic(uuid,text,text,text)', 'EXECUTE'), 'Anonymous topic posting is granted';
  assert not has_function_privilege('anon', 'public.create_community_reply(uuid,uuid,text)', 'EXECUTE'), 'Anonymous replies are granted';
end;
$$;
reset role;

delete from auth.users where id = '10000000-0000-4000-8000-000000000020';
do $$
begin
  assert exists (select from public.community_topics where id = current_setting('community.test_topic')::uuid and author_id is null), 'Account deletion did not unlink the topic';
  assert exists (select from public.community_replies where body = 'Topic quota does not block replies' and author_id is null), 'Account deletion did not unlink the reply';
end;
$$;

select 'Community topic, reply, visibility, and posting limit checks passed' as result;
rollback;
