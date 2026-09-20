-- Base locale uniquement. Toutes les fixtures sont annulées.
-- Couvre le matching SOS 2.5 : score et raisons, garde à la candidature,
-- candidats (ordre, exclusions), contact unique, demande directe en double,
-- visibilité de my_gig_matches et retrait d'un SOS.
begin;
-- Structured locality for event fixtures created by this suite.
alter table public.group_events alter column country_code set default 'CH',
  alter column city set default 'Genève', alter column postal_code set default '1201';

-- Personnes : 1 hôte (Piano), 2 bassiste avancée compatible, 3 bassiste
-- débutant (niveau refusé), 4 bassiste bloqué·e par l'hôte, 5 pianiste
-- (instrument non recherché).
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('59000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'sqlqa59-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','QA Match '||i),now(),now(),'','','',''
from generate_series(1,5) i;

do $$
declare v_day date := ((now() + interval '7 days') at time zone 'Europe/Zurich')::date;
begin
  update public.profiles set instruments=array['Piano'],level='Avancé',genres=array['Jazz','Funk'],city='Genève',country='CH',
    latitude=46.2044,longitude=6.1432,location_precision='city',available_dates=array[v_day]
    where id='59000000-0000-4000-8000-000000000001';
  update public.profiles set instruments=array['Basse','Contrebasse'],level='Intermédiaire',instrument_levels='{"Basse":"Avancé"}',
    genres=array['Jazz','Rock / Pop'],city='Genève',country='CH',latitude=46.21,longitude=6.15,location_precision='city',
    available_dates=array[v_day],
    availability_time_slots=jsonb_build_object(v_day::text, '[{"start":"19:00","end":"23:30"}]'::jsonb)
    where id='59000000-0000-4000-8000-000000000002';
  update public.profiles set instruments=array['Basse'],level='Débutant',genres=array['Blues'],city='Lausanne',country='CH',
    latitude=46.52,longitude=6.63,location_precision='city',available_dates=array[v_day],
    availability_places=jsonb_build_array(jsonb_build_object('id','trip-1','from',(v_day-1)::text,'to',(v_day+1)::text,'city','Lisbonne','country','PT'))
    where id='59000000-0000-4000-8000-000000000003';
  update public.profiles set instruments=array['Basse'],level='Avancé',genres=array['Jazz'],city='Genève',available_dates=array[v_day]
    where id='59000000-0000-4000-8000-000000000004';
  update public.profiles set instruments=array['Piano'],level='Avancé',genres=array['Jazz'],city='Genève',available_dates=array[v_day]
    where id='59000000-0000-4000-8000-000000000005';

  insert into public.music_schools(id,slug,name,short_name,city) values ('59000000-0000-4000-8000-000000000010','sqlqa59-school','QA Match School','QMS','Genève');
  insert into public.music_school_memberships(profile_id,school_id,status,visibility)
  values ('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000010','active','profile'),
         ('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000010','active','profile'),
         ('59000000-0000-4000-8000-000000000003','59000000-0000-4000-8000-000000000010','active','profile'),
         ('59000000-0000-4000-8000-000000000004','59000000-0000-4000-8000-000000000010','active','profile');

  -- Répertoires publics (Premium requis pour être lisible par autrui).
  insert into private.subscription_state(profile_id,tier,expires_at,checked_at)
  values ('59000000-0000-4000-8000-000000000001','premium',now()+interval '30 days',now()),
         ('59000000-0000-4000-8000-000000000002','premium',now()+interval '30 days',now());
  insert into public.personal_repertoire_settings(profile_id,is_public) values
    ('59000000-0000-4000-8000-000000000001',true),('59000000-0000-4000-8000-000000000002',true);
  insert into public.personal_repertoire(profile_id,song,identity) values
    ('59000000-0000-4000-8000-000000000001','{"title":"Blue Bossa","artist":"Kenny Dorham"}',private.personal_song_identity('{"title":"Blue Bossa","artist":"Kenny Dorham"}')),
    ('59000000-0000-4000-8000-000000000001','{"title":"Autumn Leaves","artist":"Joseph Kosma"}',private.personal_song_identity('{"title":"Autumn Leaves","artist":"Joseph Kosma"}')),
    ('59000000-0000-4000-8000-000000000002','{"title":"blue  bossa","artist":"KENNY DORHAM"}',private.personal_song_identity('{"title":"blue  bossa","artist":"KENNY DORHAM"}')),
    ('59000000-0000-4000-8000-000000000002','{"title":"So What","artist":"Miles Davis"}',private.personal_song_identity('{"title":"So What","artist":"Miles Davis"}'));

  insert into public.follows(follower_id,following_id) values
    ('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002'),
    ('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000001');
  insert into public.blocks(blocker_id,blocked_id) values ('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000004');
  -- L'appareil push exige que la ligne appartienne au JWT courant.
  perform set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
  insert into public.push_devices(user_id,token,platform,environment) values
    ('59000000-0000-4000-8000-000000000002',repeat('a1',20),'ios','development');
  perform set_config('request.jwt.claim.sub','',true);

  insert into public.gig_requests(id,host_id,title,date,genre,wanted_instruments,wanted_levels,wanted_school_ids,place,neighborhood,public_location_label)
  values ('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000001','Trio du jeudi',
    ((v_day::text || ' 20:30')::timestamp at time zone 'Europe/Zurich'),'Jazz',array['Basse','Batterie'],array['Avancé','Professionnel'],
    array['59000000-0000-4000-8000-000000000010']::uuid[],'Genève','1201 Genève','Genève');
end;
$$;

create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;

-- A related event used to replace, rather than complement, the host's repertoire.
insert into public.music_groups(id,name,leader_id,repertoire) values
 ('59000000-0000-4000-8000-000000000050','Matching QA','59000000-0000-4000-8000-000000000001','[]');
insert into public.group_events(id,group_id,kind,title,venue,date,setlist) values
 ('59000000-0000-4000-8000-000000000060','59000000-0000-4000-8000-000000000050','Concert','Matching QA','Genève',((((now()+interval '7 days') at time zone 'Europe/Zurich')::date + time '20:30') at time zone 'Europe/Zurich'),'[]');
update public.gig_requests set event_id='59000000-0000-4000-8000-000000000060'
 where id='59000000-0000-4000-8000-000000000040';
-- Exercise both membership-only and private visibility, viewed by a non-member.
update public.music_school_memberships set visibility='private'
 where profile_id='59000000-0000-4000-8000-000000000002';
update public.music_school_memberships set visibility='school_only'
 where profile_id='59000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000005',true);
