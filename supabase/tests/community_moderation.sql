begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000030', 'reporter-a@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000031', 'reporter-b@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000032', 'moderator@example.invalid', now()),
  ('10000000-0000-4000-8000-000000000033', 'unconfirmed@example.invalid', null);
insert into public.community_profiles (user_id, username) values
  ('10000000-0000-4000-8000-000000000030', 'reporter_a'),
  ('10000000-0000-4000-8000-000000000031', 'reporter_b'),
  ('10000000-0000-4000-8000-000000000032', 'reviewer');
insert into craft_private.community_moderators values
  ('10000000-0000-4000-8000-000000000032'), ('10000000-0000-4000-8000-000000000033');
insert into public.community_topics (id, category, title, body, hidden) values
  ('20000000-0000-4000-8000-000000000030', 'help', 'Reported topic', 'Topic content', false),
  ('20000000-0000-4000-8000-000000000031', 'ideas', 'Second topic', 'Other content', false),
  ('20000000-0000-4000-8000-000000000032', 'help', 'Hidden topic', 'Hidden content', true);
insert into public.community_replies (id, topic_id, body) values
  ('30000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000030', 'Reply content');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000030","user_metadata":{"role":"moderator"}}', true);
do $$
declare
  a constant uuid := '10000000-0000-4000-8000-000000000030';
  target constant uuid := '20000000-0000-4000-8000-000000000030';
  receipt uuid;
begin
  assert not public.is_community_moderator(a), 'Editable metadata granted moderator access';
  begin
    perform public.report_community_content('10000000-0000-4000-8000-000000000031', target, null, 'spam', '');
    raise exception 'Account mismatch was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_community_content(a, target, '30000000-0000-4000-8000-000000000030', 'spam', '');
    raise exception 'Two report targets were accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_community_content(a, target, null, 'unknown', '');
    raise exception 'Invalid report reason was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_community_content(a, target, null, 'spam', repeat('x',1001));
    raise exception 'Oversized report details were accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.report_community_content(a, '20000000-0000-4000-8000-000000000032', null, 'spam', '');
    raise exception 'A hidden target was reportable';
  exception when sqlstate 'PT404' then null;
  end;
  receipt := public.report_community_content(a, target, null, 'spam', '  Private report details  ');
  perform set_config('community.topic_report',receipt::text,true);
  assert receipt = public.report_community_content(a, target, null, 'other', 'Retry'), 'Duplicate report changed its receipt';
  begin
    perform public.report_community_content(a, '20000000-0000-4000-8000-000000000031', null, 'spam', '');
    raise exception 'Reporting cooldown was bypassed';
  exception when sqlstate 'PT429' then null;
  end;
  begin
    perform * from public.community_report_queue(a, false, 0);
    raise exception 'A regular user could read the queue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from craft_private.community_reports;
    raise exception 'A reporter could inspect private reports';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into craft_private.community_moderators values (a);
    raise exception 'A user could promote themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_community_report(a, receipt, 0, 0, 'hide', '');
    raise exception 'A regular account could hide content';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031"}', true);
select set_config('community.reply_report', public.report_community_content('10000000-0000-4000-8000-000000000031', null,
  '30000000-0000-4000-8000-000000000030', 'unsafe', 'Review this reply')::text, true);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000033"}', true);
do $$
declare a constant uuid := '10000000-0000-4000-8000-000000000033';
begin
  assert not public.is_community_moderator(a), 'Unconfirmed moderator was allowed';
  begin
    perform * from public.community_report_queue(a,false,0);
    raise exception 'Unconfirmed moderator read reports';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_community_content(a,'20000000-0000-4000-8000-000000000030',null,'spam','');
    raise exception 'Unconfirmed account submitted a report';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
do $$
declare
  m constant uuid := '10000000-0000-4000-8000-000000000032';
  receipt constant uuid := current_setting('community.topic_report')::uuid;
begin
  assert public.is_community_moderator(m), 'Moderator membership was ignored';
  assert (select count(*)=2 from public.community_report_queue(m,false,0)), 'Moderator queue missing reports';
  assert exists (select from public.community_report_queue(m,false,0) where report_id=receipt
    and details='Private report details' and content_body='Topic content' and reporter_name='reporter_a'), 'Queue detail was incorrect';
  perform public.review_community_report(m,receipt,0,0,'hide','Spam removed');
  begin
    perform public.review_community_report(m,receipt,0,0,'dismiss','Stale decision');
    raise exception 'A stale review overwrote a decision';
  exception when sqlstate 'PT409' then null;
  end;
  assert exists (select from public.community_report_queue(m,true,0) where report_id=receipt
    and resolution='hidden' and report_revision=1 and content_revision=1 and moderator_note='Spam removed'), 'Review history was not saved';
  assert exists (select from public.community_report_queue(m,false,0) where reply_id is not null
    and topic_hidden and not content_hidden and content_body='Reply content'), 'Reply or hidden parent state was incorrect';
end;
$$;
set local role anon;
do $$
begin
  assert not exists (select from public.community_topics where id='20000000-0000-4000-8000-000000000030'), 'Hidden topic remains public';
  assert not exists (select from public.community_replies where id='30000000-0000-4000-8000-000000000030'), 'Hidden parent leaked its replies';
  assert not has_function_privilege('anon','public.report_community_content(uuid,uuid,uuid,text,text)','EXECUTE'), 'Anonymous reporting granted';
  assert not has_function_privilege('anon','public.community_report_queue(uuid,boolean,integer)','EXECUTE'), 'Anonymous queue access granted';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
