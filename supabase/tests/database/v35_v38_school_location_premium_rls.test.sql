-- Tests transactionnels v35-v40. A executer uniquement sur la base locale :
--   docker exec -i supabase_db_dispo \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/database/v35_v38_school_location_premium_rls.test.sql
-- Ce fichier utilise des assertions SQL et non le format pgTAP de
-- `supabase test db`.
-- Toutes les donnees et tous les changements de role sont annules a la fin.

begin;

-- Trois comptes isoles du seed. Le trigger auth cree leurs profils.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'school-a@local.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Test A"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated', 'authenticated', 'school-b@local.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Test B"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000c3',
    'authenticated', 'authenticated', 'school-c@local.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{"name":"Test C"}',
    now(), now(), '', '', '', ''
  );

update public.profiles
set instruments = array['Piano']::text[], available_dates = array[current_date + 1]
where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000c3'
);

-- Ecoles supplementaires pour exercer la limite de cinq affiliations.
insert into public.music_schools(slug, name, short_name, city, country_code)
values
  ('test-school-1', 'Test School 1', 'TS1', 'Geneve', 'CH'),
  ('test-school-2', 'Test School 2', 'TS2', 'Geneve', 'CH'),
  ('test-school-3', 'Test School 3', 'TS3', 'Geneve', 'CH');

-- Meme une ecriture serveur sans JWT ne peut laisser une adresse exacte dans
-- la ligne publique : le trigger la deplace avant que Realtime ne la voie.
insert into public.gig_requests(
  id, host_id, title, date, place, neighborhood, genre,
  wanted_instruments, description
) values (
  '20000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-0000000000a1',
  'Import serveur prive', now() + interval '10 days',
  'Adresse serveur secrete 99', 'Centre', 'Jazz', array['Piano'], ''
);
do $$
begin
  if not exists (
    select 1 from public.gig_requests g
    join private.gig_request_locations l on l.gig_id = g.id
    where g.id = '20000000-0000-4000-8000-000000000099'
      and g.place = 'Centre'
      and g.public_location_label = 'Centre'
      and l.exact_address = 'Adresse serveur secrete 99'
  ) then
    raise exception 'Server write leaked or lost the exact SOS address';
  end if;
end;
$$;

set local role authenticated;

-- A : deux ecoles, dont une affiliation visible sur le profil.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'amr-geneve'),
  'student', 'school_only', null
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'hem-geneve'),
  'student', 'profile', null
);

-- Un libelle de role fait partie de la verification : le modifier retire le
-- badge institutionnel jusqu'a une nouvelle validation par Dispo.
set local role postgres;
update public.music_school_memberships
set verification_level = 'verified'
where profile_id = '00000000-0000-4000-8000-0000000000a1'
  and school_id = (select id from public.music_schools where slug = 'amr-geneve');
set local role authenticated;
select public.join_music_school(
  (select id from public.music_schools where slug = 'amr-geneve'),
  'student', 'school_only', 'Cursus jazz'
);
do $$
begin
  if not exists (
    select 1 from public.my_music_schools()
    where slug = 'amr-geneve'
      and role_label = 'Cursus jazz'
      and verification_level = 'self_declared'
  ) then
    raise exception 'Changed verified role label kept its verified badge';
  end if;
end;
$$;

-- B partage AMR ; C appartient uniquement a EPI.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'amr-geneve'),
  'teacher', 'school_only', null
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'epi-geneve'),
  'student', 'school_only', null
);

do $$
begin
  if exists (
    select 1 from public.visible_profile_music_schools()
    where profile_id = '00000000-0000-4000-8000-0000000000a1'
      and slug = 'amr-geneve'
  ) then
    raise exception 'C must not see A school_only affiliation outside AMR';
  end if;
  if not exists (
    select 1 from public.visible_profile_music_schools()
    where profile_id = '00000000-0000-4000-8000-0000000000a1'
      and slug = 'hem-geneve'
  ) then
    raise exception 'C must see A profile-visible HEM affiliation';
  end if;
end;
$$;

