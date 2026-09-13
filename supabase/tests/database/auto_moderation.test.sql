-- Automatic moderation checks (local only, everything rolled back):
--   docker exec -i supabase_db_dispo psql -U postgres -v ON_ERROR_STOP=1 \
--     -f - < supabase/tests/database/auto_moderation.test.sql
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-000000000001','authenticated','authenticated','mod-1@local.test','',now(),'{}','{"name":"Mod One"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-000000000002','authenticated','authenticated','mod-2@local.test','',now(),'{}','{"name":"Mod Two"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-000000000011','authenticated','authenticated','mod-r1@local.test','',now(),'{}','{"name":"Reporter One"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-000000000012','authenticated','authenticated','mod-r2@local.test','',now(),'{}','{"name":"Reporter Two"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-000000000013','authenticated','authenticated','mod-r3@local.test','',now(),'{}','{"name":"Reporter Three"}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','57000000-0000-4000-8000-0000000000ad','authenticated','authenticated','mod-admin@local.test','',now(),'{}','{"name":"Mod Admin"}',now(),now(),'','','','');
update public.profiles set instruments = array['Guitare']::text[] where id::text like '57000000-0000-4000-8000-%';
update public.profiles set is_admin = true where id = '57000000-0000-4000-8000-0000000000ad';
insert into public.conversations(id, participant_a, participant_b)
values ('57000000-0000-4000-8000-00000000c012','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000002');
insert into public.music_groups(id, name, leader_id)
values ('57000000-0000-4000-8000-0000000000a1', 'Trio test', '57000000-0000-4000-8000-0000000000ad')
on conflict do nothing;

-- Extra rules seeded by the migration; musical vocabulary stays allowed.
do $$ begin
  if not private.community_text_allowed('Killing Me Softly, Black Sabbath, death metal, sale temps pour un concert.') then raise exception 'Musical text blocked'; end if;
  if private.community_text_allowed('je vais te tuer') then raise exception 'Threat not filtered'; end if;
  if private.community_text_allowed('MORT AUX JUIFS') then raise exception 'Hate slogan not filtered'; end if;
  if (select moderation_status from public.profiles where id = '57000000-0000-4000-8000-000000000001') <> 'active' then raise exception 'new profile not active'; end if;
  -- Manual member names and report reasons are rejected (no strike).
  begin
    insert into public.group_manual_members(group_id, name, kind) values ('57000000-0000-4000-8000-0000000000a1', 'heil hitler', 'permanent');
    raise exception 'Manual member name accepted a slogan';
  exception when check_violation then if sqlerrm <> 'content_not_allowed' then raise; end if; end;
end $$;

-- 1. A slur in a private message is sanitised and counts a strike.
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true);
do $$
declare v_text text; v_moderated boolean; v_state jsonb;
begin
  insert into public.messages(conversation_id, sender_id, text)
  values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'hello, kill yourself!')
  returning text, moderated into v_text, v_moderated;
  if v_text <> '[message retiré par la modération]' or not v_moderated then raise exception 'Message not sanitised: %', v_text; end if;
  insert into public.messages(conversation_id, sender_id, text)
  values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'Répète à 20h, apporte ta basse.')
  returning text, moderated into v_text, v_moderated;
  if v_moderated then raise exception 'Clean message flagged'; end if;
  v_state := public.get_my_moderation_state();
  if v_state->>'status' <> 'active' or (v_state->>'strikes')::int <> 1 then raise exception 'Unexpected state after one strike: %', v_state; end if;
  -- Client cannot forge the columns.
  update public.profiles set strikes = 0, moderation_status = 'active' where id = (select auth.uid());
  if (select strikes from public.profiles where id = (select auth.uid())) <> 1 then raise exception 'Client reset strikes'; end if;
  -- Two more strikes -> suspended for 7 days.
  insert into public.messages(conversation_id, sender_id, text) values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'WHITE POWER');
  insert into public.messages(conversation_id, sender_id, text) values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'va te suicider');
  v_state := public.get_my_moderation_state();
  if v_state->>'status' <> 'suspended' or (v_state->>'strikes')::int <> 3
     or (v_state->>'suspended_until')::timestamptz < now() + interval '6 days' then
    raise exception 'Not suspended after 3 strikes: %', v_state;
  end if;
  begin
    insert into public.messages(conversation_id, sender_id, text) values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'still here');
    raise exception 'Suspended user could write';
  exception when insufficient_privilege then if sqlerrm <> 'account_suspended' then raise; end if; end;
  begin
    insert into public.follows(follower_id, following_id) values ((select auth.uid()), '57000000-0000-4000-8000-000000000002');
    raise exception 'Suspended user could follow';
  exception when insufficient_privilege then if sqlerrm <> 'account_suspended' then raise; end if; end;
  update public.profiles set moderation_status = 'active', suspended_until = null where id = (select auth.uid());
  if public.get_my_moderation_state()->>'status' <> 'suspended' then raise exception 'Client lifted its own suspension'; end if;
  -- Non-admin cannot moderate anyone.
  begin
    perform public.admin_set_moderation_status('57000000-0000-4000-8000-000000000002', 'banned', 'x', null);
    raise exception 'Non-admin used the admin RPC';
  exception when insufficient_privilege then if sqlerrm <> 'admin_required' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from private.moderation_events where profile_id = '57000000-0000-4000-8000-000000000001' and kind = 'strike') <> 3 then raise exception 'Strike events missing'; end if;
  if (select count(*) from private.moderation_events where profile_id = '57000000-0000-4000-8000-000000000001' and kind = 'suspend') <> 1 then raise exception 'Suspend event missing'; end if;
  if (select count(*) from public.messages where conversation_id = '57000000-0000-4000-8000-00000000c012' and moderated) <> 3 then raise exception 'Sanitised rows not stored'; end if;
