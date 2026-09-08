begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000', ('54000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
'repertoire-sqlqa-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Repertoire QA '||i),now(),now(),'','','','' from generate_series(1,3) i;
insert into private.subscription_state(profile_id,tier,expires_at,checked_at) select id,'premium',now()+interval '1 day',now() from public.profiles where id::text like '54000000-%';
update public.profiles set name='Repertoire QA', instruments=array['Piano'] where id::text like '54000000-%';
insert into public.music_groups(id,name,leader_id,repertoire) values
('54000000-0000-4000-8000-000000000010','Library QA','54000000-0000-4000-8000-000000000001','[{"id":"54000000-0000-4000-8000-000000000030","title":"Blue Bossa","artist":"Kenny Dorham","is_approved":true,"solos":["private-member"],"chords":"private notes"},{"id":"54000000-0000-4000-8000-000000000031","title":"Pending song","is_approved":false}]');
insert into public.group_members(group_id,profile_id,kind) values('54000000-0000-4000-8000-000000000010','54000000-0000-4000-8000-000000000002','permanent');
select pg_temp.assert_true((select count(*)=2 from public.personal_repertoire where profile_id::text like '54000000-%'),'Leader/member import or pending-song exclusion failed');
select pg_temp.assert_true(not exists(select 1 from public.personal_repertoire where profile_id::text like '54000000-%' and (song ? 'solos' or song ? 'chords' or song ? 'suggested_by')),'Group-private data copied');
set local role authenticated;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.personal_repertoire where profile_id::text like '54000000-%'),'Private repertoire leaked');
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=1 from public.personal_repertoire),'Owner cannot read own songs');
update public.personal_repertoire set mastery=3,style='Jazz latin',hidden=true where profile_id=(select auth.uid());
insert into public.personal_repertoire_settings(profile_id,is_public) values ((select auth.uid()),true);
do $$ begin
  begin update public.personal_repertoire set profile_id='54000000-0000-4000-8000-000000000003'; raise exception 'Owner can reassign rows'; exception when insufficient_privilege then null; end;
  begin delete from public.personal_repertoire; raise exception 'Owner can delete exclusions'; exception when insufficient_privilege then null; end;
  begin update public.personal_repertoire set mastery=4; raise exception 'Invalid mastery accepted'; exception when check_violation then null; end;
  begin insert into public.personal_repertoire_settings(profile_id,is_public) values ('54000000-0000-4000-8000-000000000001',true); raise exception 'Another owner settings writable'; exception when insufficient_privilege then null; end;
  begin perform public.add_personal_song('{}'); raise exception 'Empty title accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.music_groups set repertoire = repertoire where id='54000000-0000-4000-8000-000000000010';
select pg_temp.assert_true((select hidden and mastery=3 and style='Jazz latin' from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000002'),'Automatic refresh revived exclusion or overwrote mastery');
set local role authenticated;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.personal_repertoire),'Public hidden song leaked');
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000002',true);
select public.add_personal_song('{"title":"  Blue   Bossa  ","artist":"Kenny Dorham","solos":["private"],"chords":"private"}');
select pg_temp.assert_true((select count(*)=1 from public.personal_repertoire),'Manual restoration duplicated song');
select pg_temp.assert_true((select not hidden and origin='manual' and mastery=3 from public.personal_repertoire),'Manual restoration lost mastery');
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.personal_repertoire),'Public repertoire cannot be read');
do $$ declare affected integer; begin
  update public.personal_repertoire set mastery=0 where profile_id='54000000-0000-4000-8000-000000000002'; get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Visitor can edit public song'; end if;
