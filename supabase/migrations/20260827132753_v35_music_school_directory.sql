-- Dispo 2.4 / v35 — annuaire d'ecoles de musique et affiliations volontaires.
--
-- Une ecole n'est volontairement PAS un music_groups : un groupe musical a
-- un leader humain et sa suppression cascade depuis ce profil. Une communaute
-- d'ecole doit au contraire survivre au depart de n'importe quel membre.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.music_schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  short_name text check (short_name is null or length(btrim(short_name)) between 1 and 40),
  city text not null check (length(btrim(city)) between 1 and 100),
  country_code text not null default 'CH'
    check (country_code ~ '^[A-Z]{2}$'),
  website_url text check (website_url is null or length(website_url) <= 500),
  logo_url text check (logo_url is null or length(logo_url) <= 500),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.music_schools is
  'Annuaire curate des ecoles de musique. Les clients ne peuvent ni creer ni verifier une ecole.';
comment on column public.music_schools.is_verified is
  'Identite institutionnelle verifiee par Dispo, jamais par un abonnement Premium.';

create table public.music_school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.music_schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'alumni', 'staff', 'applicant', 'other')),
  role_label text
    check (role_label is null or length(btrim(role_label)) between 1 and 80),
  visibility text not null default 'school_only'
    check (visibility in ('profile', 'school_only', 'private')),
  status text not null default 'active'
    check (status in ('active', 'left', 'suspended')),
  verification_level text not null default 'self_declared'
    check (verification_level in ('self_declared', 'verified')),
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  left_at timestamptz,
  unique (school_id, profile_id),
  check ((status = 'left') = (left_at is not null)),
  check (status = 'active' or not is_primary)
);

comment on table public.music_school_memberships is
  'Affiliation volontaire. role est declaratif tant que verification_level vaut self_declared.';

create index music_school_memberships_profile_status_idx
  on public.music_school_memberships(profile_id, status, joined_at);
create index music_school_memberships_school_status_idx
  on public.music_school_memberships(school_id, status, joined_at, profile_id);
create unique index music_school_memberships_one_primary_idx
  on public.music_school_memberships(profile_id)
  where status = 'active' and is_primary;

create or replace function private.touch_school_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_school_updated_at() from public, anon, authenticated;

create trigger music_schools_touch_updated_at
before update on public.music_schools
for each row execute function private.touch_school_updated_at();

create trigger music_school_memberships_touch_updated_at
before update on public.music_school_memberships
for each row execute function private.touch_school_updated_at();

-- Defense en profondeur : meme une future voie serveur ne peut activer plus
-- de cinq ecoles sans changer explicitement cette regle versionnee.
create or replace function private.enforce_school_membership_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'active'
       or old.profile_id is distinct from new.profile_id
     )
  then
    perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text, 35001));
    if (
      select count(*)
      from public.music_school_memberships m
      where m.profile_id = new.profile_id
        and m.status = 'active'
        and m.id is distinct from new.id
    ) >= 5 then
      raise exception 'school_membership_limit_reached' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_school_membership_limit()
  from public, anon, authenticated;

create trigger music_school_memberships_01_limit
before insert or update of profile_id, status on public.music_school_memberships
for each row execute function private.enforce_school_membership_limit();

create or replace function private.is_active_school_member(
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.music_school_memberships m
    where m.school_id = p_school_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke all on function private.is_active_school_member(uuid)
  from public, anon;
grant execute on function private.is_active_school_member(uuid)
  to authenticated;

alter table public.music_schools enable row level security;
alter table public.music_school_memberships enable row level security;

create policy music_schools_select_active
on public.music_schools
for select to authenticated
using (is_active);

create policy music_school_memberships_select_visible
on public.music_school_memberships
for select to authenticated
using (
  (
    profile_id = (select auth.uid())
    or (
      status = 'active'
      and (
          visibility = 'profile'
        or (
          visibility = 'school_only'
          and private.is_active_school_member(school_id)
        )
      )
    )
  )
  and (
    profile_id = (select auth.uid())
    or not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = profile_id)
         or (b.blocker_id = profile_id and b.blocked_id = (select auth.uid()))
    )
  )
);

-- Les mutations passent exclusivement par les RPC ci-dessous. Cette
-- combinaison grants + RLS evite qu'un client s'auto-verifie ou se suspende.
revoke all on table public.music_schools from public, anon, authenticated;
revoke all on table public.music_school_memberships from public, anon, authenticated;
grant select on table public.music_schools to authenticated;
grant select on table public.music_school_memberships to authenticated;

