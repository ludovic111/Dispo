-- Tests transactionnels v35-v43. A executer uniquement sur la base locale :
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

-- Depuis la beta 2.4, tout nouveau profil est Premium par trigger. On vérifie
-- d'abord ce contrat courant, puis on neutralise ce seul wrapper dans la
-- transaction afin de continuer à exercer les garde-fous gratuits v35-v43.
-- Le ROLLBACK final réactive automatiquement le trigger et annule les profils.
do $$
begin
  if exists (
    select 1
    from public.profiles
    where id in (
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000b2',
      '00000000-0000-4000-8000-0000000000c3'
    )
      and not is_premium
  ) then
    raise exception 'Beta Premium trigger did not cover a new profile';
  end if;
end;
$$;

alter table public.profiles
  disable trigger profiles_00_enforce_beta_premium;

update public.profiles
set is_premium = false
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
  (select id from public.music_schools where slug = 'ema-geneve'),
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
      and slug = 'ema-geneve'
  ) then
    raise exception 'C must see A profile-visible EMA affiliation';
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
    set name = 'Nom qui doit rollback',
        auto_sos_enabled = true,
        auto_sos_min_level = null
    where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Non-Premium auto-SOS unexpectedly accepted';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_auto_sos' then raise; end if;
  end;
  if not exists (
    select 1 from public.music_groups
    where id = '10000000-0000-4000-8000-000000000001'
      and name = 'Premier groupe gratuit'
      and not auto_sos_enabled
  ) then
    raise exception 'Rejected free auto-SOS left partial group settings';
  end if;
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

-- v41 inclut maintenant le rappel dans la meme transaction que le noyau et
-- l'adresse. Le trigger Premium doit donc rollbacker TOUT le payload gratuit.
do $$
begin
  begin
    perform public.save_group_events_with_locations(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'id', '30000000-0000-4000-8000-000000000001',
        'kind', 'Répétition',
        'title', 'Edition gratuite a rollback',
        'public_location_label', 'Adresse publique a rollback',
        'date', (
          select to_jsonb(e.date) from public.group_events e
          where e.id = '30000000-0000-4000-8000-000000000001'
        ),
        'reminder_lead_days', 7,
        'exact_address', 'Adresse exacte a rollback',
        'clear_exact_address', false,
        'clear_reminder', false
      )),
      'update'
    );
    raise exception 'Non-Premium atomic reminder update unexpectedly succeeded';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'premium_required_for_configurable_reminders' then raise; end if;
  end;

  if not exists (
    select 1 from public.group_events e
    where e.id = '30000000-0000-4000-8000-000000000001'
      and e.title = 'Evenement adresse test'
      and e.public_location_label = 'Carouge preserve'
      and e.reminder_lead_days is null
  ) then
    raise exception 'Rejected free reminder left a partial public update';
  end if;
  if not exists (
    select 1 from public.get_group_event_location(
      '30000000-0000-4000-8000-000000000001'
    ) where exact_address = 'Route ultra secrete 7'
  ) then
    raise exception 'Rejected free reminder changed the private address';
  end if;
end;
$$;

-- Le meme payload reussit pour un Premium canonique et persiste les trois
-- dimensions ensemble. Le droit est ensuite revoque pour la suite du test.
set local role service_role;
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000a1', true,
  '2099-01-01T00:00:00Z'::timestamptz
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.save_group_events_with_locations(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'id', '30000000-0000-4000-8000-000000000001',
    'kind', 'Répétition',
    'title', 'Edition Premium atomique',
    'public_location_label', 'Carouge Premium',
    'date', (
      select to_jsonb(e.date) from public.group_events e
      where e.id = '30000000-0000-4000-8000-000000000001'
    ),
    'reminder_lead_days', 7,
    'exact_address', 'Route Premium 7',
    'clear_exact_address', false,
    'clear_reminder', false
  )),
  'update'
);
do $$
begin
  if not exists (
    select 1 from public.group_events e
    cross join lateral public.get_group_event_location(e.id) l
    where e.id = '30000000-0000-4000-8000-000000000001'
      and e.title = 'Edition Premium atomique'
      and e.public_location_label = 'Carouge Premium'
      and e.reminder_lead_days = 7
      and l.exact_address = 'Route Premium 7'
  ) then
    raise exception 'Premium event reminder was not saved atomically';
  end if;
