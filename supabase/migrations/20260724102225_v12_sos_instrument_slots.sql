-- Slots d'instruments SOS : une candidature vise un instrument précis, et un
-- instrument pourvu (candidat accepté par l'organisateur) disparaît de l'annonce.
-- Plusieurs musiciens peuvent viser le même instrument jusqu'à ce qu'un soit
-- accepté (les autres passent « refusés »).

-- 1. Candidature : instrument visé + statut.
alter table public.gig_applications
    add column if not exists instrument text,
    add column if not exists status text not null default 'pending';

-- 2. Annonce : instruments déjà pourvus.
alter table public.gig_requests
    add column if not exists filled_instruments text[] not null default '{}';

-- 3. Feed : exposer filled_instruments (ajouté EN FIN pour create-or-replace).
create or replace view public.gig_requests_feed as
 select id, host_id,
   case when can_see_full_gig(g.*) then title else null::text end as title,
   date,
   case when can_see_full_gig(g.*) then place else null::text end as place,
   case when can_see_full_gig(g.*) then neighborhood else null::text end as neighborhood,
   genre,
   wanted_instruments,
   fee,
   case when can_see_full_gig(g.*) then description else null::text end as description,
   posted_at,
   not can_see_full_gig(g.*) as is_locked,
   payment_method,
   filled_instruments
 from gig_requests g
 where date > now();

-- 4. Acceptation d'une candidature par l'organisateur (host-only) :
--    l'instrument devient pourvu, les concurrents sur ce poste sont refusés.
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

    if v_instrument is not null then
        update public.gig_requests
            set filled_instruments = (
                select array(select distinct e
                             from unnest(coalesce(filled_instruments, '{}') || array[v_instrument]) e)
            )
            where id = v_gig;

        update public.gig_applications
            set status = 'declined'
            where gig_id = v_gig
              and instrument is not distinct from v_instrument
              and id <> application_id
              and status = 'pending';
    end if;
end;
$$;

revoke all on function public.accept_gig_application(uuid) from public, anon;
grant execute on function public.accept_gig_application(uuid) to authenticated;
