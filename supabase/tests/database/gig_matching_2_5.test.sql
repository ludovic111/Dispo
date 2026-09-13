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

set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);

-- Hôte : candidats triés par score, exclusions, score et raisons de la bassiste.
do $$
declare rows jsonb; m jsonb;
begin
  select coalesce(jsonb_agg(c),'[]') into rows from public.gig_candidates('59000000-0000-4000-8000-000000000040') c;
  if jsonb_array_length(rows) <> 2 then raise exception 'expected 2 candidates, got %', rows; end if;
  if rows->0->'profile'->>'id' <> '59000000-0000-4000-8000-000000000002' then raise exception 'best candidate not first: %', rows; end if;
  if rows->1->'profile'->>'id' <> '59000000-0000-4000-8000-000000000003' then raise exception 'level mismatch candidate missing: %', rows; end if;
  m := rows->0->'match';
  if (m->>'score')::int < 90 then raise exception 'score too low: %', m; end if;
  if not (m->>'level_ok')::boolean or not (m->>'available_on_date')::boolean or not (m->>'time_slot_ok')::boolean then raise exception 'flags wrong: %', m; end if;
  if (m->>'away')::boolean then raise exception 'unexpected away: %', m; end if;
  if not (m->>'school_ok')::boolean or m->'schools' <> '["QMS"]'::jsonb then raise exception 'school wrong: %', m; end if;
  if m->'common_genres' <> '["Jazz"]'::jsonb then raise exception 'genres wrong: %', m; end if;
  if (m->'common_songs'->>'count')::int <> 1 or m->'common_songs'->'titles' <> '["blue  bossa"]'::jsonb then raise exception 'songs wrong: %', m; end if;
  if (m->>'distance_km')::int > 10 then raise exception 'distance wrong: %', m; end if;
  if m->>'relation' <> 'mutual' then raise exception 'relation wrong: %', m; end if;
  if not (m->'reasons' @> '["instrument:Basse","level","available","time_slot","school","genres:Jazz","songs:1","near","friend"]'::jsonb) then raise exception 'reasons wrong: %', m; end if;
  m := rows->1->'match';
  if (m->>'level_ok')::boolean then raise exception 'beginner should fail level: %', m; end if;
  if not (m->>'away')::boolean or m->>'away_in' <> 'Lisbonne' then raise exception 'away not flagged: %', m; end if;
  if (m->>'score')::int >= (rows->0->'match'->>'score')::int then raise exception 'ordering wrong'; end if;
  if public.gig_candidate_count('59000000-0000-4000-8000-000000000040') <> 1 then raise exception 'candidate count should honour level'; end if;
  begin
    insert into public.gig_applications(gig_id,musician_id,instrument) values ('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000001','Basse');
    raise exception 'host applied to own gig';
  exception when others then if sqlerrm <> 'cannot_apply_own_gig' then raise; end if;
  end;
end;
$$;

-- Un tiers ne voit pas les candidats.
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
do $$
begin
  begin
    perform public.gig_candidates('59000000-0000-4000-8000-000000000040');
    raise exception 'non-host listed candidates';
  exception when others then if sqlerrm <> 'only_gig_host' then raise; end if;
  end;
end;
$$;

-- Garde à la candidature : niveau, instrument non joué, poste non ouvert.
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
do $$
begin
  begin
    insert into public.gig_applications(gig_id,musician_id,instrument) values ('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000003','Basse');
    raise exception 'level mismatch accepted';
  exception when others then if sqlerrm <> 'level_not_wanted' then raise; end if;
  end;
end;
$$;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000005',true);
do $$
begin
  begin
    insert into public.gig_applications(gig_id,musician_id,instrument) values ('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000005','Basse');
    raise exception 'unplayed instrument accepted';
  exception when others then if sqlerrm <> 'instrument_not_played' then raise; end if;
  end;
  begin
    insert into public.gig_applications(gig_id,musician_id,instrument) values ('59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000005','Piano');
    raise exception 'unwanted instrument accepted';
  exception when others then if sqlerrm <> 'instrument_not_open' then raise; end if;
  end;
end;
$$;