end;
$$;
set local role service_role;
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000a1', false,
  '2099-01-01T00:00:01Z'::timestamptz
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.save_group_events_with_locations(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'id', '30000000-0000-4000-8000-000000000001',
    'kind', 'Répétition',
    'title', 'Edition Premium atomique',
    'public_location_label', 'Carouge Premium',
    'date', (
      select to_jsonb(e.date) from public.group_events e
      where e.id = '30000000-0000-4000-8000-000000000001'
    ),
    'clear_reminder', true,
    'clear_exact_address', false
  )),
  'update'
);
do $$
begin
  if not exists (
    select 1 from public.group_events e
    cross join lateral public.get_group_event_location(e.id) l
    where e.id = '30000000-0000-4000-8000-000000000001'
      and e.reminder_lead_days is null
      and l.exact_address = 'Route Premium 7'
  ) then
    raise exception 'Free reminder reset was not atomic or erased the address';
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
  '00000000-0000-4000-8000-0000000000b2', 'guest'
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

-- Auto-SOS durable : une indisponibilite enregistree AVANT l'activation est
-- reconciliee sans appel du client, puis les retries restent idempotents.
set local role postgres;
update public.profiles
set is_premium = true
where id = '00000000-0000-4000-8000-0000000000a1';
update public.event_attendance
set status = 'unavailable'
where event_id = '30000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000001'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Disabled auto-SOS created a dropout request';
  end if;
end;
$$;
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
  select id into v_first
  from public.gig_requests
  where event_id = '30000000-0000-4000-8000-000000000001'
    and auto_sos_absent_profile_id =
      '00000000-0000-4000-8000-0000000000b2';
  if v_first is null then
    raise exception 'Group activation did not reconcile an existing dropout';
  end if;

  select gig_id, created into v_second, v_created
  from public.create_auto_sos(
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2',
    'Remplacement retry', 'Retry auto-SOS', 'Piano'
  );
  if v_created or v_second is distinct from v_first then
    raise exception 'Client retry diverged from server-created auto-SOS';
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
  if not exists (
    select 1 from public.gig_requests
    where id = v_first
      and wanted_instruments = array['Piano']::text[]
      and place = 'Carouge centre'
      and public_location_label = 'Carouge centre'
      and place <> 'Route ultra secrete 7'
  ) then
    raise exception 'Auto-SOS fallback instrument or public location is unsafe';
  end if;
end;
$$;

-- Le scenario principal ne porte plus le JWT du leader : B se declare
-- indisponible pendant que A est hors ligne. Son role de groupe prime sur son
-- instrument de profil et le SOS apparait dans la meme transaction.
update public.group_members
set role = 'Batterie'
where group_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'Concert', 'Concert hors ligne', 'Eaux-Vives', 'Eaux-Vives',
  now() + interval '10 days'
);
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000010',
  'Eaux-Vives', 'Rue Offline 10', '1207', 'Geneve', 'CH', null, null
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000b2', 'unavailable'
);
do $$
declare
  v_gig uuid;
begin
  select id into v_gig
  from public.gig_requests
  where event_id = '30000000-0000-4000-8000-000000000010'
    and auto_sos_absent_profile_id =
      '00000000-0000-4000-8000-0000000000b2';
  if v_gig is null then
    raise exception 'Offline member transition did not create auto-SOS';
  end if;
  if not exists (
    select 1 from public.gig_requests
    where id = v_gig
      and host_id = '00000000-0000-4000-8000-0000000000a1'
      and wanted_instruments = array['Batterie']::text[]
      and wanted_levels = array['Intermédiaire']::text[]
      and place = 'Eaux-Vives'
      and public_location_label = 'Eaux-Vives'
      and description not like '%Rue Offline 10%'
      and description not like '%Test B%'
      and description not like '%Premier groupe gratuit%'
  ) then
    raise exception 'Offline auto-SOS ignored role, leader or public privacy';
  end if;
  if exists (select 1 from public.get_gig_request_location(v_gig)) then
    raise exception 'Unavailable member unexpectedly saw the exact SOS address';
  end if;

  begin
    perform public.create_auto_sos(
      '30000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-0000000000b2',
      'Interdit', '', 'Batterie'
    );
    raise exception 'Non-leader unexpectedly called create_auto_sos';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'only_group_leader_can_create_auto_sos' then raise; end if;
  end;