create or replace function public.join_music_school(
  p_school_id uuid,
  p_role text default 'student',
  p_visibility text default 'school_only',
  p_role_label text default null
)
returns public.music_school_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.music_school_memberships%rowtype;
  v_result public.music_school_memberships%rowtype;
  v_make_primary boolean;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_role not in ('student', 'teacher', 'alumni', 'staff', 'applicant', 'other') then
    raise exception 'invalid_school_role' using errcode = '22023';
  end if;
  if p_visibility not in ('profile', 'school_only', 'private') then
    raise exception 'invalid_school_visibility' using errcode = '22023';
  end if;
  if p_role_label is not null and length(btrim(p_role_label)) not between 1 and 80 then
    raise exception 'invalid_school_role_label' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.music_schools s
    where s.id = p_school_id and s.is_active
  ) then
    raise exception 'school_not_available' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 35001));

  select * into v_existing
  from public.music_school_memberships m
  where m.school_id = p_school_id and m.profile_id = v_user
  for update;

  if v_existing.id is not null and v_existing.status = 'suspended' then
    raise exception 'school_membership_suspended' using errcode = '42501';
  end if;

  if (v_existing.id is null or v_existing.status <> 'active') and (
    select count(*) from public.music_school_memberships m
    where m.profile_id = v_user and m.status = 'active'
  ) >= 5 then
    raise exception 'school_membership_limit_reached' using errcode = '23514';
  end if;

  select not exists (
    select 1 from public.music_school_memberships m
    where m.profile_id = v_user and m.status = 'active' and m.is_primary
      and m.id is distinct from v_existing.id
  ) into v_make_primary;

  insert into public.music_school_memberships (
    school_id, profile_id, role, role_label, visibility, status,
    verification_level, is_primary, joined_at, left_at
  ) values (
    p_school_id, v_user, p_role, nullif(btrim(p_role_label), ''), p_visibility,
    'active', 'self_declared', v_make_primary, now(), null
  )
  on conflict (school_id, profile_id) do update
    set role = excluded.role,
        role_label = excluded.role_label,
        visibility = excluded.visibility,
        status = 'active',
        verification_level = case
          when public.music_school_memberships.status = 'active'
           and public.music_school_memberships.role = excluded.role
           and public.music_school_memberships.role_label
                 is not distinct from excluded.role_label
            then public.music_school_memberships.verification_level
          else 'self_declared'
        end,
        is_primary = excluded.is_primary,
        joined_at = case
          when public.music_school_memberships.status = 'active'
            then public.music_school_memberships.joined_at
          else now()
        end,
        left_at = null
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.leave_music_school(p_school_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_was_primary boolean := false;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 35001));

  select m.is_primary into v_was_primary
  from public.music_school_memberships m
  where m.school_id = p_school_id
    and m.profile_id = v_user
    and m.status = 'active'
  for update;

  if not found then
    return false;
  end if;

  update public.music_school_memberships m
  set status = 'left', left_at = now(), is_primary = false
  where m.school_id = p_school_id
    and m.profile_id = v_user
    and m.status = 'active';

  if v_was_primary then
    update public.music_school_memberships m
    set is_primary = true
    where m.id = (
      select candidate.id
      from public.music_school_memberships candidate
      where candidate.profile_id = v_user and candidate.status = 'active'
      order by candidate.joined_at, candidate.id
      limit 1
    );
  end if;
  return true;
end;
$$;

-- channel_id est volontairement NULL dans v35. v36 conserve exactement ce
-- contrat et le remplit apres creation du canal institutionnel.
create or replace function public.my_music_schools()
returns table (
  school_id uuid,
  slug text,
  name text,
  short_name text,
  city text,
  country_code text,
  logo_url text,
  is_verified boolean,
  membership_id uuid,
  role text,
  role_label text,
  visibility text,
  verification_level text,
  is_primary boolean,
  joined_at timestamptz,
  channel_id uuid,
  member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.name, s.short_name, s.city, s.country_code,
         s.logo_url, s.is_verified, m.id, m.role, m.role_label, m.visibility,
         m.verification_level, m.is_primary, m.joined_at, null::uuid,
         (select count(*) from public.music_school_memberships count_m
          where count_m.school_id = s.id and count_m.status = 'active')
  from public.music_school_memberships m
  join public.music_schools s on s.id = m.school_id
  where m.profile_id = (select auth.uid())
    and m.status = 'active'
    and s.is_active
  order by m.is_primary desc, s.name, s.id;
$$;

create or replace function public.music_school_members(p_school_id uuid)
returns table (
  profile_id uuid,
  name text,
  photo_url text,
  instruments text[],
  level text,
  role text,
  role_label text,
  verification_level text,
  is_primary boolean,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.photo_url, p.instruments, p.level,
         m.role, m.role_label, m.verification_level, m.is_primary, m.joined_at
  from public.music_school_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.school_id = p_school_id
    and m.status = 'active'
    and private.is_active_school_member(p_school_id)
    and (m.visibility <> 'private' or m.profile_id = (select auth.uid()))
    and (
      m.profile_id = (select auth.uid())
      or not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = m.profile_id)
           or (b.blocker_id = m.profile_id and b.blocked_id = (select auth.uid()))
      )
    )
  order by p.name, p.id;
