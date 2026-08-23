-- Dispo 1.4 — quatre corrections de fond côté serveur.
--
-- 1. Une série récurrente ne notifie plus qu'une fois. Le trigger était posé
--    « for each row » : créer une répétition hebdomadaire sur un an insérait
--    52 lignes et donc 52 notifications par membre, d'un coup. C'est le
--    « bug des 3000 notifs ». On ne notifie plus que la première date de la
--    série, en annonçant combien de dates elle contient.
-- 2. Le remplacement automatique ne demande plus un niveau fixe mais une
--    règle : « peu importe » (null) ou « identique à l'absent » (« same »).
-- 3. Nouvelle préférence de position : « hidden » — ne pas apparaître sur la
--    carte du tout.
-- 4. On ne note (étoiles) que quelqu'un avec qui on a déclaré avoir joué.

-- ---------------------------------------------------------------------------
-- 1. Une notification par série, pas une par date
-- ---------------------------------------------------------------------------

create or replace function public.queue_group_event_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_leader uuid;
  v_dates      integer := 1;
  v_body       text;
begin
  -- Série : seule la première date parle. Les triggers AFTER ROW d'un INSERT
  -- multi-lignes se déclenchent une fois toute l'instruction terminée, donc
  -- les autres occurrences sont déjà visibles ici.
  if new.series_id is not null then
    if exists (
      select 1
      from public.group_events e
      where e.series_id = new.series_id
        and e.id <> new.id
        and (e.date < new.date or (e.date = new.date and e.id < new.id))
    ) then
      return new;
    end if;

    select count(*) into v_dates
    from public.group_events e
    where e.series_id = new.series_id;
  end if;

  select g.leader_id into event_leader
  from public.music_groups g
  where g.id = new.group_id;

  v_body := left(
    new.title || case when new.venue <> '' then ' · ' || new.venue else '' end,
    150
  );
  if v_dates > 1 then
    v_body := v_body || ' · ' || v_dates || ' dates';
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    m.profile_id,
    event_leader,
    'groups',
    'Nouvel événement de groupe',
    v_body,
    jsonb_build_object('category', 'groups', 'target_tab', 'messages', 'group_id', new.group_id::text),
    'group_events',
    new.id
  from public.group_members m
  where m.group_id = new.group_id
    and m.profile_id <> event_leader
    and exists (
      select 1 from public.push_devices d
      where d.user_id = m.profile_id and d.notifications_enabled and d.groups_enabled
    )
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.queue_group_event_push() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Règle de niveau du remplacement automatique
-- ---------------------------------------------------------------------------

alter table public.music_groups
  drop constraint if exists music_groups_auto_sos_level_check;

alter table public.music_groups
  add constraint music_groups_auto_sos_level_check
  check (
    auto_sos_min_level is null
    -- « same » : on cherche quelqu'un du niveau du membre absent.
    or auto_sos_min_level = 'same'
    -- Les groupes réglés avant la 1.4 portent encore un niveau fixe : on les
    -- laisse valides, l'app les relit comme « identique à l'absent ».
    or auto_sos_min_level in ('Débutant', 'Intermédiaire', 'Avancé', 'Professionnel')
  );

-- ---------------------------------------------------------------------------
-- 3. « Ne pas apparaître sur la carte »
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_location_precision_check;

do $$
declare
  v_name text;
begin
  -- La contrainte a été créée en ligne (nom généré) : on la retrouve par sa
  -- définition plutôt que de deviner son nom.
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%location_precision%';
  if v_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_location_precision_check
  check (location_precision in ('hidden', 'city', 'exact_friends', 'exact_everyone'));

-- ---------------------------------------------------------------------------
-- 4. Pas d'étoiles sans avoir joué ensemble
-- ---------------------------------------------------------------------------

drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own"
  on public.ratings for insert to authenticated
  with check (
    rater_id = (select auth.uid())
    and rated_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = ratings.rated_id and p.level = 'Professionnel'
    )
    -- Une note se gagne sur scène : il faut une collaboration déclarée.
    and exists (
      select 1 from public.collaborations c
      where (c.a_id = ratings.rater_id and c.b_id = ratings.rated_id)
         or (c.a_id = ratings.rated_id and c.b_id = ratings.rater_id)
    )
  );

drop policy if exists "ratings_update_own" on public.ratings;
create policy "ratings_update_own"
  on public.ratings for update to authenticated
  using (rater_id = (select auth.uid()))
  with check (
    rater_id = (select auth.uid())
    and rated_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = ratings.rated_id and p.level = 'Professionnel'
    )
    and exists (
      select 1 from public.collaborations c
      where (c.a_id = ratings.rater_id and c.b_id = ratings.rated_id)
         or (c.a_id = ratings.rated_id and c.b_id = ratings.rater_id)
    )
  );