end;
$$;

-- Le retour a available retire un SOS automatique encore sans engagement.
-- Un nouveau desistement le recree proprement, toujours en un seul exemplaire.
update public.event_attendance
set status = 'available'
where event_id = '30000000-0000-4000-8000-000000000010'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000010'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Resolved uncommitted auto-SOS remained visible';
  end if;
end;
$$;
update public.event_attendance
set status = 'unavailable'
where event_id = '30000000-0000-4000-8000-000000000010'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
begin
  if (
    select count(*) from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000010'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) <> 1 then
    raise exception 'Offline auto-SOS transition was not idempotent';
  end if;
end;
$$;

-- Une acceptation est un engagement : le meme retour a available conserve
-- le SOS et la candidature acceptee pour que le leader tranche explicitement.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
insert into public.gig_applications(
  id, gig_id, musician_id, instrument, status
)
select '21000000-0000-4000-8000-000000000010', g.id,
       '00000000-0000-4000-8000-0000000000c3', 'Batterie', 'pending'
from public.gig_requests g
where g.event_id = '30000000-0000-4000-8000-000000000010'
  and g.auto_sos_absent_profile_id =
    '00000000-0000-4000-8000-0000000000b2';
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
select public.accept_gig_application(
  '21000000-0000-4000-8000-000000000010'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
update public.event_attendance
set status = 'available'
where event_id = '30000000-0000-4000-8000-000000000010'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
begin
  if not exists (
    select 1
    from public.gig_requests g
    join public.gig_applications a on a.gig_id = g.id
    where g.event_id = '30000000-0000-4000-8000-000000000010'
      and g.auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
      and a.id = '21000000-0000-4000-8000-000000000010'
      and a.status = 'accepted'
  ) then
    raise exception 'Resolved auto-SOS erased an accepted commitment';
  end if;
end;
$$;

-- L'hote peut relire la copie privee ; ni la ligne publique ni l'appel du
-- membre absent ci-dessus n'ont revele l'adresse exacte.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
declare
  v_gig uuid := (
    select id from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000010'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  );
begin
  if not exists (
    select 1 from public.get_gig_request_location(v_gig)
    where exact_address = 'Rue Offline 10'
  ) then
    raise exception 'Offline auto-SOS lost its private event address';
  end if;
end;
$$;

-- `group_members.role` est historique et libre. Une valeur inconnue ne doit
-- jamais devenir un instrument public : le noyau revient au premier instrument
-- valide du profil, ici Piano.
update public.group_members
set role = 'Chef de pupitre'
where group_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000001',
  'Jam', 'Role invalide', 'Centre', 'Centre', now() + interval '15 days'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-0000000000b2', 'unavailable'
);
do $$
begin
  if not exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000015'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
      and wanted_instruments = array['Piano']::text[]
  ) then
    raise exception 'Invalid group role did not fall back to profile instrument';
  end if;
end;
$$;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
update public.group_members
set role = 'Batterie'
where group_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';

-- Une presence corrompue d'un non-membre ne suffit jamais a publier. Le
-- trigger de presence doit la tolerer sans transformer C en membre implicite.
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-0000000000c3', 'unavailable'
);
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000010'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000c3'
  ) then
    raise exception 'Orphan attendance created an auto-SOS for a non-member';
  end if;
end;
$$;
delete from public.event_attendance
where event_id = '30000000-0000-4000-8000-000000000010'
  and profile_id = '00000000-0000-4000-8000-0000000000c3';

-- Un evenement passe ne peut jamais etre republie, meme avec toutes les
-- autres conditions remplies.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'Répétition', 'Session passee', 'Centre', 'Centre',
  now() - interval '1 hour'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-0000000000b2', 'unavailable'
);
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000011'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Past event unexpectedly created an auto-SOS';
  end if;
end;
$$;

