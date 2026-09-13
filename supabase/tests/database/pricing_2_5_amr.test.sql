-- Dispo 2.5 pricing: monthly plans, free automation, Premium ≤ 6 groups, AMR
-- workshop groups and the AMR Premium grant window. Runs inside a transaction
-- that is always rolled back: psql -v ON_ERROR_STOP=1 -f this-file.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.amr() returns uuid language sql stable as $$ select id from public.music_schools where slug='amr-geneve' $$;
select pg_temp.assert_true(pg_temp.amr() is not null,'AMR school missing');
select pg_temp.assert_true((select free_workshops_until>=date '2028-12-31' from public.music_schools where slug='amr-geneve'),'AMR free workshop window not guaranteed for 2 years');
select pg_temp.assert_true(exists(select 1 from public.school_premium_grants g where g.school_id=pg_temp.amr() and g.starts_at=timestamptz '2026-10-01 00:00:00 Europe/Zurich' and g.ends_at=timestamptz '2027-01-31 23:59:59 Europe/Zurich'),'AMR Premium grant window missing');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',('56000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated','pricing-sqlqa-'||i||'@local.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,3)i;
update public.profiles set name='Pricing QA',instruments=array['Piano'] where id::text like '56000000-%';
select pg_temp.assert_true(not exists(select 1 from public.profiles where id::text like '56000000-%' and is_premium),'Fresh profile is Premium');

