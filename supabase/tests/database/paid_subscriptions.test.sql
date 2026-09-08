begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',('55000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated','paid-sqlqa-'||i||'@local.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,3)i;
update public.profiles set name='Paid QA',instruments=array['Piano'] where id::text like '55000000-%';
select pg_temp.assert_true(not exists(select 1 from public.profiles where id::text like '55000000-%' and is_premium),'Beta grant still active');
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000001',true);
update public.profiles set is_premium=true where id=(select auth.uid());
select pg_temp.assert_true(not (select is_premium from public.profiles where id=(select auth.uid())),'Forged Premium accepted');
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free','Free default missing');
do $$ begin
 begin perform public.apply_revenuecat_subscription_state((select auth.uid()),'premium',now()+interval '1 day',now()); raise exception 'Client can grant purchases'; exception when insufficient_privilege then null; end;
 begin insert into public.music_groups(name,leader_id) values('Forbidden',(select auth.uid())); raise exception 'Free account can create group'; exception when insufficient_privilege then null; end;
 begin perform public.add_personal_song('{"title":"Forbidden"}'); raise exception 'Free account can add personal song'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.apply_revenuecat_subscription_state('55000000-0000-4000-8000-000000000001','group',now()+interval '1 day',now()-interval '1 minute');
set local role authenticated;
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='group','Groupe not granted');
insert into public.music_groups(id,name,leader_id) values('55000000-0000-4000-8000-000000000010','One group',(select auth.uid()));
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('Second',(select auth.uid())); raise exception 'Groupe can create second group'; exception when insufficient_privilege then null; end;
 begin update public.music_groups set auto_sos_enabled=true where leader_id=(select auth.uid()); raise exception 'Groupe includes Auto-SOS'; exception when insufficient_privilege then null; end;
 begin perform public.add_personal_song('{"title":"Forbidden"}'); raise exception 'Groupe includes personal repertoire'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select public.apply_revenuecat_subscription_state('55000000-0000-4000-8000-000000000001','premium',now()+interval '1 day',now());
select pg_temp.assert_true(not public.apply_revenuecat_subscription_state('55000000-0000-4000-8000-000000000001','free',null,now()-interval '30 seconds'),'Stale revocation overwrote purchase');
set local role authenticated;
insert into public.music_groups(name,leader_id) values('Second',(select auth.uid()));
select public.add_personal_song('{"title":"Personal arrangement","artist":"QA","form":"AABA"}');
select public.update_personal_arrangement((select id from public.personal_repertoire where profile_id=(select auth.uid()) limit 1),'{"key":"Eb","tempo_bpm":132}');
update public.personal_repertoire set mastery=3 where profile_id=(select auth.uid());
insert into public.personal_repertoire_settings(profile_id,is_public) values((select auth.uid()),true);
reset role;
insert into public.group_members(group_id,profile_id,kind) values('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000002','permanent');
set local role authenticated;
do $$ begin
 begin perform public.transfer_group_leadership('55000000-0000-4000-8000-000000000010','55000000-0000-4000-8000-000000000002'); raise exception 'Can transfer to free leader'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.personal_repertoire where profile_id='55000000-0000-4000-8000-000000000001'),'Public Premium repertoire invisible');
reset role;
-- Simulate time passing without a webhook. Cached profiles.is_premium stays true.
update private.subscription_state set expires_at=now()-interval '1 second' where profile_id='55000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.personal_repertoire where profile_id='55000000-0000-4000-8000-000000000001'),'Expired public repertoire still shared');
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free','Expiry depends on a webhook');
select pg_temp.assert_true((select count(*)=2 from public.music_groups where leader_id=(select auth.uid())),'Expiry erased groups');
select pg_temp.assert_true((select count(*)=1 from public.personal_repertoire where profile_id=(select auth.uid())),'Expiry erased personal work');
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('Expired',(select auth.uid())); raise exception 'Expired account can create'; exception when insufficient_privilege then null; end;
 begin update public.personal_repertoire set mastery=1 where profile_id=(select auth.uid()); raise exception 'Expired account can edit mastery'; exception when insufficient_privilege then null; end;
 begin perform public.update_personal_arrangement((select id from public.personal_repertoire limit 1),'{"tempo_bpm":150}'); raise exception 'Expired account can edit arrangement'; exception when insufficient_privilege then null; end;
end $$;
update public.personal_repertoire set hidden=true where profile_id=(select auth.uid());
update public.personal_repertoire_settings set is_public=false where profile_id=(select auth.uid());
select pg_temp.assert_true((select hidden from public.personal_repertoire where profile_id=(select auth.uid())),'Removal blocked after expiry');
reset role;
rollback;