-- Atomicite : une erreur inattendue pendant l'ecriture du SOS remonte jusqu'a
-- la presence. La ligne de presence, le SOS, l'adresse et les notifications
-- deja executees par les autres triggers sont tous annules ensemble.
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000001',
  'Concert', 'Atomicite auto-SOS', 'Jonction', 'Jonction',
  now() + interval '12 days'
);
select public.set_group_event_location(
  '30000000-0000-4000-8000-000000000012',
  'Jonction', 'Rue Rollback 12', '1205', 'Geneve', 'CH', null, null
);
set local role postgres;
create or replace function pg_temp.fail_auto_sos_write()
returns trigger
language plpgsql
as $$
begin
  raise exception 'forced_auto_sos_write_failure';
end;
$$;
create trigger test_force_auto_sos_write_failure
after insert on public.gig_requests
for each row
when (new.event_id = '30000000-0000-4000-8000-000000000012'::uuid)
execute function pg_temp.fail_auto_sos_write();

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
do $$
begin
  begin
    insert into public.event_attendance(event_id, profile_id, status)
    values (
      '30000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-0000000000b2', 'unavailable'
    );
    raise exception 'Auto-SOS write failure trigger did not fire';
  exception
    when raise_exception then
      if sqlerrm <> 'forced_auto_sos_write_failure' then raise; end if;
  end;

  if exists (
    select 1 from public.event_attendance
    where event_id = '30000000-0000-4000-8000-000000000012'
      and profile_id = '00000000-0000-4000-8000-0000000000b2'
  ) or exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000012'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Auto-SOS attendance subtransaction left partial state';
  end if;
  if current_setting('dispo.auto_sos_server', true) = 'on' then
    raise exception 'Auto-SOS internal marker leaked after rollback';
  end if;
end;
$$;
set local role postgres;
drop trigger test_force_auto_sos_write_failure on public.gig_requests;

-- Le droit Premium est revalide a chaque transition. Une indisponibilite
-- pendant l'expiration ne publie rien ; l'octroi canonique RevenueCat lance
-- ensuite la reconciliation sans rappel du webhook ni boucle sur profiles.
set local role service_role;
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000a1', false,
  '2099-01-02T00:00:00Z'::timestamptz
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000001',
  'Jam', 'Retour Premium', 'Servette', 'Servette',
  now() + interval '13 days'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-0000000000b2', 'unavailable'
);
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000013'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Expired Premium unexpectedly created an auto-SOS';
  end if;
end;
$$;
set local role service_role;
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000a1', true,
  '2099-01-03T00:00:00Z'::timestamptz
);
set local role postgres;
do $$
begin
  if (
    select count(*) from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000013'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000b2'
  ) <> 1 then
    raise exception 'Premium grant did not reconcile existing unavailability';
  end if;
end;
$$;

-- Le leader peut lui aussi manquer sa propre date. Sa ligne group_members
-- historique n'est pas requise ; le repli profil choisit ici Piano.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000001',
  'Concert', 'Leader absent', 'Paquis', 'Paquis',
  now() + interval '14 days'
);
update public.event_attendance
set status = 'unavailable'
where event_id = '30000000-0000-4000-8000-000000000014'
  and profile_id = '00000000-0000-4000-8000-0000000000a1';
do $$
begin
  if not exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000014'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000a1'
      and host_id = '00000000-0000-4000-8000-0000000000a1'
      and wanted_instruments = array['Piano']::text[]
  ) then
    raise exception 'Leader dropout was not covered by profile instrument';
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
      if sqlerrm <> 'new_leader_must_be_permanent_member' then raise; end if;
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

-- Un transfert vers un leader deja Premium est une transition d'eligibilite
-- a part entiere. On prepare une indisponibilite pendant l'expiration de A :
-- elle doit etre reconciliee dans la transaction du transfert vers B.
set local role service_role;
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000b2', true,
  '2099-01-04T00:00:00Z'::timestamptz
);
select public.apply_revenuecat_premium_state(
  '00000000-0000-4000-8000-0000000000a1', false,
  '2099-01-04T00:00:01Z'::timestamptz
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.group_events(
  id, group_id, kind, title, venue, public_location_label, date
) values (
  '30000000-0000-4000-8000-000000000016',
  '10000000-0000-4000-8000-000000000001',
  'Concert', 'Transfert Premium', 'Centre', 'Centre',
  now() + interval '16 days'
);
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true
);
insert into public.event_attendance(event_id, profile_id, status)
values (
  '30000000-0000-4000-8000-000000000016',
  '00000000-0000-4000-8000-0000000000c3', 'unavailable'
);
do $$
begin
  if exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000016'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000c3'
  ) then
    raise exception 'Expired old leader unexpectedly created transfer SOS';
  end if;
