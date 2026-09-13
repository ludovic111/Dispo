-- Backend hardening checks (local only, everything rolled back):
--   docker exec -i supabase_db_dispo psql -U postgres -v ON_ERROR_STOP=1 \
--     -f - < supabase/tests/database/backend_hardening.test.sql
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000a1','authenticated','authenticated','hard-a@local.test','',now(),'{}','{"name":"Hard A"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000b2','authenticated','authenticated','hard-b@local.test','',now(),'{}','{"name":"Hard B"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000c3','authenticated','authenticated','hard-c@local.test','',now(),'{}','{"name":"Hard C"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000d4','authenticated','authenticated','hard-d@local.test','',now(),'{}','{"name":"Hard D"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000e5','authenticated','authenticated','hard-e@local.test','',now(),'{}','{"name":"Hard E"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','56000000-0000-4000-8000-0000000000f6','authenticated','authenticated','hard-f@local.test','',now(),'{}','{"name":"Hard F"}',now(),now(),'','','','');
-- A, B, D, E, F are "ready"; C has no instrument; D is banned; E blocks A.
update public.profiles set instruments = array['Piano']::text[]
 where id in ('56000000-0000-4000-8000-0000000000a1','56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000d4','56000000-0000-4000-8000-0000000000e5','56000000-0000-4000-8000-0000000000f6');
update public.profiles set moderation_status = 'banned' where id = '56000000-0000-4000-8000-0000000000d4';
insert into public.blocks(blocker_id, blocked_id) values ('56000000-0000-4000-8000-0000000000e5','56000000-0000-4000-8000-0000000000a1');
insert into public.follows(follower_id, following_id) values
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000c3'),
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000d4'),
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000e5'),
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000f6'),
 ('56000000-0000-4000-8000-0000000000a1','56000000-0000-4000-8000-0000000000c3');
insert into public.collaborations(a_id, b_id) values
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000d4'),
 ('56000000-0000-4000-8000-0000000000b2','56000000-0000-4000-8000-0000000000f6');
insert into public.conversations(id, participant_a, participant_b)
values ('56000000-0000-4000-8000-00000000c0a1','56000000-0000-4000-8000-0000000000a1','56000000-0000-4000-8000-0000000000b2');

-- Privileges and search_path (checked as postgres).
do $$
declare v_count int; v_ok boolean;
begin
  if has_table_privilege('anon','public.profiles','select') then raise exception 'anon can still select profiles'; end if;
  if has_table_privilege('anon','public.messages','select') then raise exception 'anon can still select messages'; end if;
  if has_table_privilege('authenticated','public.messages','truncate') then raise exception 'authenticated can truncate messages'; end if;
  if has_table_privilege('authenticated','public.profiles','delete') then raise exception 'authenticated can delete profiles'; end if;
  if not has_table_privilege('authenticated','public.profiles','update') then raise exception 'authenticated lost profile update'; end if;
  if has_function_privilege('anon','public.consume_edge_call(uuid,text,int,interval)','execute') then raise exception 'anon can call consume_edge_call'; end if;
  if has_function_privilege('authenticated','public.claim_revenuecat_event(text)','execute') then raise exception 'authenticated can claim RevenueCat events'; end if;
  if not has_function_privilege('service_role','public.consume_edge_call(uuid,text,int,interval)','execute') then raise exception 'service_role cannot call consume_edge_call'; end if;
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public','private') and p.prosecdef
     and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""'));
  if v_count > 0 then raise exception '% definer functions without an empty search_path', v_count; end if;
  foreach v_ok in array array[
    (select 'search_path=""' = any(proconfig) from pg_proc where proname = 'is_group_member'),
    (select 'search_path=""' = any(proconfig) from pg_proc where proname = 'accept_gig_application'),
    (select 'search_path=""' = any(proconfig) from pg_proc where proname = 'cockpit_stats'),
    (select 'search_path=""' = any(proconfig) from pg_proc where proname = 'handle_new_user')]
  loop if not v_ok then raise exception 'A sampled function kept a mutable search_path'; end if; end loop;
  if (select reloptions from pg_class where relname = 'gig_requests_feed')::text[] @> array['security_invoker=true'] is not true
     or (select reloptions from pg_class where relname = 'gig_requests_feed')::text[] @> array['security_barrier=true'] is not true then
    raise exception 'gig_requests_feed lost security_invoker or security_barrier';
  end if;
  perform count(*) from public.gig_requests_feed;
  -- Edge call budget and RevenueCat replay claims.
  if not public.consume_edge_call('56000000-0000-4000-8000-0000000000a1','test-fn',2,interval '10 minutes') then raise exception 'first edge call refused'; end if;
  if not public.consume_edge_call('56000000-0000-4000-8000-0000000000a1','test-fn',2,interval '10 minutes') then raise exception 'second edge call refused'; end if;
  if public.consume_edge_call('56000000-0000-4000-8000-0000000000a1','test-fn',2,interval '10 minutes') then raise exception 'third edge call accepted'; end if;
  if not public.consume_edge_call('56000000-0000-4000-8000-0000000000b2','test-fn',2,interval '10 minutes') then raise exception 'budget leaked between users'; end if;
  if not public.claim_revenuecat_event('evt-hardening-1') then raise exception 'first claim refused'; end if;
  if public.claim_revenuecat_event('evt-hardening-1') then raise exception 'replay accepted'; end if;
  perform public.release_revenuecat_event('evt-hardening-1');
  if not public.claim_revenuecat_event('evt-hardening-1') then raise exception 'released event cannot be reclaimed'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-0000000000a1',true);
do $$
declare v_count int; i int;
begin
  -- Social edges: B->F stays visible; B->C (incomplete), B->D (banned), B->E (blocks me) are hidden.
  select count(*) into v_count from public.follows where follower_id = '56000000-0000-4000-8000-0000000000b2';
  if v_count <> 1 then raise exception 'follows visibility: expected 1 row, got %', v_count; end if;
  select count(*) into v_count from public.follows where follower_id = (select auth.uid());
  if v_count <> 1 then raise exception 'own follow hidden'; end if;
  select count(*) into v_count from public.collaborations where a_id = '56000000-0000-4000-8000-0000000000b2';
  if v_count <> 1 then raise exception 'collaborations visibility: expected 1 row, got %', v_count; end if;
  if exists (select 1 from public.profiles where id = '56000000-0000-4000-8000-0000000000d4') then raise exception 'banned profile still listed'; end if;
  begin
    insert into private.edge_call_events(user_id, fn) values ((select auth.uid()), 'x');
    raise exception 'authenticated can write private.edge_call_events';
  exception when insufficient_privilege then null; end;
  -- Message quota: 30 per minute, the 31st is refused with rate_limited.
  for i in 1..30 loop
    insert into public.messages(conversation_id, sender_id, text)
    values ('56000000-0000-4000-8000-00000000c0a1', (select auth.uid()), 'message ' || i);
  end loop;
  begin
    insert into public.messages(conversation_id, sender_id, text)
    values ('56000000-0000-4000-8000-00000000c0a1', (select auth.uid()), 'one too many');
    raise exception 'message quota not enforced';
  exception when program_limit_exceeded then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
  -- Report quota: 10 per day.
  for i in 1..10 loop
    insert into public.reports(reporter_id, reported_id, reason)
    values ((select auth.uid()), '56000000-0000-4000-8000-0000000000b2', 'Spam repeated ' || i);
  end loop;
  begin
    insert into public.reports(reporter_id, reported_id, reason)
    values ((select auth.uid()), '56000000-0000-4000-8000-0000000000b2', 'Spam one too many');
    raise exception 'report quota not enforced';
  exception when program_limit_exceeded then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
  -- A single reporter never trips the report threshold.
  if (select moderation_status from public.profiles where id = '56000000-0000-4000-8000-0000000000b2') <> 'active' then
    raise exception 'one reporter changed the reported status';
  end if;
end $$;
reset role;
rollback;
