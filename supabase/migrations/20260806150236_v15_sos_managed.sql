-- Dispo 1.5 — le SOS devient une vraie fonctionnalité, gérée de bout en bout.
--
-- Jusqu'ici un SOS se terminait dans la messagerie : le candidat postait un
-- message balisé, l'organisateur répondait à la main, rien n'était suivi.
-- Cette migration donne au SOS son propre cycle de vie :
--   1. l'organisateur — ou le leader d'un groupe — accepte OU REFUSE chaque
--      candidat, et peut libérer un poste déjà pourvu ;
--   2. une demande adressée à un musicien précis (« Demander un dépannage »)
--      devient un vrai SOS ciblé qu'il accepte ou refuse : plus un seul
--      message à écrire ;
--   3. chaque décision part en notification, sans intervention humaine ;
--   4. un SOS publié pour un événement de groupe garde le lien vers cet
--      événement — quand le poste est pourvu, le groupe voit son line-up
--      redevenir complet.

-- ---------------------------------------------------------------------------
-- 1. Colonnes : lien groupe/événement + SOS adressé à une personne
-- ---------------------------------------------------------------------------

alter table public.gig_requests
    add column if not exists group_id      uuid references public.music_groups (id) on delete set null,
    add column if not exists event_id      uuid references public.group_events (id) on delete set null,
    add column if not exists target_id     uuid references public.profiles (id) on delete cascade,
    add column if not exists target_status text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'gig_requests_target_status_chk'
    ) then
        alter table public.gig_requests
            add constraint gig_requests_target_status_chk
            check (target_status is null or target_status in ('pending', 'accepted', 'declined'));
    end if;
end $$;

create index if not exists gig_requests_target_id_idx on public.gig_requests (target_id);
create index if not exists gig_requests_event_id_idx  on public.gig_requests (event_id);
create index if not exists gig_requests_group_id_idx  on public.gig_requests (group_id);

-- Le destinataire d'un SOS ciblé doit voir l'annonce, même pendant
-- l'avant-première (le jour où `can_see_full_gig` redeviendra restrictive).
drop policy if exists "gigs_select_after_early_access" on public.gig_requests;
create policy "gigs_select_after_early_access"
    on public.gig_requests for select to authenticated
    using (
        public.can_see_full_gig(gig_requests)
        or target_id = (select auth.uid())
    );

-- ---------------------------------------------------------------------------
-- 2. Feed : expose le lien groupe/événement, et garde les SOS ciblés privés
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
        g.target_status
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
    );

-- ---------------------------------------------------------------------------
-- 3. Postes pourvus : une seule source de vérité
-- ---------------------------------------------------------------------------