end;
$$;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
do $$
begin
  begin
    perform public.transfer_group_leadership(
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000b2'
    );
    raise exception 'Leadership transfer to a guest unexpectedly accepted';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'new_leader_must_be_permanent_member' then raise; end if;
  end;
end;
$$;
update public.group_members
set kind = 'permanent'
where group_id = '10000000-0000-4000-8000-000000000001'
  and profile_id = '00000000-0000-4000-8000-0000000000b2';
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
  if exists (
    select 1 from public.gig_requests
    where group_id = '10000000-0000-4000-8000-000000000001'
      and auto_sos_absent_profile_id is not null
      and host_id <> '00000000-0000-4000-8000-0000000000b2'
  ) then
    raise exception 'Leadership transfer left an auto-SOS with its old host';
  end if;
  if not exists (
    select 1 from public.gig_requests
    where event_id = '30000000-0000-4000-8000-000000000016'
      and auto_sos_absent_profile_id =
        '00000000-0000-4000-8000-0000000000c3'
      and host_id = '00000000-0000-4000-8000-0000000000b2'
      and wanted_instruments = array['Piano']::text[]
  ) then
    raise exception 'Premium leadership transfer did not reconcile dropout';
  end if;
  if not exists (
    select 1 from public.gig_requests
    where id = '20000000-0000-4000-8000-000000000002'
      and host_id = '00000000-0000-4000-8000-0000000000a1'
      and auto_sos_absent_profile_id is null
  ) then
    raise exception 'Leadership transfer reassigned a manual linked SOS';
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

-- v43 : le worker push est installe une seule fois, son token reste dans
-- Vault, et l'absence volontaire d'URL locale rend l'invocation inerte.
do $$
declare
  v_token text;
  v_request_count bigint;
  v_request_id bigint;
begin
  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  )
     or not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net')
  then
    raise exception 'Push worker extensions are missing';
  end if;
  if (
    select count(*) from cron.job
    where jobname = 'dispo-push-worker-every-minute'
  ) <> 1 then
    raise exception 'Push worker cron is missing or duplicated';
  end if;
  if (
    select count(*) from vault.decrypted_secrets
    where name = 'dispo_push_worker_token'
  ) <> 1 then
    raise exception 'Push worker token is missing or duplicated';
  end if;

  select s.decrypted_secret into v_token
  from vault.decrypted_secrets s
  where s.name = 'dispo_push_worker_token';
  if not public.verify_push_worker_token(v_token)
     or public.verify_push_worker_token(repeat('0', 64))
     or public.verify_push_worker_token(null)
  then
    raise exception 'Push worker token verification is not fail-closed';
  end if;
  if exists (
    select 1 from cron.job j
    where position(v_token in row_to_json(j)::text) > 0
       or j.command ~ '[0-9a-f]{64}'
       or j.command ilike '%Bearer %'
  ) or exists (
    select 1 from cron.job_run_details d
    where position(v_token in row_to_json(d)::text) > 0
  ) then
    raise exception 'Push worker token leaked into cron metadata or logs';
  end if;
  if (
    select command from cron.job
    where jobname = 'dispo-push-worker-every-minute'
  ) <> 'select private.invoke_push_worker();' then
    raise exception 'Push worker cron command is not the static safe wrapper';
  end if;
  if position(
    'skip locked' in lower(pg_get_functiondef(
      'public.claim_pending_push_notifications(uuid,uuid,timestamp with time zone,integer)'::regprocedure
    ))
  ) = 0 then
    raise exception 'Push claim RPC lost its SKIP LOCKED concurrency guard';
  end if;

  select count(*) into v_request_count from net.http_request_queue;
  select private.invoke_push_worker() into v_request_id;
  if v_request_id is not null
     or (select count(*) from net.http_request_queue) <> v_request_count
  then
    raise exception 'Push worker made a request without configured project URL';
  end if;

  if has_function_privilege(
    'authenticated', 'public.verify_push_worker_token(text)', 'execute'
  ) or not has_function_privilege(
    'service_role', 'public.verify_push_worker_token(text)', 'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.claim_pending_push_notifications(uuid,uuid,timestamp with time zone,integer)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.claim_pending_push_notifications(uuid,uuid,timestamp with time zone,integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.begin_push_notification_attempt(uuid,uuid)', 'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.begin_push_notification_attempt(uuid,uuid)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.release_push_notification_claim(uuid)', 'execute'
  ) or not has_function_privilege(
    'service_role', 'public.release_push_notification_claim(uuid)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'private.invoke_push_worker()', 'execute'
  ) then
    raise exception 'Push worker function privileges are unsafe';
  end if;