select pg_temp.assert_ok((select count(*)=2 from public.profile_school_affiliations(array['59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000003']::uuid[])), 'non-members must see school identities');
select pg_temp.assert_ok((select count(*)=0 from public.music_school_memberships where profile_id in ('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000003')), 'private role details must stay private');
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_ok((select count(*)=0 from public.profile_school_affiliations(array['59000000-0000-4000-8000-000000000004']::uuid[])), 'blocked school identity leaked');
select pg_temp.assert_ok((select song_count=1 from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'shared solo song missing on card');
select pg_temp.assert_ok((select (c->'match'->'common_songs'->>'count')::int=1 from public.gig_candidates('59000000-0000-4000-8000-000000000040') c where c->'profile'->>'id'='59000000-0000-4000-8000-000000000002'), 'empty event setlist must not hide common solo songs');
reset role;
-- Score increases when a new common song is added; existing setlist duplication counts once.
create temp table before_score as select private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002') as value;
update public.group_events set setlist='[{"id":"59000000-0000-4000-8000-000000000070","title":"Blue Bossa","artist":"Kenny Dorham","is_approved":true}]'
 where id='59000000-0000-4000-8000-000000000060';
select pg_temp.assert_ok((private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->'common_songs'->>'count')::int=1, 'song duplicated across setlist and solo repertoire');
update public.personal_repertoire set hidden=true where profile_id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select song_count is null from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'hidden song leaked');
select pg_temp.assert_ok((private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->>'score')::int < (select (value->>'score')::int from before_score), 'common songs must increase score');
update public.personal_repertoire set hidden=false where profile_id='59000000-0000-4000-8000-000000000002';
update public.personal_repertoire_settings set is_public=false where profile_id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select song_count is null from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'private repertoire count leaked');

-- Saving rules as the owner, then reading them after changing session.
set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
update public.profiles set available_dates='{}', availability_time_slots='{}',
 weekly_availability=jsonb_build_object(extract(dow from ((now()+interval '7 days') at time zone 'Europe/Zurich'))::integer::text,'[{"start":"19:00","end":"23:30"}]'::jsonb)
 where id=auth.uid();
do $$ begin
 begin
  update public.profiles set weekly_availability='{"5":[{"start":"22:00","end":"18:00"}]}' where id=auth.uid();
  raise exception 'invalid times were accepted';
 exception when invalid_parameter_value then null; end;
 begin
  update public.profiles set weekly_availability='{"8":[]}' where id=auth.uid();
  raise exception 'invalid weekday was accepted';
 exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_ok((select (c->'match'->>'available_on_date')::boolean and (c->'match'->>'time_slot_ok')::boolean from public.gig_candidates('59000000-0000-4000-8000-000000000040') c where c->'profile'->>'id'='59000000-0000-4000-8000-000000000002'), 'weekly availability must persist and affect match');
reset role;
-- Local clock remains 19:00 across summer/winter time and future years.
update public.profiles set weekly_availability='{"5":[{"start":"19:00","end":"22:00"}]}' where id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select private.profile_availability_slots(p,'2028-03-31')='[{"start":"19:00","end":"22:00"}]'::jsonb from public.profiles p where id='59000000-0000-4000-8000-000000000002'), 'weekly rule must have no generated-date expiry');
update public.group_events set date='2026-10-30 19:30:00+01' where id='59000000-0000-4000-8000-000000000060';
select pg_temp.assert_ok((private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->>'time_slot_ok')::boolean, 'winter clock matching failed');
update public.group_events set date='2026-10-30 22:00:00+01' where id='59000000-0000-4000-8000-000000000060';
select pg_temp.assert_ok(not (private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->>'time_slot_ok')::boolean, 'end time must be exclusive');
update public.profiles set available_dates=array['2026-10-30']::date[],availability_time_slots='{"2026-10-30":[{"start":"10:00","end":"12:00"}]}' where id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select private.profile_availability_slots(p,'2026-10-30')='[{"start":"10:00","end":"12:00"}]'::jsonb from public.profiles p where id='59000000-0000-4000-8000-000000000002'), 'one-off override lost');
select pg_temp.assert_ok(not has_function_privilege('anon','public.profile_school_affiliations(uuid[])','EXECUTE'), 'anonymous school access');
select pg_temp.assert_ok(not has_function_privilege('anon','public.profile_common_songs(uuid[])','EXECUTE'), 'anonymous repertoire access');
select 'recurrence, shared songs and school identities: assertions passed' as result;
rollback;