-- 1. Free user: no regular group, but an AMR workshop group once a member.
set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free' and public.get_my_subscription()->>'source'='none','Free default missing');
select pg_temp.assert_true(public.get_my_subscription()->'workshop_schools'='[]'::jsonb,'Workshop schools offered without membership');
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('Forbidden',(select auth.uid())); raise exception 'Free account can create a regular group'; exception when insufficient_privilege then null; end;
 begin insert into public.music_groups(name,leader_id,school_id) values('Forbidden atelier',(select auth.uid()),pg_temp.amr()); raise exception 'Non-member can create a workshop group'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.music_school_memberships(school_id,profile_id,is_primary) values(pg_temp.amr(),'56000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select jsonb_array_length(public.get_my_subscription()->'workshop_schools')=1),'AMR workshop offer missing for member');
select pg_temp.assert_true((public.get_my_subscription()->'workshop_schools'->0->>'school_short_name')='AMR','Workshop school name missing');
insert into public.music_groups(id,name,leader_id,school_id) values('56000000-0000-4000-8000-000000000010','Atelier AMR',(select auth.uid()),pg_temp.amr());
insert into public.music_groups(id,name,leader_id,school_id) values('56000000-0000-4000-8000-000000000011','Atelier AMR 2',(select auth.uid()),pg_temp.amr());
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free','Workshop group changed the tier');
select pg_temp.assert_true((public.get_my_subscription()->>'group_count')::int=0 and (public.get_my_subscription()->>'workshop_group_count')::int=2,'Workshop groups counted toward the paid quota');
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('Still forbidden',(select auth.uid())); raise exception 'Workshop member can create a regular group for free'; exception when insufficient_privilege then null; end;
 begin update public.music_groups set school_id=null where id='56000000-0000-4000-8000-000000000010'; raise exception 'Workshop group converted to a regular group'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert_true((select school_id=pg_temp.amr() from public.music_groups where id='56000000-0000-4000-8000-000000000010'),'school_id changed');

-- 2. Automation is free: recurring series, custom reminder and auto-SOS on a free tier.
insert into public.group_events(id,group_id,kind,title,venue,public_location_label,date,series_id,recurrence,reminder_lead_days)
values('56000000-0000-4000-8000-000000000020','56000000-0000-4000-8000-000000000010','Répétition','Série gratuite','Carouge','Carouge',now()+interval '3 days','56000000-0000-4000-8000-000000000099','Chaque semaine',7);
update public.group_events set reminder_lead_days=14 where id='56000000-0000-4000-8000-000000000020';
select pg_temp.assert_true((select reminder_lead_days=14 from public.group_events where id='56000000-0000-4000-8000-000000000020'),'Custom reminder refused for free tier');
update public.music_groups set auto_sos_enabled=true,auto_sos_min_level='same' where id='56000000-0000-4000-8000-000000000010';
select pg_temp.assert_true((select auto_sos_enabled from public.music_groups where id='56000000-0000-4000-8000-000000000010'),'Auto-SOS refused for free tier');
do $$ begin
 begin insert into public.group_events(group_id,kind,title,venue,public_location_label,date,reminder_lead_days) values('56000000-0000-4000-8000-000000000010','Répétition','Rappel hors borne','Carouge','Carouge',now()+interval '3 days',61); raise exception 'Reminder range no longer validated'; exception when check_violation then null; end;
end $$;

-- 3. Demo video limit unchanged: free = 1.
do $$ begin
 begin update public.profiles set demo_videos=jsonb_build_array(jsonb_build_object('remoteURL','1'),jsonb_build_object('remoteURL','2')) where id=(select auth.uid()); raise exception 'Free account stored two demo videos'; exception when others then if sqlerrm not like '%demo_video_limit%' then raise; end if; end;
end $$;

-- 4. Premium (store): up to 6 regular groups, workshop groups not counted.
reset role;
select public.apply_revenuecat_subscription_state('56000000-0000-4000-8000-000000000002','premium',now()+interval '1 day',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='premium' and public.get_my_subscription()->>'source'='store','Store Premium not granted');
insert into public.music_groups(name,leader_id) select 'Premium '||i,(select auth.uid()) from generate_series(1,6)i;
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('Seventh',(select auth.uid())); raise exception 'Premium can lead a 7th group'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.music_school_memberships(school_id,profile_id,is_primary) values(pg_temp.amr(),'56000000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into public.music_groups(id,name,leader_id,school_id) values('56000000-0000-4000-8000-000000000012','Atelier premium',(select auth.uid()),pg_temp.amr());
select pg_temp.assert_true((public.get_my_subscription()->>'group_count')::int=6,'Workshop group counted for Premium');
do $$ begin
 begin update public.profiles set demo_videos=jsonb_build_array(jsonb_build_object('remoteURL','1'),jsonb_build_object('remoteURL','2'),jsonb_build_object('remoteURL','3'),jsonb_build_object('remoteURL','4'),jsonb_build_object('remoteURL','5'),jsonb_build_object('remoteURL','6'),jsonb_build_object('remoteURL','7')) where id=(select auth.uid()); raise exception 'Premium stored seven demo videos'; exception when others then if sqlerrm not like '%demo_video_limit%' then raise; end if; end;
end $$;
update public.profiles set demo_videos=jsonb_build_array(jsonb_build_object('remoteURL','1'),jsonb_build_object('remoteURL','2'),jsonb_build_object('remoteURL','3'),jsonb_build_object('remoteURL','4'),jsonb_build_object('remoteURL','5'),jsonb_build_object('remoteURL','6')) where id=(select auth.uid());
-- Transfer of a workshop group to a fellow AMR member who already leads 6 groups.
reset role;
insert into public.group_members(group_id,profile_id,kind) values('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000002','permanent');
set local role authenticated;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000001',true);
select public.transfer_group_leadership('56000000-0000-4000-8000-000000000011','56000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select leader_id='56000000-0000-4000-8000-000000000002' from public.music_groups where id='56000000-0000-4000-8000-000000000011'),'Workshop transfer refused');

-- 5. AMR Premium grant: only inside the window, mirrored on profiles.is_premium.
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true(public.get_my_subscription()->'upcoming_school_grant'='null'::jsonb,'Upcoming grant shown without membership');
reset role;
insert into public.music_school_memberships(school_id,profile_id,is_primary) values(pg_temp.amr(),'56000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free' and public.get_my_subscription()->>'source'='none','Grant applied outside its window');
select pg_temp.assert_true((public.get_my_subscription()->'upcoming_school_grant'->>'school_short_name')='AMR','Upcoming AMR grant not announced');
select pg_temp.assert_true(not (select is_premium from public.profiles where id=(select auth.uid())),'Profile Premium outside window');
reset role;
insert into public.school_premium_grants(school_id,starts_at,ends_at,note) values(pg_temp.amr(),now()-interval '1 hour',now()+interval '1 hour','QA temporary window');
select private.refresh_all_profile_premium();
set local role authenticated;
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='premium' and public.get_my_subscription()->>'source'='school_grant','School grant not applied');
select pg_temp.assert_true(public.get_my_subscription()->>'school_short_name'='AMR','Grant school name missing');
select pg_temp.assert_true((public.get_my_subscription()->>'expires_at')::timestamptz between now()+interval '59 minutes' and now()+interval '61 minutes','Grant expiry not exposed');
select pg_temp.assert_true((select is_premium from public.profiles where id=(select auth.uid())),'is_premium not mirrored for grant');
select pg_temp.assert_true(private.has_active_premium('56000000-0000-4000-8000-000000000001'),'Member 1 not Premium inside window');
insert into public.music_groups(name,leader_id) values('Grant group',(select auth.uid()));
select public.add_personal_song('{"title":"Grant song","artist":"QA"}');
-- Leaving the school revokes the grant immediately (membership rows change through the school RPCs or service role).
reset role;
update public.music_school_memberships set status='left',left_at=now(),is_primary=false where school_id=pg_temp.amr() and profile_id='56000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.assert_true(public.get_my_subscription()->>'tier'='free','Grant survives leaving the school');
select pg_temp.assert_true(not (select is_premium from public.profiles where id=(select auth.uid())),'is_premium not revoked after leaving');
do $$ begin
 begin insert into public.music_groups(name,leader_id) values('After leaving',(select auth.uid())); raise exception 'Ex-member can still create groups'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(exists(select 1 from cron.job where jobname='dispo-refresh-profile-premium-daily' and schedule='5 0 * * *'),'Daily Premium refresh job missing');
rollback;