end;
$$;

-- Enregistrement push : formats controles aussi sur UPDATE, dix appareils au
-- maximum, upsert du meme token encore possible au plafond et appareil courant
-- prioritaire par eviction LRU lors d'une nouvelle inscription ou transfert.
delete from public.push_devices;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.push_devices (
  user_id, token, platform, environment, app_version, last_seen_at
)
select
  '00000000-0000-4000-8000-0000000000a1',
  lpad(to_hex(g), 64, '0'), 'ios', 'development', 'quota-test',
  clock_timestamp() - make_interval(mins => 11 - g)
from generate_series(1, 10) g;

insert into public.push_devices (
  user_id, token, platform, environment, app_version
) values (
  '00000000-0000-4000-8000-0000000000a1',
  lpad(to_hex(1), 64, '0'), 'ios', 'development', 'upsert-au-plafond'
)
on conflict (token) do update
set app_version = excluded.app_version,
    last_seen_at = clock_timestamp();

insert into public.push_devices (
  user_id, token, platform, environment
) values (
  '00000000-0000-4000-8000-0000000000a1',
  lpad(to_hex(11), 64, '0'), 'ios', 'development'
);

do $$
begin
  begin
    update public.push_devices
    set token = upper(token)
    where token = lpad(to_hex(10), 64, '0');
    raise exception 'Invalid iOS token update unexpectedly accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.push_devices (
      user_id, token, platform, environment
    ) values (
      '00000000-0000-4000-8000-0000000000a1',
      'android:token:invalid', 'android', 'production'
    );
    raise exception 'Invalid Android token unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true
);
insert into public.push_devices (
  user_id, token, platform, environment, app_version
) values (
  '00000000-0000-4000-8000-0000000000b2',
  'Abcdefghijklmn_1', 'android', 'production', 'android-valid'
);

select set_config(
  'request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true
);
insert into public.push_devices (
  user_id, token, platform, environment
) values (
  '00000000-0000-4000-8000-0000000000a1',
  'Abcdefghijklmn_1', 'android', 'production'
);

set local role postgres;
do $$
begin
  if (
    select count(*) from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
  ) <> 10 or not exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and token = lpad(to_hex(1), 64, '0')
      and app_version = 'upsert-au-plafond'
  ) or exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and token = lpad(to_hex(2), 64, '0')
  ) or not exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and token = lpad(to_hex(11), 64, '0')
  ) or exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and token = lpad(to_hex(3), 64, '0')
  ) or not exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and token = 'Abcdefghijklmn_1'
  ) or exists (
    select 1 from public.push_devices
    where user_id = '00000000-0000-4000-8000-0000000000b2'
      and token = 'Abcdefghijklmn_1'
  ) then
    raise exception 'Push device quota/upsert/transfer invariant failed';
  end if;
end;
$$;
delete from public.push_devices;