-- A envoie dans AMR ; B le voit, C ne peut ni le lire ni y ecrire.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.send_school_message(
  (
    select c.id from public.school_channels c
    join public.music_schools s on s.id = c.school_id
    where s.slug = 'amr-geneve'
  ),
  'Message transactionnel'
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  if (select count(*) from public.school_messages) <> 1 then
    raise exception 'B must see the AMR message';
  end if;
end;
$$;

insert into public.reports(
  reporter_id, reported_id, school_message_id, reason
)
select
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000a1',
  sm.id,
  'Message ecole test'
from public.school_messages sm
limit 1;
do $$
begin
  if not exists (
    select 1 from public.reports
    where reporter_id = '00000000-0000-4000-8000-0000000000b2'
      and message_snapshot->>'kind' = 'school_message'
      and message_snapshot->>'text' = 'Message transactionnel'
  ) then
    raise exception 'School message report did not retain a validated snapshot';
  end if;
end;
$$;

-- Le lien d'ecole ne doit pas reintroduire un profil masque par un blocage.
insert into public.blocks(blocker_id, blocked_id)
values (
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000a1'
);
do $$
begin
  if exists (
    select 1
    from public.music_school_members(
      (select id from public.music_schools where slug = 'amr-geneve')
    )
    where profile_id = '00000000-0000-4000-8000-0000000000a1'
  ) then
    raise exception 'Blocked A unexpectedly appears in B school member list';
  end if;
  if exists (
    select 1 from public.profile_music_schools(
      '00000000-0000-4000-8000-0000000000a1'
    )
  ) or exists (
    select 1 from public.visible_profile_music_schools()
    where profile_id = '00000000-0000-4000-8000-0000000000a1'
  ) or exists (
    select 1 from public.music_school_memberships
    where profile_id = '00000000-0000-4000-8000-0000000000a1'
  ) then
    raise exception 'Blocked A affiliation leaked through another school path';
  end if;
end;
$$;
delete from public.blocks
where blocker_id = '00000000-0000-4000-8000-0000000000b2'
  and blocked_id = '00000000-0000-4000-8000-0000000000a1';

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
do $$
declare
  v_amr_channel uuid := (
    select c.id from public.school_channels c
    join public.music_schools s on s.id = c.school_id
    where s.slug = 'amr-geneve'
  );
begin
  if (select count(*) from public.school_messages) <> 0 then
    raise exception 'C must not read AMR messages';
  end if;
  begin
    perform public.send_school_message(v_amr_channel, 'Interdit');
    raise exception 'C unexpectedly wrote to AMR';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- Quitter retire immediatement l'acces au canal.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  if not public.leave_music_school(
    (select id from public.music_schools where slug = 'amr-geneve')
  ) then
    raise exception 'B should have left AMR';
  end if;
  if (select count(*) from public.school_messages) <> 0 then
    raise exception 'B kept school message access after leaving';
  end if;
end;
$$;

-- Cinq affiliations actives maximum, y compris sous concurrence seriee par
-- l'advisory lock de join_music_school.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'epi-geneve'),
  'student', 'private', null
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'test-school-1'),
  'student', 'private', null
);
select public.join_music_school(
  (select id from public.music_schools where slug = 'test-school-2'),
  'student', 'private', null
);
do $$
begin
  begin
    perform public.join_music_school(
      (select id from public.music_schools where slug = 'test-school-3'),
      'student', 'private', null
    );
    raise exception 'Sixth school unexpectedly accepted';
  exception
    when check_violation then
      if sqlerrm <> 'school_membership_limit_reached' then raise; end if;
  end;
end;
$$;

-- Le premier groupe dirige est gratuit, le deuxieme exige Premium.
insert into public.music_groups(id, name, leader_id)
values (
  '10000000-0000-4000-8000-000000000001',
  'Premier groupe gratuit',
  '00000000-0000-4000-8000-0000000000a1'
);
do $$
begin
  begin
    insert into public.music_groups(id, name, leader_id)
    values (
      '10000000-0000-4000-8000-000000000002',
      'Deuxieme groupe bloque',
      '00000000-0000-4000-8000-0000000000a1'
    );
    raise exception 'Second non-Premium group unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_additional_group' then raise; end if;
  end;