end $$;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000002',true);
insert into public.blocks(blocker_id,blocked_id) values ((select auth.uid()),'54000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.personal_repertoire),'Block in reverse direction ignored');
reset role;
insert into public.group_events(id,group_id,kind,title,venue,date,setlist) values ('54000000-0000-4000-8000-000000000040','54000000-0000-4000-8000-000000000010','Répétition','Library session','Studio',now()+interval '1 day','[{"id":"54000000-0000-4000-8000-000000000032","title":"All of Me","artist":"Gerald Marks","is_approved":true}]');
select pg_temp.assert_true((select count(*)=2 from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000002'),'Event song not synced');
delete from public.group_members where profile_id='54000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select count(*)=2 from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000002'),'Leaving group destroyed personal work');
set local role anon;
do $$ begin
  begin perform public.add_personal_song('{"title":"Forbidden"}'); raise exception 'Anon can add song'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.personal_repertoire; raise exception 'Anon can read library'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000001',true);
-- Catalog identity survives renamed metadata, hidden rows and membership re-joins.
update public.music_groups set repertoire='[{"id":"54000000-0000-4000-8000-000000000030","title":"Blue Bossa","artist":"Kenny Dorham","canonical_song_id":"54000000-0000-4000-8000-000000000099","is_approved":true}]' where id='54000000-0000-4000-8000-000000000010';
update public.personal_repertoire set hidden=true where profile_id='54000000-0000-4000-8000-000000000001' and song->>'title'='Blue Bossa';
update public.music_groups set repertoire='[{"id":"54000000-0000-4000-8000-000000000030","title":"Blue Bossa (remastered)","artist":"Kenny Dorham Quartet","canonical_song_id":"54000000-0000-4000-8000-000000000099","is_approved":true}]' where id='54000000-0000-4000-8000-000000000010';
select pg_temp.assert_true((select count(*)=2 and count(*) filter(where hidden)=1 from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000001'),'Catalog rename revived or duplicated excluded song');
update public.personal_repertoire set hidden=true where profile_id='54000000-0000-4000-8000-000000000002' and song->>'title'='All of Me';
insert into public.group_members(group_id,profile_id,kind) values('54000000-0000-4000-8000-000000000010','54000000-0000-4000-8000-000000000002','permanent');
select pg_temp.assert_true((select hidden from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000002' and song->>'title'='All of Me'),'Rejoining a group revived an exclusion');

-- Per-user arrangements survive group refresh, manual restore and private visibility.
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.add_personal_song('{"title":"All of Me","artist":"Gerald Marks"}');
select public.update_personal_arrangement((select id from public.personal_repertoire where song->>'title'='All of Me'),'{"key":"Eb","tempo_bpm":132,"form":"AABA"}');
select public.update_personal_arrangement((select id from public.personal_repertoire where song->>'title'='All of Me'),'{"key":null}');
select pg_temp.assert_true((select arrangement='{"key":null,"tempo_bpm":132,"form":"AABA"}'::jsonb from public.personal_repertoire where song->>'title'='All of Me'),'Partial update erased unrelated personal work');
do $$ declare v_id uuid := (select id from public.personal_repertoire where song->>'title'='All of Me'); begin
  begin perform public.update_personal_arrangement(v_id,'{"tempo_bpm":-1}'); raise exception 'Invalid BPM accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_personal_arrangement(v_id,'{"title":""}'); raise exception 'Empty title accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.update_personal_arrangement(v_id,'{"solos":["other-user"]}'); raise exception 'Group-only metadata accepted'; exception when invalid_parameter_value then null; end;
  begin update public.personal_repertoire set arrangement='{}'; raise exception 'Direct overrides accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true((select setlist->0->>'tempo_bpm' is null from public.group_events where id='54000000-0000-4000-8000-000000000040'),'Personal edits changed the group');
select set_config('test.foreign_song_id', (select id::text from public.personal_repertoire where profile_id='54000000-0000-4000-8000-000000000002' and song->>'title'='All of Me'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub','54000000-0000-4000-8000-000000000003',true);
do $$ begin
  begin perform public.update_personal_arrangement(current_setting('test.foreign_song_id')::uuid,'{"key":"C"}'); raise exception 'Other owner writable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