-- Claim atomique : la portee utilisateur reste actor_id + 10 minutes, le
-- worker reprend globalement les anciennes lignes encore fraiches, une lease
-- ne peut pas etre volee avant 10 minutes et un crash devient reprenable.
delete from public.push_notifications;
do $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_rows integer;
begin
  insert into public.push_notifications (
    id, user_id, actor_id, category, title, body, data,
    source_table, source_id, created_at, read_at
  ) values
  (
    '50000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'Claim recent A', 'Claim recent A', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000001',
    v_now - interval '2 minutes', null
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000b2',
    'groups', 'Claim recent B', 'Claim recent B', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000002',
    v_now - interval '1 minute', null
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'Claim hors fenetre', 'Claim hors fenetre', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000003',
    v_now - interval '20 minutes', null
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'Claim expire', 'Claim expire', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000004',
    v_now - interval '25 hours', null
  ),
  (
    '50000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'Claim deja lu', 'Claim deja lu', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000005',
    v_now - interval '1 minute', v_now
  );

  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000a1',
    v_now - interval '10 minutes', 100
  );
  if v_count <> 1 or not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000001'
      and attempts = 0
      and delivery_claim_id =
        '60000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'User claim lost actor/window scope or consumed early';
  end if;

  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000000a1',
    v_now - interval '10 minutes', 100
  );
  if v_count <> 0 then
    raise exception 'A live lease was claimed twice';
  end if;

  update public.push_notifications
  set read_at = v_now
  where id = '50000000-0000-4000-8000-000000000001';
  select public.begin_push_notification_attempt(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  ) into v_count;
  if v_count is not null then
    raise exception 'Notification read after claim started a provider attempt';
  end if;
  update public.push_notifications
  set read_at = null
  where id = '50000000-0000-4000-8000-000000000001';

  select public.release_push_notification_claim(
    '60000000-0000-4000-8000-000000000001'
  ) into v_count;
  if v_count <> 1 or exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000001'
      and (attempts <> 0 or delivery_claim_id is not null
           or delivery_claimed_at is not null)
  ) then
    raise exception 'Pre-provider release did not return its owned lease';
  end if;

  perform public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-0000000000a1',
    v_now - interval '10 minutes', 100
  );
  select public.begin_push_notification_attempt(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000003'
  ) into v_count;
  if v_count <> 1 then
    raise exception 'First provider begin did not consume exactly one attempt';
  end if;
  update public.push_notifications
  set delivery_claimed_at = v_now - interval '9 minutes'
  where id = '50000000-0000-4000-8000-000000000001';
  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-0000000000a1',
    v_now - interval '10 minutes', 100
  );
  if v_count <> 0 then
    raise exception 'Nine-minute lease was reclaimed too early';
  end if;

  update public.push_notifications
  set delivery_claimed_at = v_now - interval '11 minutes'
  where id = '50000000-0000-4000-8000-000000000001';
  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-0000000000a1',
    v_now - interval '10 minutes', 100
  );
  if v_count <> 1 or not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000001'
      and attempts = 1
      and delivery_claim_id =
        '60000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Expired lease was not reclaimed without an early attempt';
  end if;
  select public.begin_push_notification_attempt(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000003'
  ) into v_count;
  if v_count is not null then
    raise exception 'Stale claim started a provider attempt';
  end if;
  select public.begin_push_notification_attempt(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000004'
  ) into v_count;
  if v_count <> 2 then
    raise exception 'Reclaimed provider begin did not consume second attempt';
  end if;

  update public.push_notifications
  set sent_at = v_now,
      delivery_claim_id = null,
      delivery_claimed_at = null
  where id = '50000000-0000-4000-8000-000000000001'
    and delivery_claim_id =
      '60000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'A stale claim finalized a reclaimed notification';
  end if;

  update public.push_notifications
  set sent_at = v_now,
      failed_at = null,
      last_error = null,
      delivery_claim_id = null,
      delivery_claimed_at = null
  where id = '50000000-0000-4000-8000-000000000001'
    and delivery_claim_id =
      '60000000-0000-4000-8000-000000000004';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Current claim could not finalize its notification';
  end if;

  if not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000004'
      and sent_at is null and attempts = 3
      and last_error = 'delivery_window_expired'
  ) or not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000005'
      and sent_at is null and attempts = 3
      and last_error = 'read_before_delivery'
  ) or not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000003'
      and attempts = 0 and delivery_claim_id is null
  ) then
    raise exception 'TTL/read terminalization or user time window is unsafe';
  end if;

  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000005', null, null, 1
  );
  if v_count <> 1 or not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000003'
      and delivery_claim_id =
        '60000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Global worker did not resume the oldest valid row';
  end if;

  -- Les producteurs historiques rejouent leurs notifications avec un
  -- `attempts = 0`. Meme si une lease est active, ce reset doit la rendre
  -- immediatement caduque avant que l'ancien worker ne finalise la ligne.
  insert into public.push_notifications (
    user_id, actor_id, category, title, body, data,
    source_table, source_id, created_at, attempts
  ) values (
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'Claim rejouee', 'Claim rejouee', '{}'::jsonb,
    'claim_test', '70000000-0000-4000-8000-000000000003',
    v_now, 0
  )
  on conflict (user_id, category, source_table, source_id) do update
  set title = excluded.title,
      body = excluded.body,
      created_at = excluded.created_at,
      sent_at = null,
      failed_at = null,
      last_error = null,
      attempts = 0;
  if not exists (
    select 1 from public.push_notifications
    where id = '50000000-0000-4000-8000-000000000003'
      and attempts = 0
      and delivery_claim_id is null
      and delivery_claimed_at is null
  ) then
    raise exception 'Producer retry did not invalidate an active push claim';
  end if;