end;
$$;

-- Auto-SOS est Premium cote serveur. Une valeur existante reste cependant
-- desactivable apres expiration pour ne jamais enfermer le leader.
do $$
begin
  begin
    update public.music_groups
    set auto_sos_enabled = true, auto_sos_min_level = null
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Non-Premium auto-SOS unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_auto_sos' then raise; end if;
  end;
end;
$$;
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
update public.music_groups
set auto_sos_enabled = true, auto_sos_min_level = null
where id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
update public.music_groups
set auto_sos_enabled = false
where id = '10000000-0000-4000-8000-000000000001';

-- Adresse SOS : l'hote la definit, un random ne la voit pas, puis le
-- candidat accepte la voit. La ligne publique ne contient que Plainpalais.
insert into public.gig_requests(
  id, host_id, title, date, place, public_location_label, neighborhood,
  genre, wanted_instruments, description
) values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000a1',
  'SOS test adresse', now() + interval '1 day',
  'Plainpalais', 'Plainpalais', 'Plainpalais', 'Jazz', array['Piano'], ''
);
select public.set_gig_request_location(
  '20000000-0000-4000-8000-000000000001',
  'Plainpalais', 'Rue secrete 42', '1205', 'Geneve', 'CH', null, null
);

do $$
begin
  if (
    select place <> 'Plainpalais' or public_location_label <> 'Plainpalais'
    from public.gig_requests
    where id = '20000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Exact SOS address leaked into the public row';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  if exists (
    select 1 from public.get_gig_request_location(
      '20000000-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Unaccepted B unexpectedly saw exact SOS location';
  end if;
end;
$$;

insert into public.gig_applications(
  id, gig_id, musician_id, instrument, status
) values (
  '21000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b2', 'Piano', 'pending'
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.accept_gig_application('21000000-0000-4000-8000-000000000001');

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  if not exists (
    select 1 from public.get_gig_request_location(
      '20000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Rue secrete 42'
  ) then
    raise exception 'Accepted B cannot see exact SOS location';
  end if;
end;
$$;

-- Adresse evenement : seule la presence available ouvre le reveal.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Répétition', 'Evenement adresse test', 'Carouge', 'Carouge',
  now() + interval '2 days'
);
insert into public.gig_requests(
  id, host_id, title, date, place, public_location_label, neighborhood,
  genre, wanted_instruments, description, group_id, event_id
) values (
  '20000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-0000000000a1',
  'SOS lie a evenement', now() + interval '9 days',
  'Carouge', 'Carouge', 'Carouge', 'Jazz', array['Piano'], '',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000001',
  'Carouge centre', 'Route ultra secrete 7', '1227', 'Carouge', 'CH', null, null
);

-- Creer/synchroniser un SOS lie sans renvoyer l'adresse exacte ne doit ni
-- effacer l'adresse canonique de l'evenement ni remplacer son libelle public.
select public.set_gig_request_location(
  '20000000-0000-4000-8000-000000000002',
  'Ancien libelle du client', null, null, null, 'CH', null, null
);
do $$
begin
  if not exists (
    select 1 from public.gig_requests
    where id = '20000000-0000-4000-8000-000000000002'
      and place = 'Carouge centre'
      and public_location_label = 'Carouge centre'
  ) then
    raise exception 'Linked SOS public location columns diverged';
  end if;
  if not exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'Linked SOS synchronization erased canonical event address';
  end if;
end;
$$;

-- NULL n'est plus un DELETE : une sauvegarde dont le chargement prive a
-- echoue peut changer le libelle public sans perdre l'adresse existante.
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000001',
  'Carouge preserve', null, null, null, 'CH', null, null, false
);
do $$
begin
  if not exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'NULL event address unexpectedly deleted stored location';
  end if;
end;
$$;

-- Creation publique + adresse privee dans une seule RPC transactionnelle.
select public.save_group_events_with_locations(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'id', '30000000-0000-4000-8000-000000000004',
    'kind', 'Répétition',
    'title', 'Creation atomique',
    'public_location_label', 'Jonction',
    'date', to_jsonb(now() + interval '5 days'),
    'setlist', '[]'::jsonb,
    'exact_address', 'Adresse atomique 4',
    'clear_exact_address', false,
    'country_code', 'CH'
  )),
  'create'
);
do $$
begin
  if not exists (
    select 1 from public.group_events e
    cross join lateral public.get_group_event_location(e.id) l
    where e.id = '30000000-0000-4000-8000-000000000004'
      and e.venue = 'Jonction'
      and e.public_location_label = 'Jonction'
      and l.exact_address = 'Adresse atomique 4'
  ) then
    raise exception 'Atomic event creation split public and private state';
  end if;
end;
$$;

-- Si une ligne du batch est invalide, les precedentes sont rollbackees.
do $$
begin
  begin
    perform public.save_group_events_with_locations(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'id', '30000000-0000-4000-8000-000000000001',
          'kind', 'Répétition', 'title', 'Titre a rollback',
          'public_location_label', 'Rollback',
          'date', to_jsonb(now() + interval '2 days'),
          'exact_address', null, 'clear_exact_address', false
        ),
        jsonb_build_object(
          'id', '30000000-0000-4000-8000-000000000099',
          'kind', 'Répétition', 'title', 'Absent',
          'public_location_label', 'Absent',
          'date', to_jsonb(now() + interval '2 days'),
          'exact_address', null, 'clear_exact_address', false
        )
      ),
      'update'
    );
    raise exception 'Invalid atomic event batch unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;
  if exists (
    select 1 from public.group_events
    where id = '30000000-0000-4000-8000-000000000001'
      and title = 'Titre a rollback'
  ) then
    raise exception 'Failed event batch left a partial public update';
  end if;
  if not exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'Failed event batch changed private location';
  end if;
