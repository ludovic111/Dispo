-- Fixtures locales uniquement ; rien ne survit à la transaction.
-- Vérifie que private.normalize_legacy_saxophone() (migration 20260913157000) remplace
-- « Saxophone » par « Saxophone alto », dédoublonne, garde la valeur alto déjà présente
-- et reste idempotente.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('5a000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'sax-sqlqa-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Sax QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;

-- Profil 1 : saxophone hérité + doublon alto ; le niveau alto existant doit gagner.
update public.profiles set
  instruments = array['Saxophone','Piano','Saxophone alto'],
  instrument_levels = '{"Saxophone":"Débutant","Piano":"Avancé","Saxophone alto":"Professionnel"}'::jsonb
where id='5a000000-0000-4000-8000-000000000001';
-- Profil 2 : saxophone hérité seul ; son niveau doit être transféré.
update public.profiles set
  instruments = array['Basse','Saxophone'],
  instrument_levels = '{"Saxophone":"Avancé","Basse":"Intermédiaire"}'::jsonb
where id='5a000000-0000-4000-8000-000000000002';
-- Profil 3 : aucune valeur héritée ; ne doit pas bouger.
update public.profiles set
  instruments = array['Saxophone ténor'],
  instrument_levels = '{"Saxophone ténor":"Avancé"}'::jsonb
where id='5a000000-0000-4000-8000-000000000003';

insert into public.music_groups(id,name,leader_id) values
 ('5a000000-0000-4000-8000-000000000010','Sax QA Band','5a000000-0000-4000-8000-000000000001');
insert into public.group_members(group_id,profile_id,kind,role) values
 ('5a000000-0000-4000-8000-000000000010','5a000000-0000-4000-8000-000000000002','permanent','Saxophone'),
 ('5a000000-0000-4000-8000-000000000010','5a000000-0000-4000-8000-000000000003','permanent','Saxophone ténor');
insert into public.group_manual_members(id,group_id,name,role) values
 ('5a000000-0000-4000-8000-000000000020','5a000000-0000-4000-8000-000000000010','Camille','Saxophone'),
 ('5a000000-0000-4000-8000-000000000021','5a000000-0000-4000-8000-000000000010','Dominique','Trompette');

insert into public.gig_requests(id,host_id,title,date,genre,wanted_instruments,filled_instruments,place)
values ('5a000000-0000-4000-8000-000000000030','5a000000-0000-4000-8000-000000000001','Sax QA gig',
        now()+interval '7 days','Jazz',array['Saxophone','Saxophone alto','Basse'],array['Basse'],'Genève');
-- La candidature doit viser un poste encore ouvert (garde serveur) ; on pourvoit ensuite.
insert into public.gig_applications(gig_id,musician_id,instrument) values
 ('5a000000-0000-4000-8000-000000000030','5a000000-0000-4000-8000-000000000002','Saxophone');
update public.gig_requests set filled_instruments = array['Saxophone','Basse']
where id='5a000000-0000-4000-8000-000000000030';

-- Première exécution : tout est remplacé.
create temp table first_run on commit drop as select * from private.normalize_legacy_saxophone();
select pg_temp.assert_true((select profiles_instruments=2 and profiles_instrument_levels=2 and gig_requests_wanted=1
  and gig_requests_filled=1 and gig_applications_instrument=1 and group_members_role=1 and group_manual_members_role=1 from first_run),
  'Unexpected affected row counts on first run: '||(select row_to_json(first_run)::text from first_run));

select pg_temp.assert_true((select instruments=array['Saxophone alto','Piano'] from public.profiles where id='5a000000-0000-4000-8000-000000000001'),
  'Profile 1 instruments not replaced/deduped in order');
select pg_temp.assert_true((select instrument_levels='{"Piano":"Avancé","Saxophone alto":"Professionnel"}'::jsonb from public.profiles where id='5a000000-0000-4000-8000-000000000001'),
  'Profile 1 must keep the existing alto level');
select pg_temp.assert_true((select instruments=array['Basse','Saxophone alto'] from public.profiles where id='5a000000-0000-4000-8000-000000000002'),
  'Profile 2 instruments not replaced');
select pg_temp.assert_true((select instrument_levels='{"Basse":"Intermédiaire","Saxophone alto":"Avancé"}'::jsonb from public.profiles where id='5a000000-0000-4000-8000-000000000002'),
  'Profile 2 level not transferred to alto');
select pg_temp.assert_true((select instruments=array['Saxophone ténor'] and instrument_levels='{"Saxophone ténor":"Avancé"}'::jsonb from public.profiles where id='5a000000-0000-4000-8000-000000000003'),
  'Profile 3 must be untouched');
select pg_temp.assert_true((select wanted_instruments=array['Saxophone alto','Basse'] and filled_instruments=array['Saxophone alto','Basse'] from public.gig_requests where id='5a000000-0000-4000-8000-000000000030'),
  'Gig request arrays not replaced/deduped');
select pg_temp.assert_true((select instrument='Saxophone alto' from public.gig_applications where gig_id='5a000000-0000-4000-8000-000000000030'),
  'Gig application instrument not replaced');
select pg_temp.assert_true((select role='Saxophone alto' from public.group_members where group_id='5a000000-0000-4000-8000-000000000010' and profile_id='5a000000-0000-4000-8000-000000000002'),
  'Group member role not replaced');
select pg_temp.assert_true((select role='Saxophone ténor' from public.group_members where group_id='5a000000-0000-4000-8000-000000000010' and profile_id='5a000000-0000-4000-8000-000000000003'),
  'Tenor role must be untouched');
select pg_temp.assert_true((select role='Saxophone alto' from public.group_manual_members where id='5a000000-0000-4000-8000-000000000020'),
  'Manual member role not replaced');
select pg_temp.assert_true((select role='Trompette' from public.group_manual_members where id='5a000000-0000-4000-8000-000000000021'),
  'Other manual member role must be untouched');

-- Seconde exécution : idempotente.
create temp table second_run on commit drop as select * from private.normalize_legacy_saxophone();
select pg_temp.assert_true((select profiles_instruments=0 and profiles_instrument_levels=0 and gig_requests_wanted=0
  and gig_requests_filled=0 and gig_applications_instrument=0 and group_members_role=0 and group_manual_members_role=0 from second_run),
  'Second run must not touch anything');

-- Aucune ligne de données ne contient plus la valeur héritée.
select pg_temp.assert_true((select count(*)=0 from public.profiles where 'Saxophone'=any(instruments) or instrument_levels ? 'Saxophone'),
  'Legacy value still present in profiles');
select pg_temp.assert_true((select count(*)=0 from public.gig_requests where 'Saxophone'=any(wanted_instruments) or 'Saxophone'=any(filled_instruments)),
  'Legacy value still present in gig_requests');

-- La fonction n'est pas exposée aux rôles applicatifs.
select pg_temp.assert_true(not has_function_privilege('authenticated','private.normalize_legacy_saxophone()','execute'),
  'authenticated must not execute the normalizer');
select pg_temp.assert_true(not has_function_privilege('anon','private.normalize_legacy_saxophone()','execute'),
  'anon must not execute the normalizer');

select 'saxophone_split: all assertions passed' as result;
rollback;
