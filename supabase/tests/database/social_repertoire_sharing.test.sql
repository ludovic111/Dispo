begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000', ('70000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
'sharing70-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Sharing QA '||i),now(),now(),'','','','' from generate_series(1,4) i;
update public.profiles set instruments=array['Piano'] where id::text like '70000000-%';
insert into public.personal_repertoire(profile_id,song,identity)
select ('70000000-0000-4000-8000-00000000000'||i)::uuid, s.song, private.personal_song_identity(s.song)
from generate_series(1,3) i cross join (values
 ('{"title":"Blue Bossa","artist":"Kenny Dorham","catalog_id":"apple:blue"}'::jsonb),
 ('{"title":"Autumn Leaves","artist":"Joseph Kosma","catalog_id":"apple:autumn"}'::jsonb)
) s(song);
insert into public.personal_repertoire(profile_id,song,identity) values
('70000000-0000-4000-8000-000000000001','{"title":"Blue Bossa remastered","artist":"KD","catalog_id":"apple:blue"}','alias'),
('70000000-0000-4000-8000-000000000001','{"title":"Only mine","artist":"Me"}','only-mine');
update public.personal_repertoire set hidden=true where profile_id='70000000-0000-4000-8000-000000000003' and song->>'catalog_id'='apple:autumn';
update public.personal_repertoire set arrangement='{"form":"PRIVATE NOTE"}',mastery=3 where profile_id='70000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_ok((select count(*)=2 from public.personal_repertoire where profile_id='70000000-0000-4000-8000-000000000002'),'Default repertoire not public');
select pg_temp.assert_ok((select song_count=2 and overlap_percent=80 and cardinality(titles)=2 from public.profile_common_songs(array['70000000-0000-4000-8000-000000000002']::uuid[])),'Canonical alias deduplication failed');
select pg_temp.assert_ok(jsonb_array_length(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002']::uuid[])->'songs')=1,'Group intersection, duplicates or hidden rows wrong');
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000002']::uuid[])::text not like '%PRIVATE NOTE%','Personal notes leaked into group');
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000004']::uuid[])->'songs'='[]','Empty repertoire creates fake common songs');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
insert into public.personal_repertoire_settings(profile_id,is_public) values(auth.uid(),false);
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_ok((select count(*)=0 from public.personal_repertoire where profile_id='70000000-0000-4000-8000-000000000002'),'Private songs readable');
select pg_temp.assert_ok((select not is_public from public.personal_repertoire_settings where profile_id='70000000-0000-4000-8000-000000000002'),'Explicit privacy choice lost');
select pg_temp.assert_ok((select song_count=2 and overlap_percent=80 and titles='{}' from public.profile_common_songs(array['70000000-0000-4000-8000-000000000002']::uuid[])),'Private match totals lost or titles leaked');
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000002']::uuid[])='{"songs":[],"unavailable_count":1}'::jsonb,'Private songs leaked through group creation');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_ok(jsonb_array_length(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000001']::uuid[])->'songs')=2,'Owner cannot share own private songs explicitly');
insert into public.blocks(blocker_id,blocked_id) values(auth.uid(),'70000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_ok(not exists(select 1 from public.profile_common_songs(array['70000000-0000-4000-8000-000000000002']::uuid[])),'Blocked match exposed');
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000002']::uuid[])->'songs'='[]','Blocked songs exposed');
reset role;
update public.profiles set moderation_status='banned' where id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000003']::uuid[])->'songs'='[]','Banned profile songs exposed');
select pg_temp.assert_ok(public.group_common_repertoire(array['70000000-0000-4000-8000-000000000099']::uuid[])->'songs'='[]','Unknown profile accepted');
reset role;
select pg_temp.assert_ok(not has_function_privilege('anon','public.group_common_repertoire(uuid[])','execute'),'Anonymous group lookup permitted');
select 'Social repertoire sharing assertions passed' as result;
rollback;