end;
$$;

delete from public.push_notifications;
insert into public.push_notifications (
  user_id, actor_id, category, title, body, data,
  source_table, source_id, created_at
)
select
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000a1',
  'groups', 'Lot borne', 'Lot borne', '{}'::jsonb,
  'claim_batch', gen_random_uuid(),
  clock_timestamp() - interval '5 minutes' + g * interval '1 millisecond'
from generate_series(1, 101) g;
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.claim_pending_push_notifications(
    '60000000-0000-4000-8000-000000000006', null, null, 999
  );
  if v_count <> 10 or (
    select count(*) from public.push_notifications
    where delivery_claim_id =
      '60000000-0000-4000-8000-000000000006'
      and attempts = 0
  ) <> 10 or (
    select count(*) from public.push_notifications
    where delivery_claim_id is null and attempts = 0
  ) <> 91 then
    raise exception 'Server claim batch is not capped at 10';
  end if;

  select public.release_push_notification_claim(
    '60000000-0000-4000-8000-000000000006'
  ) into v_count;
  if v_count <> 10 or exists (
    select 1 from public.push_notifications
    where attempts <> 0 or delivery_claim_id is not null
       or delivery_claimed_at is not null
  ) then
    raise exception 'Batch release did not refund all still-owned rows';
  end if;
end;
$$;

-- URL inter-tenant refusee et queue vide : aucun appel pg_net, meme si le
-- token interne reste valide. Le test ne lit ni n'affiche jamais ce token.
delete from public.push_notifications;
do $$
declare
  v_url_secret_id uuid;
  v_request_count bigint;
  v_request_id bigint;
begin
  delete from vault.secrets where name = 'dispo_project_url';
  select count(*) into v_request_count from net.http_request_queue;
  insert into public.push_notifications (
    user_id, actor_id, category, title, body, data,
    source_table, source_id
  ) values (
    '00000000-0000-4000-8000-0000000000b2',
    '00000000-0000-4000-8000-0000000000a1',
    'groups', 'SSRF test', 'SSRF test', '{}'::jsonb,
    'claim_ssrf_test', '70000000-0000-4000-8000-000000000099'
  );
  select private.invoke_push_worker() into v_request_id;
  if v_request_id is not null
     or (select count(*) from net.http_request_queue) <> v_request_count
  then
    raise exception 'Missing project URL did not fail closed with pending work';
  end if;

  select vault.create_secret(
    'https://another-project.supabase.co',
    'dispo_project_url', 'URL de test inter-tenant refusee'
  ) into v_url_secret_id;
  select private.invoke_push_worker() into v_request_id;
  if v_request_id is not null
     or (select count(*) from net.http_request_queue) <> v_request_count
  then
    raise exception 'Cross-tenant project URL reached pg_net';
  end if;

  delete from public.push_notifications
  where source_table = 'claim_ssrf_test';
  perform vault.update_secret(
    v_url_secret_id,
    'https://cghmmpcwqzpjwgnbiuuw.supabase.co',
    'dispo_project_url', 'URL canonique de test'
  );
  select private.invoke_push_worker() into v_request_id;
  if v_request_id is not null
     or (select count(*) from net.http_request_queue) <> v_request_count
  then
    raise exception 'Empty queue invoked the Edge worker';
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
