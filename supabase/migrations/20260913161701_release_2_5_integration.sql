-- Les RPC SECURITY DEFINER doivent respecter les bannissements comme la lecture directe des profils.
create or replace function public.gig_candidates(p_gig uuid, p_limit integer default 50)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  g public.gig_requests%rowtype;
  v_open text[];
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into g from public.gig_requests where id = p_gig;
  if not found or g.host_id <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  v_open := private.gig_open_instruments(g);
  return query
    select jsonb_build_object('profile', private.gig_profile_summary(p), 'match', m.match)
    from public.profiles p
    cross join lateral (select private.gig_profile_match(p_gig, p.id) as match) as m
    where p.id <> g.host_id
      and not p.is_demo
      and p.moderation_status <> 'banned'
      and length(btrim(p.name)) >= 2
      and cardinality(p.instruments) > 0
      and p.instruments && v_open
      and not private.gig_blocked_pair(g.host_id, p.id)
      and not exists (
        select 1 from public.gig_applications a where a.gig_id = p_gig and a.musician_id = p.id
      )
      and (cardinality(g.wanted_school_ids) = 0 or exists (
        select 1 from public.music_school_memberships ms
        where ms.profile_id = p.id and ms.status = 'active' and ms.left_at is null
          and ms.school_id = any(g.wanted_school_ids)
      ))
    order by (m.match ->> 'score')::integer desc,
             (m.match ->> 'available_on_date')::boolean desc,
             p.name
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.gig_candidates(uuid, integer) from public, anon;
grant execute on function public.gig_candidates(uuid, integer) to authenticated;

-- Compteur léger pour le talon vert du ticket (aucun score calculé).
create or replace function public.gig_candidate_count(p_gig uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  g public.gig_requests%rowtype;
  v_open text[];
  v_count integer;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into g from public.gig_requests where id = p_gig;
  if not found or g.host_id <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  v_open := private.gig_open_instruments(g);
  if cardinality(v_open) = 0 or g.date <= now() then return 0; end if;
  select count(*)::integer into v_count
  from public.profiles p
  where p.id <> g.host_id
    and not p.is_demo
      and p.moderation_status <> 'banned'
    and length(btrim(p.name)) >= 2
    and p.instruments && v_open
    and not private.gig_blocked_pair(g.host_id, p.id)
    and not exists (
      select 1 from public.gig_applications a where a.gig_id = p_gig and a.musician_id = p.id
    )
    and (cardinality(g.wanted_school_ids) = 0 or exists (
      select 1 from public.music_school_memberships ms
      where ms.profile_id = p.id and ms.status = 'active' and ms.left_at is null
        and ms.school_id = any(g.wanted_school_ids)
    ))
    and (
      coalesce(cardinality(g.wanted_levels), 0) = 0
      or exists (
        select 1 from unnest(v_open) as i
        where i = any(p.instruments)
          and coalesce(p.instrument_levels ->> i, p.level) = any(g.wanted_levels)
      )
    );
  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.gig_candidate_count(uuid) from public, anon;
grant execute on function public.gig_candidate_count(uuid) to authenticated;

create or replace function public.gig_applicants(p_gig uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  v_host uuid;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select host_id into v_host from public.gig_requests where id = p_gig;
  if v_host is null or v_host <> v_viewer then
    raise exception 'only_gig_host' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object(
      'application', jsonb_build_object(
        'id', a.id,
        'gig_id', a.gig_id,
        'musician_id', a.musician_id,
        'instrument', a.instrument,
        'message', a.message,
        'status', a.status,
        'created_at', a.created_at,
        'host_contacted_at', a.host_contacted_at
      ),
      'profile', private.gig_profile_summary(p),
      'match', private.gig_profile_match(p_gig, p.id)
    )
    from public.gig_applications a
    join public.profiles p on p.id = a.musician_id
    where a.gig_id = p_gig
      and p.moderation_status <> 'banned'
    order by a.created_at, a.id;
end;
$$;
revoke all on function public.gig_applicants(uuid) from public, anon;
grant execute on function public.gig_applicants(uuid) to authenticated;

-- Fil « Pour moi » : SOS visibles du viewer où il joue un poste ouvert.
create or replace function public.my_gig_matches(p_limit integer default 100)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  p public.profiles%rowtype;
begin
  if v_viewer is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into p from public.profiles where id = v_viewer;
  if not found or cardinality(p.instruments) = 0 or p.moderation_status = 'banned' then return; end if;
  return query
    select jsonb_build_object(
      'gig', jsonb_build_object(
        'id', g.id,
        'date', g.date,
        'title', g.title,
        'host_id', g.host_id,
        'target_id', g.target_id,
        'wanted_instruments', to_jsonb(g.wanted_instruments),
        'filled_instruments', to_jsonb(coalesce(g.filled_instruments, '{}'::text[]))
      ),
      'match', m.match
    )
    from public.gig_requests g
    cross join lateral (select private.gig_profile_match(g.id, v_viewer) as match) as m
    where g.date > now()
      and g.host_id <> v_viewer
      and exists (select 1 from public.profiles host where host.id = g.host_id and host.moderation_status <> 'banned')
      and (g.target_id is null or g.target_id = v_viewer)
      and p.instruments && private.gig_open_instruments(g)
      and not private.gig_blocked_pair(g.host_id, v_viewer)
      and jsonb_array_length(coalesce(m.match -> 'instruments', '[]'::jsonb)) > 0
    order by (m.match ->> 'score')::integer desc, g.date asc, g.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.my_gig_matches(integer) from public, anon;
grant execute on function public.my_gig_matches(integer) to authenticated;