end $$;

-- 2. Three distinct reporters in 7 days suspend the reported profile for 72 h.
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000011',true);
do $$ begin
  begin
    insert into public.reports(reporter_id, reported_id, reason) values ((select auth.uid()), '57000000-0000-4000-8000-000000000002', 'hello, kill yourself!');
    raise exception 'Report reason accepted a threat';
  exception when check_violation then if sqlerrm <> 'content_not_allowed' then raise; end if; end;
  insert into public.reports(reporter_id, reported_id, reason) values ((select auth.uid()), '57000000-0000-4000-8000-000000000002', 'Harcèlement répété par message');
end $$;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000012',true);
insert into public.reports(reporter_id, reported_id, reason) values ((select auth.uid()), '57000000-0000-4000-8000-000000000002', 'Harcèlement répété par message');
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000002',true);
do $$ begin
  if public.get_my_moderation_state()->>'status' <> 'active' then raise exception 'Two reporters already suspended the profile'; end if;
end $$;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000013',true);
insert into public.reports(reporter_id, reported_id, reason) values ((select auth.uid()), '57000000-0000-4000-8000-000000000002', 'Harcèlement répété par message');
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000002',true);
do $$ declare v_state jsonb; begin
  v_state := public.get_my_moderation_state();
  if v_state->>'status' <> 'suspended' or v_state->>'reason' <> 'report_threshold'
     or (v_state->>'suspended_until')::timestamptz < now() + interval '71 hours' then
    raise exception 'Report threshold did not suspend: %', v_state;
  end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from private.moderation_events where profile_id = '57000000-0000-4000-8000-000000000002' and kind = 'report_threshold') then raise exception 'report_threshold event missing'; end if;
end $$;

-- 3. Admin review: reactivate, then ban; banned users cannot edit and vanish.
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-0000000000ad',true);
do $$ declare v_state jsonb; v_count int; begin
  select count(*) into v_count from public.reports where reported_id = '57000000-0000-4000-8000-000000000002';
  if v_count <> 3 then raise exception 'Admin does not see the 3 reports (got %)', v_count; end if;
  update public.reports set status = 'reviewed', reviewed_by = (select auth.uid()), reviewed_at = now(), action_taken = 'warning'
   where reported_id = '57000000-0000-4000-8000-000000000002';
  v_state := public.admin_set_moderation_status('57000000-0000-4000-8000-000000000002', 'active', 'reviewed, warning sent', null);
  if v_state->>'status' <> 'active' then raise exception 'Admin reactivation failed: %', v_state; end if;
  v_state := public.admin_set_moderation_status('57000000-0000-4000-8000-000000000002', 'banned', 'repeat offender', null);
  if v_state->>'status' <> 'banned' then raise exception 'Admin ban failed: %', v_state; end if;
  begin
    perform public.admin_set_moderation_status('57000000-0000-4000-8000-000000000002', 'weird', null, null);
    raise exception 'Invalid status accepted';
  exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000002',true);
do $$ begin
  if public.get_my_moderation_state()->>'status' <> 'banned' then raise exception 'Banned user not reported as banned'; end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid())) then raise exception 'Banned user lost its own row'; end if;
  begin
    update public.profiles set bio = 'still around' where id = (select auth.uid());
    raise exception 'Banned user edited its profile';
  exception when insufficient_privilege then if sqlerrm <> 'account_banned' then raise; end if; end;
  begin
    insert into public.messages(conversation_id, sender_id, text) values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'hi');
    raise exception 'Banned user could write';
  exception when insufficient_privilege then if sqlerrm <> 'account_banned' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000011',true);
do $$ begin
  if exists (select 1 from public.profiles where id = '57000000-0000-4000-8000-000000000002') then raise exception 'Banned profile visible to others'; end if;
  if exists (select 1 from public.reports where reported_id = '57000000-0000-4000-8000-000000000002' and reporter_id <> (select auth.uid())) then raise exception 'Reporter sees other reports'; end if;
end $$;
reset role;

-- 4. An expired suspension reactivates lazily.
update public.profiles set suspended_until = now() - interval '1 minute' where id = '57000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true);
do $$ begin
  if public.get_my_moderation_state()->>'status' <> 'active' then raise exception 'Expired suspension not lifted'; end if;
  insert into public.messages(conversation_id, sender_id, text) values ('57000000-0000-4000-8000-00000000c012', (select auth.uid()), 'back on stage');
end $$;
reset role;
do $$ begin
  if not exists (select 1 from private.moderation_events where profile_id = '57000000-0000-4000-8000-000000000001' and kind = 'reactivate') then raise exception 'reactivate event missing'; end if;
end $$;
rollback;
