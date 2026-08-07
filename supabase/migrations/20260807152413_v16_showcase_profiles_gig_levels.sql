-- Dispo 1.6 — vitrine de profils d'exemple, SOS ciblés par niveau, annonces
-- complètes retirées du fil.
--
-- 1. Depuis la 1.3, TOUT compte `is_demo` disparaît du réseau des vrais
--    utilisateurs. Résultat : un nouvel inscrit arrive dans une app vide.
--    `is_showcase` réintroduit une poignée de profils d'exemple choisis —
--    toujours badgés « Démo » dans l'app, jamais confondus avec de vrais
--    musiciens.
-- 2. Un SOS peut désormais demander un ou plusieurs niveaux. Le fil de
--    chacun ne montre que ce qui lui correspond (côté app), et la
--    notification ne part qu'aux musiciens du bon niveau (côté serveur).
-- 3. Une annonce dont tous les postes sont pourvus quitte le fil des
--    autres : elle ne reste visible que pour l'organisateur, la personne
--    visée et ceux qui ont postulé.

-- ---------------------------------------------------------------------------
-- 1. Profils vitrine
-- ---------------------------------------------------------------------------

alter table public.profiles
    add column if not exists is_showcase boolean not null default false;

comment on column public.profiles.is_showcase is
    'Compte d''exemple laissé visible dans le feed des vrais utilisateurs (toujours badgé « Démo » dans l''app). Sans ce drapeau, un profil is_demo reste caché.';

update public.profiles set is_showcase = false where is_showcase;

update public.profiles
   set is_showcase = true
 where is_demo
   and name in (
        'Marco Fernández', 'Sofia Almeida', 'Julien Perrin', 'Ingrid Johansson',
        'Stefan Meier', 'Camille Dupraz', 'Hugo Steiner', 'Tom Berger'
   );

-- Des dispos qui ne meurent pas la semaine prochaine : chaque profil vitrine
-- a deux jours fixes par semaine (comme un vrai musicien qui dit « je suis
-- libre les jeudis et samedis »), sur six mois.
with pattern(pname, dows) as (
    values
        ('Marco Fernández',  array[4, 6]),
        ('Sofia Almeida',    array[5, 0]),
        ('Julien Perrin',    array[2, 5]),
        ('Ingrid Johansson', array[3, 6]),
        ('Stefan Meier',     array[4, 0]),
        ('Camille Dupraz',   array[1, 6]),
        ('Hugo Steiner',     array[3, 5]),
        ('Tom Berger',       array[2, 4])
)
update public.profiles p
   set available_dates = (
        select array_agg(g.d::date order by g.d)
          from generate_series(
                current_date::timestamp,
                (current_date + 182)::timestamp,
                interval '1 day'
          ) as g(d)
         where extract(dow from g.d)::int = any(pattern.dows)
   )
  from pattern
 where p.name = pattern.pname
   and p.is_demo;

-- ---------------------------------------------------------------------------
-- 2. Niveaux demandés par un SOS
-- ---------------------------------------------------------------------------

alter table public.gig_requests
    add column if not exists wanted_levels text[];

comment on column public.gig_requests.wanted_levels is
    'Niveaux acceptés pour cette annonce (NULL ou vide = tous les niveaux).';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'gig_requests_wanted_levels_chk'
    ) then
        alter table public.gig_requests
            add constraint gig_requests_wanted_levels_chk
            check (
                wanted_levels is null
                or wanted_levels <@ array['Débutant', 'Intermédiaire', 'Avancé', 'Professionnel']::text[]
            );
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Le fil : niveaux exposés, annonces complètes retirées
-- ---------------------------------------------------------------------------

create or replace view public.gig_requests_feed as
 select g.id,
        g.host_id,
        case when public.can_see_full_gig(g.*) then g.title else null::text end as title,
        g.date,
        case when public.can_see_full_gig(g.*) then g.place else null::text end as place,
        case when public.can_see_full_gig(g.*) then g.neighborhood else null::text end as neighborhood,
        g.genre,
        g.wanted_instruments,
        case when public.viewer_is_pro() then g.fee else null::integer end as fee,
        case when public.can_see_full_gig(g.*) then g.description else null::text end as description,
        g.posted_at,
        not public.can_see_full_gig(g.*) as is_locked,
        case when public.viewer_is_pro() then g.payment_method else null::text end as payment_method,
        g.filled_instruments,
        g.group_id,
        g.event_id,
        g.target_id,
        g.target_status,
        g.wanted_levels
   from public.gig_requests g
  where g.date > now()
    and (
        public.viewer_is_demo()
        or not exists (select 1 from public.profiles p where p.id = g.host_id and p.is_demo)
    )
    -- Un SOS adressé à une personne ne s'affiche que chez elle et chez l'auteur.
    and (
        g.target_id is null
        or g.target_id = (select auth.uid())
        or g.host_id = (select auth.uid())
    )
    -- Tous les postes pourvus : l'annonce quitte le fil des autres. Elle
    -- reste chez l'organisateur, chez la personne visée et chez ceux qui ont
    -- postulé (ils doivent pouvoir suivre leur candidature).
    and (
        g.host_id = (select auth.uid())
        or g.target_id = (select auth.uid())
        or coalesce(array_length(g.wanted_instruments, 1), 0) = 0
        or not (g.wanted_instruments <@ coalesce(g.filled_instruments, '{}'::text[]))
        or exists (
            select 1 from public.gig_applications a
             where a.gig_id = g.id and a.musician_id = (select auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- 4. Notification d'un nouveau SOS : le bon instrument ET le bon niveau
-- ---------------------------------------------------------------------------

create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  host_name text;
begin
  if new.target_id is not null then
    select coalesce(nullif(p.name, ''), 'Un musicien') into host_name
    from public.profiles p where p.id = new.host_id;

    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    select
      new.target_id, new.host_id, 'sos', 'Demande de dépannage',
      left(host_name || ' te demande de dépanner : ' || new.title, 180),
      jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
      'gig_requests', new.id
    where exists (
        select 1 from public.push_devices d
        where d.user_id = new.target_id and d.notifications_enabled and d.sos_enabled
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = new.target_id and b.blocked_id = new.host_id)
           or (b.blocker_id = new.host_id and b.blocked_id = new.target_id)
      )
    on conflict do nothing;
    return new;
  end if;

  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    p.id,
    new.host_id,
    'sos',
    'Nouveau SOS compatible',
    left(new.title || case when new.place <> '' then ' · ' || new.place else '' end, 180),
    jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
    'gig_requests',
    new.id
  from public.profiles p
  where p.id <> new.host_id
    and exists (
      select 1 from unnest(p.available_dates) as dispo(day)
      where dispo.day >= current_date
    )
    and p.instruments && new.wanted_instruments
    -- Le niveau demandé, s'il y en a un : niveau global OU niveau déclaré
    -- sur l'un des instruments recherchés.
    and (
      new.wanted_levels is null
      or cardinality(new.wanted_levels) = 0
      or p.level = any(new.wanted_levels)
      or exists (
        select 1
          from jsonb_each_text(coalesce(p.instrument_levels, '{}'::jsonb)) as il(inst, lvl)
         where il.inst = any(new.wanted_instruments)
           and il.lvl = any(new.wanted_levels)
      )
    )
    and exists (
      select 1 from public.push_devices d
      where d.user_id = p.id and d.notifications_enabled and d.sos_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = new.host_id)
         or (b.blocker_id = new.host_id and b.blocked_id = p.id)
    )
  on conflict do nothing;
  return new;
end;
$function$;