-- my_gig_matches : visible pour 2 et 3 (instrument ouvert), pas pour 4 (bloqué) ni 5.
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
do $$
declare rows jsonb;
begin
  select coalesce(jsonb_agg(r),'[]') into rows from public.my_gig_matches() r where (r->'gig'->>'id') like '59000000-%';
  if jsonb_array_length(rows) <> 1 or rows->0->'gig'->>'id' <> '59000000-0000-4000-8000-000000000040' then raise exception 'viewer match missing: %', rows; end if;
  if (rows->0->'match'->>'score')::int < 90 then raise exception 'viewer score wrong: %', rows; end if;
  if rows->0->'match'->>'relation' <> 'mutual' then raise exception 'viewer relation wrong'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
do $$
declare rows jsonb;
begin
  select coalesce(jsonb_agg(r),'[]') into rows from public.my_gig_matches() r where (r->'gig'->>'id') like '59000000-%';
  if jsonb_array_length(rows) <> 1 or (rows->0->'match'->>'level_ok')::boolean then raise exception 'beginner view wrong: %', rows; end if;
  -- Le répertoire de l'hôte n'est pas comparé sans répertoire public côté candidat : aucun titre exposé.
  if (rows->0->'match'->'common_songs'->>'count')::int <> 0 then raise exception 'private repertoire leaked'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000004',true);
do $$
begin
  if exists (select 1 from public.my_gig_matches() r where (r->'gig'->>'id') like '59000000-%') then raise exception 'blocked viewer sees gig'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000005',true);
do $$
begin
  if exists (select 1 from public.my_gig_matches() r where (r->'gig'->>'id') like '59000000-%') then raise exception 'pianist matched a bass gig'; end if;
end;
$$;

-- Candidature valide, puis contact unique par l'hôte.
reset role;
update public.profiles set moderation_status = 'banned'
where id = '59000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists (select 1 from public.gig_candidates('59000000-0000-4000-8000-000000000040') c
    where c->'profile'->>'id' = '59000000-0000-4000-8000-000000000002') then
    raise exception 'Banned profile returned as SOS candidate';
  end if;
  if public.gig_candidate_count('59000000-0000-4000-8000-000000000040') <> 0 then
    raise exception 'Banned profile counted as SOS candidate';
  end if;
end $$;
reset role;
update public.profiles set moderation_status = 'active'
where id = '59000000-0000-4000-8000-000000000002';
set local role authenticated;

select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
insert into public.gig_applications(id,gig_id,musician_id,instrument,message)
values ('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000040','59000000-0000-4000-8000-000000000002','Basse','Je suis chaude');
do $$
begin
  begin
    perform public.contact_gig_applicant('59000000-0000-4000-8000-000000000041','Salut');
    raise exception 'applicant contacted herself';
  exception when others then if sqlerrm <> 'only_gig_host' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
