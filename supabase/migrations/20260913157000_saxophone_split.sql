-- Dispo 2.5 — le saxophone générique disparaît des sélecteurs au profit des variantes
-- alto / ténor. Les valeurs historiques « Saxophone » sont ramenées vers « Saxophone alto »
-- (ordre conservé, doublons retirés). Idempotent : rejouer ne change plus rien.

create or replace function private.normalize_legacy_saxophone()
returns table (
  profiles_instruments integer,
  profiles_instrument_levels integer,
  gig_requests_wanted integer,
  gig_requests_filled integer,
  gig_applications_instrument integer,
  group_members_role integer,
  group_manual_members_role integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_legacy constant text := 'Saxophone';
  v_target constant text := 'Saxophone alto';
begin
  -- Les tableaux sont remplacés puis dédoublonnés en conservant l'ordre de première apparition.
  update public.profiles p
  set instruments = (
    select coalesce(array_agg(d.v order by d.ord), '{}'::text[])
    from (
      select s.v, min(s.ord) as ord
      from (
        select case when u.v = v_legacy then v_target else u.v end as v, u.ord
        from unnest(p.instruments) with ordinality as u(v, ord)
      ) s
      group by s.v
    ) d
  )
  where v_legacy = any(p.instruments);
  get diagnostics profiles_instruments = row_count;

  -- Clé jsonb : la valeur déjà présente sur la clé alto est conservée.
  update public.profiles p
  set instrument_levels = (
    case
      when p.instrument_levels ? v_target then p.instrument_levels - v_legacy
      else (p.instrument_levels - v_legacy) || jsonb_build_object(v_target, p.instrument_levels -> v_legacy)
    end
  )
  where p.instrument_levels ? v_legacy;
  get diagnostics profiles_instrument_levels = row_count;

  update public.gig_requests g
  set wanted_instruments = (
    select coalesce(array_agg(d.v order by d.ord), '{}'::text[])
    from (
      select s.v, min(s.ord) as ord
      from (
        select case when u.v = v_legacy then v_target else u.v end as v, u.ord
        from unnest(g.wanted_instruments) with ordinality as u(v, ord)
      ) s
      group by s.v
    ) d
  )
  where v_legacy = any(g.wanted_instruments);
  get diagnostics gig_requests_wanted = row_count;

  update public.gig_requests g
  set filled_instruments = (
    select coalesce(array_agg(d.v order by d.ord), '{}'::text[])
    from (
      select s.v, min(s.ord) as ord
      from (
        select case when u.v = v_legacy then v_target else u.v end as v, u.ord
        from unnest(g.filled_instruments) with ordinality as u(v, ord)
      ) s
      group by s.v
    ) d
  )
  where v_legacy = any(g.filled_instruments);
  get diagnostics gig_requests_filled = row_count;

  -- Les candidatures portent l'instrument du poste : elles doivent suivre le SOS.
  update public.gig_applications
  set instrument = v_target
  where instrument = v_legacy;
  get diagnostics gig_applications_instrument = row_count;

  update public.group_members
  set role = v_target
  where role = v_legacy;
  get diagnostics group_members_role = row_count;

  update public.group_manual_members
  set role = v_target
  where role = v_legacy;
  get diagnostics group_manual_members_role = row_count;

  return next;
end;
$$;

revoke all on function private.normalize_legacy_saxophone() from public, anon, authenticated;

select * from private.normalize_legacy_saxophone();
