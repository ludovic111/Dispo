-- Base locale uniquement. Toutes les fixtures sont annulées.
-- Couvre le matching SOS 2.5 : score et raisons, garde à la candidature,
-- candidats (ordre, exclusions), contact unique, demande directe en double,
-- visibilité de my_gig_matches et retrait d'un SOS.
begin;

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
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
-- Manual and imported personal entries count identically; canonical aliases count once.
update public.personal_repertoire set origin='group',song=song || '{"canonical_song_id":"blue"}' where song->>'title' ilike '%bossa%';
insert into public.personal_repertoire(profile_id,song,identity,origin) values
 ('59000000-0000-4000-8000-000000000002','{"title":"Blue Bossa alternate","artist":"Other","canonical_song_id":"blue"}','alias','manual');
select pg_temp.assert_ok((select song_count=1 and overlap_percent=50 and a_count=2 and b_count=2 from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'canonical deduplication or Dice denominator wrong');
select pg_temp.assert_ok((select a.overlap_percent=b.overlap_percent and a.song_count=b.song_count from private.personal_repertoire_overlap('59000000-0000-4000-8000-000000000001','59000000-0000-4000-8000-000000000002') a cross join private.personal_repertoire_overlap('59000000-0000-4000-8000-000000000002','59000000-0000-4000-8000-000000000001') b), 'overlap is asymmetric');
-- No direct reads of group repertoire/setlist: unapproved group songs are not imported.
insert into public.music_groups(id,name,leader_id,repertoire) values
 ('59000000-0000-4000-8000-000000000050','Matching QA','59000000-0000-4000-8000-000000000001','[{"id":"59000000-0000-4000-8000-000000000070","title":"So What","artist":"Miles Davis","is_approved":false}]');
insert into public.group_events(id,group_id,kind,title,venue,date,setlist,country_code,city,postal_code) values
 ('59000000-0000-4000-8000-000000000060','59000000-0000-4000-8000-000000000050','Concert','Matching QA','Genève',now()+interval '7 days','[{"id":"59000000-0000-4000-8000-000000000070","title":"So What","artist":"Miles Davis","is_approved":false}]','CH','Genève','1201');
update public.gig_requests set event_id='59000000-0000-4000-8000-000000000060' where id='59000000-0000-4000-8000-000000000040';
select pg_temp.assert_ok((private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->'common_songs') @> '{"count":1,"overlap_percent":50}', 'SOS consulted group songs directly');
-- Same title alone must not match a different artist.
update public.personal_repertoire set hidden=true where profile_id='59000000-0000-4000-8000-000000000002' and song->>'canonical_song_id'='blue';
insert into public.personal_repertoire(profile_id,song,identity) values ('59000000-0000-4000-8000-000000000002','{"title":"Autumn Leaves","artist":"Different composer"}','different-artist');
select pg_temp.assert_ok((select song_count=0 and overlap_percent=0 from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'hidden/title-only song counted');
update public.personal_repertoire set hidden=true where profile_id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select song_count is null and overlap_percent is null from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'empty repertoire must be unavailable');
update public.personal_repertoire set hidden=false where profile_id='59000000-0000-4000-8000-000000000002' and song->>'canonical_song_id'='blue';
update public.personal_repertoire set hidden=true where profile_id='59000000-0000-4000-8000-000000000001' and song->>'canonical_song_id' is null;
select pg_temp.assert_ok((select song_count=1 and overlap_percent=100 from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'identical repertoires must be 100');
update public.personal_repertoire_settings set is_public=false where profile_id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select song_count=1 and overlap_percent=100 and titles='{}' from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'private repertoire leaked');
update public.personal_repertoire_settings set is_public=true where profile_id='59000000-0000-4000-8000-000000000002';
update private.subscription_state set expires_at=now()-interval '1 day' where profile_id='59000000-0000-4000-8000-000000000002';
select pg_temp.assert_ok((select overlap_percent=100 from public.profile_common_songs(array['59000000-0000-4000-8000-000000000002']::uuid[])), 'subscription expiry hid free repertoire overlap');
select pg_temp.assert_ok(not has_function_privilege('anon','public.profile_common_songs(uuid[])','execute'), 'anonymous overlap access');
-- Single-genre legacy inserts retain their genre; modern multi-select and old edits interoperate.
select pg_temp.assert_ok((select genres=array['Jazz'] from public.gig_requests where id='59000000-0000-4000-8000-000000000040'), 'legacy genre lost');
update public.gig_requests set genres=array['Blues','Rock / Pop','Blues'] where id='59000000-0000-4000-8000-000000000040';
select pg_temp.assert_ok((select genres=array['Blues','Rock / Pop'] and genre='Blues' from public.gig_requests where id='59000000-0000-4000-8000-000000000040'), 'genres not normalized');
select pg_temp.assert_ok((private.gig_profile_match('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002')->'common_genres') ? 'Rock / Pop', 'secondary genre ignored');
do $$ begin
 begin update public.gig_requests set genres='{}' where id='59000000-0000-4000-8000-000000000040'; raise exception 'empty genres accepted'; exception when invalid_parameter_value then null; end;
 begin update public.gig_requests set genres=array[' '] where id='59000000-0000-4000-8000-000000000040'; raise exception 'blank genre accepted'; exception when invalid_parameter_value then null; end;
end $$;
set local role authenticated;
select public.update_gig_request('59000000-0000-4000-8000-000000000040',
 '{"title":"Multi genre","date":"2030-01-01T20:00:00Z","genre":"Funk","genres":["Funk","Blues"],"wanted_instruments":["Basse","Batterie"]}', '{}');
select pg_temp.assert_ok((select genres=array['Funk','Blues'] from public.gig_requests where id='59000000-0000-4000-8000-000000000040'), 'multi genre edit lost');
reset role;
-- Event creation without an exact address still stores public structured locality on every occurrence.
set local role authenticated;
select public.save_group_events_with_locations('59000000-0000-4000-8000-000000000050',
 '[{"id":"59000000-0000-4000-8000-000000000061","title":"Concert","kind":"Concert","date":"2030-02-01T20:00:00Z","public_location_label":"Studio · 1201 Genève · CH","postal_code":"1201","city":"Genève","country_code":"CH","series_id":"59000000-0000-4000-8000-000000000080"},
   {"id":"59000000-0000-4000-8000-000000000062","title":"Concert","kind":"Concert","date":"2030-02-08T20:00:00Z","public_location_label":"Studio · 1201 Genève · CH","postal_code":"1201","city":"Genève","country_code":"CH","series_id":"59000000-0000-4000-8000-000000000080"}]', 'create');
select pg_temp.assert_ok((select count(*)=2 from public.group_events where series_id='59000000-0000-4000-8000-000000000080' and postal_code='1201' and city='Genève' and country_code='CH'), 'recurring locality not persisted');
select public.save_group_events_with_locations('59000000-0000-4000-8000-000000000050',
 '[{"id":"59000000-0000-4000-8000-000000000061","title":"Edited","kind":"Concert","date":"2030-02-02T20:00:00Z","public_location_label":"Studio · 1201 Genève · CH","postal_code":"1201","city":"Genève","country_code":"CH"}]', 'update');
select pg_temp.assert_ok((select postal_code='1201' from public.group_events where id='59000000-0000-4000-8000-000000000061'), 'postal code lost on edit');
do $$ begin
 begin perform public.save_group_events_with_locations('59000000-0000-4000-8000-000000000050', '[{"id":"59000000-0000-4000-8000-000000000063","title":"Invalid","kind":"Concert","date":"2030-02-01T20:00:00Z","public_location_label":"Studio","city":"Genève","country_code":"CH"}]','create'); raise exception 'missing postal accepted'; exception when invalid_parameter_value then null; end;
 begin insert into public.group_events(group_id,title,kind,date) values ('59000000-0000-4000-8000-000000000050','Bypass','Concert','2030-02-01'); raise exception 'raw insert bypassed postal guard'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Construct a pre-migration fixture; the validation stays enabled for all actual operations.
alter table public.group_events disable trigger group_event_locality_valid;
insert into public.group_events(id,group_id,kind,title,venue,public_location_label,date) values ('59000000-0000-4000-8000-000000000064','59000000-0000-4000-8000-000000000050','Concert','Legacy','Old venue','Old venue','2030-01-01');
alter table public.group_events enable trigger group_event_locality_valid;
set local role authenticated;
select public.save_group_events_with_locations('59000000-0000-4000-8000-000000000050', '[{"id":"59000000-0000-4000-8000-000000000064","title":"Legacy edited","kind":"Jam","date":"2030-02-01T20:00:00Z","public_location_label":"Old venue","reminder_lead_days":1}]','update');
select pg_temp.assert_ok((select postal_code is null and venue='Old venue' and title='Legacy edited' from public.group_events where id='59000000-0000-4000-8000-000000000064'), 'legacy unrelated edit blocked or fabricated postal');
do $$ begin
 begin perform public.set_group_event_location('59000000-0000-4000-8000-000000000064','New venue'); raise exception 'legacy changed location without postal accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select 'overlap, genres and event locality assertions passed' as result;
rollback;