select public.review_community_report('10000000-0000-4000-8000-000000000032',current_setting('community.topic_report')::uuid,1,1,'restore','Restored after review');
select public.review_community_report('10000000-0000-4000-8000-000000000032',current_setting('community.reply_report')::uuid,0,0,'dismiss','No action needed');

reset role;
do $$
begin
  assert not has_table_privilege('authenticated','craft_private.community_reports','SELECT,INSERT,UPDATE,DELETE'), 'Direct report access granted';
  assert (select count(*)=3 from craft_private.community_moderation_actions), 'Decisions were not audited';
  assert exists (select from public.community_topics where id='20000000-0000-4000-8000-000000000030' and not hidden and moderation_revision=2), 'Topic was not restored';
  assert exists (select from public.community_replies where id='30000000-0000-4000-8000-000000000030' and not hidden and moderation_revision=0), 'Dismissing a report changed its content';
end;
$$;
update craft_private.community_reports set created_at=clock_timestamp()-interval '20 seconds';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000030"}', true);
select set_config('community.second_reply_report',public.report_community_content('10000000-0000-4000-8000-000000000030',null,
  '30000000-0000-4000-8000-000000000030','abuse','Review reply separately')::text,true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
select public.review_community_report('10000000-0000-4000-8000-000000000032',current_setting('community.second_reply_report')::uuid,0,0,'hide','Hide reply only');
set local role anon;
do $$
begin
  assert exists (select from public.community_topics where id='20000000-0000-4000-8000-000000000030'), 'Hiding a reply hid its topic';
  assert not exists (select from public.community_replies where id='30000000-0000-4000-8000-000000000030'), 'Reported reply remains public';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
select public.review_community_report('10000000-0000-4000-8000-000000000032',current_setting('community.second_reply_report')::uuid,1,1,'restore','Restore reply');
set local role anon;
do $$
begin
  assert exists (select from public.community_replies where id='30000000-0000-4000-8000-000000000030'), 'Restored reply remains hidden';
end;
$$;
reset role;
update craft_private.community_reports set created_at=clock_timestamp()-interval '20 seconds';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000030"}', true);
select set_config('community.other_report_a',public.report_community_content('10000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000031',null,'spam','')::text,true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000031"}', true);
select set_config('community.other_report_b',public.report_community_content('10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031',null,'spam','')::text,true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
do $$
declare m constant uuid := '10000000-0000-4000-8000-000000000032';
begin
  perform public.review_community_report(m,current_setting('community.other_report_a')::uuid,0,0,'hide','');
  begin
    perform public.review_community_report(m,current_setting('community.other_report_b')::uuid,0,0,'hide','');
    raise exception 'A different report overwrote a newer content version';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.review_community_report(m,current_setting('community.other_report_b')::uuid,0,1,'hide','');
  begin
    perform public.review_community_report(m,current_setting('community.other_report_a')::uuid,1,1,'restore','');
    raise exception 'A stale restore overwrote a newer content decision';
  exception when sqlstate 'PT409' then null;
  end;
end;
$$;

reset role;
update craft_private.community_reports set created_at=clock_timestamp()-interval '25 hours';
insert into public.community_topics (category,title,body)
  select 'ideas','Moderation quota '||n,'Quota content' from generate_series(1,11) n;
insert into craft_private.community_reports(reporter_id,topic_id,reason,created_at)
  select '10000000-0000-4000-8000-000000000030',id,'spam',clock_timestamp()-interval '1 hour'
  from public.community_topics where title like 'Moderation quota %' and title<>'Moderation quota 11';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000030"}', true);
do $$
declare a constant uuid := '10000000-0000-4000-8000-000000000030'; target uuid;
begin
  select id into target from public.community_topics where title='Moderation quota 11';
  begin
    perform public.report_community_content(a,target,null,'spam','');
    raise exception 'Daily reporting quota was bypassed';
  exception when sqlstate 'PT429' then null;
  end;
  select id into target from public.community_topics where title='Moderation quota 1';
  assert public.report_community_content(a,target,null,'spam','') is not null, 'Duplicate retry failed at the quota';
end;
$$;
reset role;
delete from craft_private.community_moderators where user_id='10000000-0000-4000-8000-000000000032';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
do $$
declare m constant uuid := '10000000-0000-4000-8000-000000000032';
begin
  assert not public.is_community_moderator(m), 'Revoked moderator kept access';
  begin
    perform * from public.community_report_queue(m,true,0);
    raise exception 'Revoked moderator could read the queue';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
-- Pagination stays bounded even when the queue is larger than one page.
insert into public.community_topics (category,title,body)
  select 'ideas','Queue pagination '||n,'Queue content' from generate_series(1,30) n;
insert into craft_private.community_reports(reporter_id,topic_id,reason)
  select '10000000-0000-4000-8000-000000000031',id,'other' from public.community_topics where title like 'Queue pagination %';
insert into craft_private.community_moderators values ('10000000-0000-4000-8000-000000000032');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000032"}', true);
do $$
declare m constant uuid := '10000000-0000-4000-8000-000000000032';
begin
  assert (select count(*)=21 from public.community_report_queue(m,false,0)), 'Queue page was not bounded';
  assert (select count(*)>0 from public.community_report_queue(m,false,20)), 'Queue second page was not available';
  begin
    perform * from public.community_report_queue(m,false,-1);
    raise exception 'A negative page was accepted';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
select 'Community reporting privacy, moderation actions, revisions, and rate limit checks passed' as result;
rollback;