$$;

create or replace function public.profile_music_schools(p_profile_id uuid)
returns table (
  profile_id uuid,
  school_id uuid,
  membership_id uuid,
  slug text,
  name text,
  short_name text,
  city text,
  logo_url text,
  is_verified boolean,
  role text,
  role_label text,
  visibility text,
  verification_level text,
  is_primary boolean,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id, s.id, m.id, s.slug, s.name, s.short_name, s.city,
         s.logo_url, s.is_verified, m.role, m.role_label,
         m.visibility, m.verification_level, m.is_primary, m.joined_at
  from public.music_school_memberships m
  join public.music_schools s on s.id = m.school_id and s.is_active
  where m.profile_id = p_profile_id
    and m.status = 'active'
    and (
      m.profile_id = (select auth.uid())
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = m.profile_id)
           or (b.blocker_id = m.profile_id and b.blocked_id = (select auth.uid()))
      )
    )
    and (
      m.profile_id = (select auth.uid())
      or m.visibility = 'profile'
      or (
        m.visibility = 'school_only'
        and private.is_active_school_member(m.school_id)
      )
    )
  order by m.is_primary desc, s.name, s.id;
$$;

-- Variante bulk pour hydrater les cartes de profils sans une RPC par profil.
create or replace function public.visible_profile_music_schools()
returns table (
  profile_id uuid,
  school_id uuid,
  membership_id uuid,
  slug text,
  name text,
  short_name text,
  city text,
  logo_url text,
  is_verified boolean,
  role text,
  role_label text,
  visibility text,
  verification_level text,
  is_primary boolean,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id, s.id, m.id, s.slug, s.name, s.short_name, s.city,
         s.logo_url, s.is_verified, m.role, m.role_label,
         m.visibility, m.verification_level, m.is_primary, m.joined_at
  from public.music_school_memberships m
  join public.music_schools s on s.id = m.school_id and s.is_active
  where m.status = 'active'
    and (
      m.profile_id = (select auth.uid())
      or not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = m.profile_id)
           or (b.blocker_id = m.profile_id and b.blocked_id = (select auth.uid()))
      )
    )
    and (
      m.profile_id = (select auth.uid())
      or m.visibility = 'profile'
      or (
        m.visibility = 'school_only'
        and private.is_active_school_member(m.school_id)
      )
    )
  order by m.profile_id, m.is_primary desc, s.name, s.id;
$$;

revoke all on function public.join_music_school(uuid, text, text, text)
  from public, anon;
revoke all on function public.leave_music_school(uuid) from public, anon;
revoke all on function public.my_music_schools() from public, anon;
revoke all on function public.music_school_members(uuid) from public, anon;
revoke all on function public.profile_music_schools(uuid) from public, anon;
revoke all on function public.visible_profile_music_schools() from public, anon;
grant execute on function public.join_music_school(uuid, text, text, text)
  to authenticated;
grant execute on function public.leave_music_school(uuid) to authenticated;
grant execute on function public.my_music_schools() to authenticated;
grant execute on function public.music_school_members(uuid) to authenticated;
grant execute on function public.profile_music_schools(uuid) to authenticated;
grant execute on function public.visible_profile_music_schools() to authenticated;

-- Annuaire initial demande par le produit. Les fiches restent explicitement
-- non verifiees tant que Dispo n'a pas controle l'identite institutionnelle.
insert into public.music_schools (
  slug, name, short_name, city, country_code, website_url,
  is_verified, is_active
) values
  (
    'amr-geneve', 'AMR Genève', 'AMR', 'Genève', 'CH',
    'https://www.amr-geneve.ch/', false, true
  ),
  (
    'epi-geneve', 'EPI Genève', 'EPI', 'Genève', 'CH',
    'https://www.epi-musique.ch/', false, true
  ),
  (
    'hem-geneve', 'HEM Genève', 'HEM', 'Genève', 'CH',
    'https://www.hesge.ch/hem/', false, true
  )
on conflict (slug) do nothing;