end;
$$;

-- L'effacement ne se produit qu'avec le booleen explicite, puis on restaure
-- l'adresse pour les assertions de reveal ci-dessous.
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000001',
  'Carouge preserve', null, null, null, 'CH', null, null, true
);
do $$
begin
  if exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address is not null
  ) then
    raise exception 'Explicit event address clear did not delete private row';
  end if;
end;
$$;
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000001',
  'Carouge centre', 'Route ultra secrete 7', '1227', 'Carouge', 'CH',
  null, null, false
);

-- Une occurrence unique est passee ci-dessus ; une serie non-Premium est
-- refusee cote serveur, meme si un client contourne le paywall Swift.
do $$
begin
  begin
    insert into public.group_events(
      id, group_id, kind, title, venue, public_location_label, date,
      reminder_lead_days
    ) values (
      '30000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      'Répétition', 'Rappel interdit', 'Carouge', 'Carouge',
      now() + interval '4 days', 7
    );
    raise exception 'Non-Premium configurable reminder unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_configurable_reminders' then raise; end if;
  end;
  begin
    insert into public.group_events(
      id, group_id, kind, title, venue, public_location_label, date, series_id
    ) values (
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'Répétition', 'Serie interdite', 'Carouge', 'Carouge',
      now() + interval '3 days',
      '31000000-0000-4000-8000-000000000001'
    );
    raise exception 'Non-Premium recurring event unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_recurring_events' then raise; end if;
  end;
end;
$$;

insert into public.group_members(group_id, profile_id, kind)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b2', 'occasional'
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  if exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'Group membership alone unexpectedly revealed location';
  end if;
end;
$$;

-- Un non-membre ne peut pas fabriquer sa presence via la RLS. Meme si une
-- ancienne ligne corrompue existe (simulee en postgres), la fonction de
-- reveal exige encore l'appartenance et refuse les deux chemins event/SOS.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
do $$
begin
  begin
    insert into public.event_attendance(event_id, profile_id, status)
    values (
      '30000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3', 'available'
    );
    raise exception 'Non-member attendance unexpectedly accepted';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