-- `filled_instruments` se recalcule toujours à partir des candidatures
-- acceptées : accepter, refuser ou libérer un poste passent tous par ici, donc
-- un poste rendu redevient réellement ouvert (l'ancien accept ne savait
-- qu'ajouter).
create or replace function public.refresh_gig_filled_instruments(p_gig uuid)
returns void
language sql
security definer
set search_path = public
as $$
    update public.gig_requests g
       set filled_instruments = coalesce((
               select array_agg(distinct a.instrument)
                 from public.gig_applications a
                where a.gig_id = p_gig
                  and a.status = 'accepted'
                  and a.instrument is not null
           ), '{}')
     where g.id = p_gig;
$$;

revoke all on function public.refresh_gig_filled_instruments(uuid) from public, anon, authenticated;

create or replace function public.accept_gig_application(application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_gig uuid;
    v_instrument text;
    v_host uuid;
begin
    select gig_id, instrument into v_gig, v_instrument
    from public.gig_applications where id = application_id;
    if v_gig is null then
        raise exception 'candidature introuvable';
    end if;

    select host_id into v_host from public.gig_requests where id = v_gig;
    if v_host is null or v_host <> auth.uid() then
        raise exception 'seul l''organisateur peut accepter';
    end if;

    update public.gig_applications set status = 'accepted' where id = application_id;

    -- Les concurrents sur le même poste sont refusés d'office.
    if v_instrument is not null then
        update public.gig_applications
            set status = 'declined'
            where gig_id = v_gig
              and instrument is not distinct from v_instrument
              and id <> application_id
              and status = 'pending';
    end if;

    perform public.refresh_gig_filled_instruments(v_gig);
end;
$$;

-- Refuser un candidat (host-only). Refuser quelqu'un de déjà accepté libère
-- son poste.
create or replace function public.decline_gig_application(application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_gig uuid;
    v_host uuid;
begin
    select gig_id into v_gig from public.gig_applications where id = application_id;
    if v_gig is null then
        raise exception 'candidature introuvable';
    end if;

    select host_id into v_host from public.gig_requests where id = v_gig;
    if v_host is null or v_host <> auth.uid() then
        raise exception 'seul l''organisateur peut refuser';
    end if;

    update public.gig_applications set status = 'declined' where id = application_id;
    perform public.refresh_gig_filled_instruments(v_gig);
end;
$$;

-- Remettre une candidature en attente : le poste se rouvre et le musicien
-- reste candidat (l'organisateur s'est trompé, ou le remplaçant s'est décommandé).
create or replace function public.reopen_gig_application(application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_gig uuid;
    v_host uuid;
begin
    select gig_id into v_gig from public.gig_applications where id = application_id;
    if v_gig is null then
        raise exception 'candidature introuvable';
    end if;

    select host_id into v_host from public.gig_requests where id = v_gig;
    if v_host is null or v_host <> auth.uid() then
        raise exception 'seul l''organisateur peut rouvrir un poste';
    end if;

    update public.gig_applications set status = 'pending' where id = application_id;
    perform public.refresh_gig_filled_instruments(v_gig);
end;
$$;

revoke all on function public.decline_gig_application(uuid) from public, anon;
revoke all on function public.reopen_gig_application(uuid) from public, anon;
grant execute on function public.decline_gig_application(uuid) to authenticated;
grant execute on function public.reopen_gig_application(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. SOS ciblé : le destinataire accepte ou refuse, et l'auteur est prévenu
-- ---------------------------------------------------------------------------

create or replace function public.respond_to_direct_gig(p_gig uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_target uuid;
    v_host uuid;
    v_title text;
    v_instrument text;
    v_status text;
    v_name text;
begin
    select target_id, host_id, title, wanted_instruments[1], target_status
      into v_target, v_host, v_title, v_instrument, v_status
      from public.gig_requests where id = p_gig;

    if v_target is null or v_target <> auth.uid() then
        raise exception 'cette demande ne t''est pas adressée';
    end if;
    if v_status is distinct from 'pending' then
        raise exception 'demande déjà traitée';
    end if;

    if p_accept then
        insert into public.gig_applications (gig_id, musician_id, instrument, status)
        values (p_gig, v_target, v_instrument, 'accepted')
        on conflict (gig_id, musician_id)
            do update set status = 'accepted', instrument = excluded.instrument;
        update public.gig_requests set target_status = 'accepted' where id = p_gig;
        perform public.refresh_gig_filled_instruments(p_gig);
    else
        delete from public.gig_applications
         where gig_id = p_gig and musician_id = v_target;
        update public.gig_requests set target_status = 'declined' where id = p_gig;
        perform public.refresh_gig_filled_instruments(p_gig);
    end if;

    select coalesce(nullif(name, ''), 'Un musicien') into v_name
      from public.profiles where id = v_target;

    if exists (
        select 1 from public.push_devices d
        where d.user_id = v_host and d.notifications_enabled and d.sos_enabled
    ) then
        insert into public.push_notifications
            (user_id, actor_id, category, title, body, data, source_table, source_id)
        values (
            v_host, v_target, 'sos',
            case when p_accept then 'Dépannage accepté' else 'Dépannage refusé' end,
            left(
                v_name || case when p_accept then ' accepte ' else ' ne peut pas assurer ' end
                       || '« ' || coalesce(v_title, 'ton SOS') || ' ».',
                180
            ),
            jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', p_gig::text),
            'gig_requests_response', p_gig
        )
        on conflict (user_id, category, source_table, source_id) do update
            set title = excluded.title,
                body = excluded.body,
                data = excluded.data,
                actor_id = excluded.actor_id,
                created_at = now(),
                sent_at = null,
                failed_at = null,
                last_error = null,
                attempts = 0;
    end if;
end;
$$;

revoke all on function public.respond_to_direct_gig(uuid, boolean) from public, anon;
grant execute on function public.respond_to_direct_gig(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notifications automatiques
-- ---------------------------------------------------------------------------

-- Un SOS ciblé ne réveille pas tout le réseau : seule la personne visée est
-- prévenue.
create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- La décision de l'organisateur part toute seule chez le candidat.
create or replace function public.queue_application_status_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_host uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('accepted', 'declined') then return new; end if;
  -- Le musicien vient d'agir lui-même (SOS ciblé accepté) : rien à annoncer.
  if new.musician_id = auth.uid() then return new; end if;

  select g.title, g.host_id into v_title, v_host
  from public.gig_requests g where g.id = new.gig_id;

  if exists (
    select 1 from public.push_devices d
    where d.user_id = new.musician_id and d.notifications_enabled and d.sos_enabled
  ) then
    insert into public.push_notifications
      (user_id, actor_id, category, title, body, data, source_table, source_id)
    values (
      new.musician_id, v_host, 'sos',
      case when new.status = 'accepted' then 'Tu es pris·e !' else 'Poste pourvu' end,
      left(
        case when new.status = 'accepted'
             then 'On te prend pour « ' || coalesce(v_title, 'ce SOS') || ' ».'
             else 'Un autre musicien a été retenu pour « ' || coalesce(v_title, 'ce SOS') || ' ».'
        end, 180
      ),
      jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.gig_id::text),
      'gig_application_status', new.id
    )
    on conflict (user_id, category, source_table, source_id) do update
      set title = excluded.title,
          body = excluded.body,
          data = excluded.data,
          actor_id = excluded.actor_id,
          created_at = now(),
          sent_at = null,
          failed_at = null,
          last_error = null,
          attempts = 0;
  end if;
  return new;
end;
$$;

drop trigger if exists gig_applications_status_push on public.gig_applications;
create trigger gig_applications_status_push
  after update of status on public.gig_applications
  for each row execute function public.queue_application_status_push();

revoke all on function public.queue_application_status_push() from public, anon, authenticated;