do $$
declare rows jsonb; conv uuid; conv2 uuid;
begin
  if exists (select 1 from public.gig_candidates('59000000-0000-4000-8000-000000000040') c where c->'profile'->>'id'='59000000-0000-4000-8000-000000000002') then raise exception 'applicant still a candidate'; end if;
  select coalesce(jsonb_agg(a),'[]') into rows from public.gig_applicants('59000000-0000-4000-8000-000000000040') a;
  if jsonb_array_length(rows) <> 1 then raise exception 'applicants wrong: %', rows; end if;
  if rows->0->'application'->>'status' <> 'pending' or rows->0->'application'->'host_contacted_at' <> 'null'::jsonb then raise exception 'applicant state wrong: %', rows; end if;
  if (rows->0->'match'->>'score')::int < 90 or rows->0->'profile'->>'name' <> 'QA Match 2' then raise exception 'applicant match wrong: %', rows; end if;

  begin
    perform public.contact_gig_applicant('59000000-0000-4000-8000-000000000041','');
    raise exception 'empty message accepted';
  exception when others then if sqlerrm <> 'message_invalid' then raise; end if;
  end;
  conv := public.contact_gig_applicant('59000000-0000-4000-8000-000000000041','Salut, tu es dispo jeudi ?');
  if conv is null then raise exception 'no conversation'; end if;
  if not exists (select 1 from public.conversations c where c.id=conv and c.participant_a<c.participant_b
    and '59000000-0000-4000-8000-000000000001' in (c.participant_a,c.participant_b) and '59000000-0000-4000-8000-000000000002' in (c.participant_a,c.participant_b)) then raise exception 'conversation wrong'; end if;
  if not exists (select 1 from public.messages m where m.conversation_id=conv and m.sender_id='59000000-0000-4000-8000-000000000001'
    and m.text like 'À propos de ton SOS « Trio du jeudi » (%) : Salut, tu es dispo jeudi ?') then raise exception 'first message wrong'; end if;
  if (select host_contacted_at is null from public.gig_applications where id='59000000-0000-4000-8000-000000000041') then raise exception 'contact not recorded'; end if;
  begin
    conv2 := public.contact_gig_applicant('59000000-0000-4000-8000-000000000041','Encore');
    raise exception 'second contact accepted';
  exception when others then if sqlerrm <> 'already_contacted' then raise; end if;
  end;
  if (select count(*) from public.messages m where m.conversation_id=conv) <> 1 then raise exception 'duplicate message'; end if;
  select coalesce(jsonb_agg(a),'[]') into rows from public.gig_applicants('59000000-0000-4000-8000-000000000040') a;
  if rows->0->'application'->'host_contacted_at' = 'null'::jsonb then raise exception 'host_contacted_at not exposed'; end if;

  -- Demande directe : pas de doublon, pas vers soi-même.
  insert into public.gig_requests(host_id,title,date,genre,wanted_instruments,place,neighborhood,public_location_label,target_id,target_status)
  values ('59000000-0000-4000-8000-000000000001','Dépannage — Basse',now()+interval '9 days','Jazz',array['Basse'],'Genève','1201 Genève','Genève','59000000-0000-4000-8000-000000000002','pending');
  begin
    insert into public.gig_requests(host_id,title,date,genre,wanted_instruments,place,neighborhood,public_location_label,target_id,target_status)
    values ('59000000-0000-4000-8000-000000000001','Dépannage bis',now()+interval '10 days','Jazz',array['Basse'],'Genève','1201 Genève','Genève','59000000-0000-4000-8000-000000000002','pending');
    raise exception 'duplicate direct request accepted';
  exception when others then if sqlerrm <> 'direct_request_pending' then raise; end if;
  end;
  begin
    insert into public.gig_requests(host_id,title,date,genre,wanted_instruments,place,neighborhood,public_location_label,target_id,target_status)
    values ('59000000-0000-4000-8000-000000000001','Auto',now()+interval '10 days','Jazz',array['Piano'],'Genève','1201 Genève','Genève','59000000-0000-4000-8000-000000000001','pending');
    raise exception 'self-targeted request accepted';
  exception when others then if sqlerrm <> 'cannot_target_self' then raise; end if;
  end;
  -- Une autre personne reste possible.
  insert into public.gig_requests(host_id,title,date,genre,wanted_instruments,place,neighborhood,public_location_label,target_id,target_status)
  values ('59000000-0000-4000-8000-000000000001','Dépannage — Basse 3',now()+interval '9 days','Jazz',array['Basse'],'Genève','1201 Genève','Genève','59000000-0000-4000-8000-000000000003','pending');

  -- Retrait du SOS : la candidate est prévenue, les anciennes notifications partent.
  delete from public.gig_requests where id='59000000-0000-4000-8000-000000000040';
  if exists (select 1 from public.gig_applications where gig_id='59000000-0000-4000-8000-000000000040') then raise exception 'applications survived delete'; end if;
end;
$$;

-- Vérifications hors RLS après le retrait.
reset role;
do $$
begin
  if not exists (select 1 from public.push_notifications n where n.user_id='59000000-0000-4000-8000-000000000002' and n.source_table='gig_requests_removed'
    and n.source_id='59000000-0000-4000-8000-000000000040' and n.category='sos' and n.body like '%Trio du jeudi%') then raise exception 'applicant not notified of removal'; end if;
  if exists (select 1 from public.push_notifications n where n.source_table='gig_requests' and n.source_id='59000000-0000-4000-8000-000000000040') then raise exception 'stale gig notifications kept'; end if;
end;
$$;

rollback;