set local role postgres;
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000c3', 'available'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
do $$
begin
  if exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    )
  ) or exists (
    select 1 from public.get_gig_request_location(
      '20000000-0000-4000-8000-000000000002'
    )
  ) then
    raise exception 'Legacy non-member attendance revealed a private address';
  end if;
end;
$$;
set local role postgres;
delete from public.event_attendance
where event_id = '30000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000c3';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);

insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b2', 'available'
);

do $$
begin
  if not exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'Available B cannot see exact event location';
  end if;
end;
$$;

-- Un client ne peut pas combiner is_premium=true et six videos dans le meme
-- PATCH : la limite relit l'ancien droit persiste, pas NEW controle par lui.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
begin
  begin
    update public.profiles
    set is_premium = true,
        demo_videos = jsonb_build_array(
          jsonb_build_object('remoteURL', '1'),
          jsonb_build_object('remoteURL', '2'),
          jsonb_build_object('remoteURL', '3'),
          jsonb_build_object('remoteURL', '4'),
          jsonb_build_object('remoteURL', '5'),
          jsonb_build_object('remoteURL', '6')
        )
    where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'Combined Premium/video bypass unexpectedly accepted';
  exception
    when others then
      if sqlerrm not like '%demo_video_limit%' then raise; end if;
  end;
  if (select is_premium from public.profiles
      where id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'Client managed to persist its Premium flag';
  end if;
end;
$$;

-- La policy Storage appelle ce garde-fou : chemin tiers, objet trop lourd et
-- type inconnu ferment; une video conforme dans son dossier reste possible.
do $$
begin
  if private.can_upload_demo_media(
    '00000000-0000-4000-8000-0000000000b2/foreign.mp4',
    '{"size":"1024"}'::jsonb
  ) then
    raise exception 'Cross-account demo media path unexpectedly accepted';
  end if;
  if private.can_upload_demo_media(
    '00000000-0000-4000-8000-0000000000a1/huge.mp4',
    '{"size":"52428801"}'::jsonb
  ) then
    raise exception 'Oversized demo video unexpectedly accepted';
  end if;
  if not private.can_upload_demo_media(
    '00000000-0000-4000-8000-0000000000a1/valid.mp4',
    '{"size":"1048576"}'::jsonb
  ) then
    raise exception 'Valid first demo video unexpectedly rejected';
  end if;
end;
$$;

-- Aucun utilisateur authentifie n'attend 30 minutes pour voir un SOS : la
-- liquidite du reseau n'est plus un avantage Premium.
do $$
begin
  if not public.can_see_full_gig((
    select g from public.gig_requests g
    where g.id = '20000000-0000-4000-8000-000000000002'
  )) then
    raise exception 'Authenticated free member still sees a locked SOS';
  end if;
end;
$$;

-- Auto-SOS : la base verifie leader, Premium, presence et instrument, puis
-- deduplique deux appareils/retries sur (event, membre absent).
set local role postgres;
update public.profiles
set is_premium = true
where id = '00000000-0000-4000-8000-0000000000a1';
update public.event_attendance
set status = 'unavailable'
where event_id = '30000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
update public.music_groups
set auto_sos_enabled = true, auto_sos_min_level = 'same'
where id = '10000000-0000-4000-8000-000000000001';
do $$
declare
  v_first uuid;
  v_second uuid;
  v_created boolean;
begin
  select gig_id, created into v_first, v_created
  from public.create_auto_sos(
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2',
    'Remplacement transactionnel', 'Test auto-SOS', 'Piano'
  );
  if not v_created then
    raise exception 'First auto-SOS call did not create a row';
  end if;

  select gig_id, created into v_second, v_created
  from public.create_auto_sos(
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2',
    'Remplacement retry', 'Retry auto-SOS', 'Piano'
  );
  if v_created or v_second is distinct from v_first then
    raise exception 'Auto-SOS retry was not idempotent';
  end if;
  if (select count(*) from public.gig_requests
      where event_id = '30000000-0000-4000-8000-000000000001'
        and auto_sos_absent_profile_id =
          '00000000-0000-4000-8000-0000000000b2') <> 1 then
    raise exception 'Auto-SOS unique dropout invariant failed';
  end if;
  if not exists (
    select 1 from public.get_gig_request_location(v_first)
    where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'Auto-SOS did not copy the private event address';
  end if;
end;
$$;

-- Un PATCH direct ne peut contourner ni l'appartenance ni le quota Premium.
-- La seule voie client reste la RPC atomique, qui accepte ensuite B, membre
-- valide ne dirigeant encore aucun autre groupe.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
begin
  begin
    update public.music_groups
    set leader_id = '00000000-0000-4000-8000-0000000000c3'
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Direct leadership update unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'direct_leadership_update_forbidden' then raise; end if;
  end;
end;
$$;
do $$
begin
  begin
    perform public.transfer_group_leadership(
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3'
    );
    raise exception 'Leadership transfer to a non-member unexpectedly accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'new_leader_must_be_group_member' then raise; end if;
  end;
end;
$$;

-- Meme devenu membre, C ne peut pas recevoir un deuxieme groupe sans Premium.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
insert into public.music_groups(id, name, leader_id)
values (
  '10000000-0000-4000-8000-000000000003',
  'Groupe gratuit de C',
  '00000000-0000-4000-8000-0000000000c3'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_members(group_id, profile_id, kind)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000c3', 'permanent'
);
do $$
begin
  begin
    perform public.transfer_group_leadership(
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000c3'
    );
    raise exception 'Non-Premium target received an additional led group';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_additional_group' then raise; end if;
  end;
end;
$$;
select public.transfer_group_leadership(
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000b2'
);
do $$
begin
  if not exists (
    select 1 from public.music_groups
    where id = '10000000-0000-4000-8000-000000000001'
      and leader_id = '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Group leadership transfer did not persist';
  end if;
end;
$$;

-- Une revocation canonique ancienne ne peut plus gagner une course contre un
-- octroi recent. Une revocation plus recente reste bien applicable.
set local role service_role;
do $$
declare
  v_applied boolean;
begin
  select public.apply_revenuecat_premium_state(
    '00000000-0000-4000-8000-0000000000c3', true,
    '2026-08-27T15:00:00Z'::timestamptz
  ) into v_applied;
  if not v_applied then
    raise exception 'Initial canonical Premium grant was not applied';
  end if;

  select public.apply_revenuecat_premium_state(
    '00000000-0000-4000-8000-0000000000c3', false,
    '2026-08-27T14:59:59Z'::timestamptz
  ) into v_applied;
  if v_applied then
    raise exception 'Stale canonical revocation unexpectedly applied';
  end if;
end;
$$;
set local role postgres;
do $$
begin
  if not (select is_premium from public.profiles
          where id = '00000000-0000-4000-8000-0000000000c3') then
    raise exception 'Stale revocation erased a newer Premium grant';
  end if;
end;
$$;
set local role service_role;
do $$
declare
  v_applied boolean;
begin
  select public.apply_revenuecat_premium_state(
    '00000000-0000-4000-8000-0000000000c3', false,
    '2026-08-27T15:00:01Z'::timestamptz
  ) into v_applied;
  if not v_applied then
    raise exception 'Newer canonical revocation was not applied';
  end if;
end;
$$;
set local role postgres;
do $$
begin
  if (select is_premium from public.profiles
      where id = '00000000-0000-4000-8000-0000000000c3') then
    raise exception 'Newer canonical revocation did not close Premium';
  end if;
end;
$$;

-- Le schema private reste inaccessible meme a un participant autorise :
-- seules les RPC publiques font la projection conditionnelle.
do $$
begin
  if has_table_privilege(
    'authenticated', 'private.gig_request_locations', 'select'
  ) or has_table_privilege(
    'authenticated', 'private.group_event_locations', 'select'
  ) or has_table_privilege(
    'authenticated', 'private.revenuecat_premium_state', 'select'
  ) then
    raise exception 'authenticated unexpectedly has direct private-table access';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.apply_revenuecat_premium_state(uuid,boolean,timestamp with time zone)',
    'execute'
  ) then
    raise exception 'authenticated can forge canonical Premium state';
  end if;
end;
$$;

rollback;
