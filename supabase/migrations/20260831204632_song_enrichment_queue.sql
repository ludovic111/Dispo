-- Enrichissement serveur du catalogue de morceaux.
--
-- La file, le cache negatif et le journal de debit vivent dans le schema
-- prive. Le client authentifie peut seulement demander l'enrichissement d'un
-- morceau canonique precis ; seul le service_role peut claim/finaliser un lot.
-- Aucune cle Musicfetch n'est stockee en base ou dans cette migration.

create extension if not exists pgcrypto with schema extensions;

-- Deux enregistrements Apple distincts peuvent partager artiste et titre. La
-- contrainte texte ne doit donc couvrir que les entrees sans identifiant public.
drop index if exists public.song_catalog_text_fallback_unique;
create unique index song_catalog_text_fallback_unique
  on public.song_catalog(normalized_artist, normalized_title)
  where normalized_isrc is null
    and nullif(platform_ids ->> 'appleMusic', '') is null;
create unique index if not exists song_catalog_apple_music_id_unique
  on public.song_catalog((platform_ids ->> 'appleMusic'))
  where nullif(platform_ids ->> 'appleMusic', '') is not null;

-- Une identité candidate issue d'un snapshot client reste invisible jusqu'à
-- ce qu'un fournisseur ait confirmé la piste et rempli ses métadonnées.
drop policy if exists song_catalog_authenticated_read on public.song_catalog;
create policy song_catalog_authenticated_read
on public.song_catalog
for select
to authenticated
using (
  (select auth.uid()) is not null
  and metadata_source is distinct from 'identity-candidate'
);
drop policy if exists song_platform_links_authenticated_read
  on public.song_platform_links;
create policy song_platform_links_authenticated_read
on public.song_platform_links
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.song_catalog c
    where c.id = song_platform_links.song_id
      and c.metadata_source is distinct from 'identity-candidate'
  )
);

create table if not exists private.song_enrichment_jobs (
  song_id uuid primary key references public.song_catalog(id) on delete cascade,
  state text not null default 'pending' check (
    state in ('pending', 'processing', 'complete', 'negative', 'dead')
  ),
  priority smallint not null default 0 check (priority between 0 and 100),
  attempts smallint not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  claim_id uuid,
  claimed_at timestamptz,
  negative_until timestamptz,
  refresh_after timestamptz,
  last_requested_by uuid references auth.users(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_enrichment_jobs_claim_pair check (
    (claim_id is null and claimed_at is null)
    or (claim_id is not null and claimed_at is not null)
  ),
  constraint song_enrichment_jobs_state_dates check (
    (state <> 'processing' or claim_id is not null)
    and (state <> 'negative' or negative_until is not null)
    and (state <> 'complete' or refresh_after is not null)
  )
);

create index if not exists song_enrichment_jobs_ready_idx
  on private.song_enrichment_jobs(priority desc, next_attempt_at, song_id)
  where state in ('pending', 'processing', 'complete', 'negative');

-- Journal court utilise uniquement pour faire respecter le plafond global de
-- cinq appels HTTP fournisseur dans toute fenetre glissante de soixante
-- secondes. Une reservation est faite juste avant chaque appel, pas au claim :
-- Odesli et l'enrichissement Musicfetch optionnel partagent donc le plafond.
create table if not exists private.song_enrichment_rate_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.song_catalog(id) on delete cascade,
  started_at timestamptz not null default clock_timestamp()
);
create index if not exists song_enrichment_rate_events_started_idx
  on private.song_enrichment_rate_events(started_at);

-- Les demandes utilisateur servent uniquement a borner les abus de cout. Elles
-- sont purgees apres vingt-quatre heures et ne sont jamais exposees au client.
create table if not exists private.song_enrichment_user_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.song_catalog(id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp()
);
create index if not exists song_enrichment_user_requests_actor_idx
  on private.song_enrichment_user_requests(user_id, requested_at desc);
create index if not exists song_enrichment_user_requests_requested_idx
  on private.song_enrichment_user_requests(requested_at);

revoke all on table private.song_enrichment_jobs
  from public, anon, authenticated;
revoke all on table private.song_enrichment_rate_events
  from public, anon, authenticated;
revoke all on table private.song_enrichment_user_requests
  from public, anon, authenticated;

create or replace function private.enqueue_song_enrichment_internal(
  p_song_id uuid,
  p_requested_by uuid default null,
  p_priority smallint default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_job private.song_enrichment_jobs%rowtype;
begin
  if p_song_id is null then
    return false;
  end if;
  if not exists (
    select 1
    from public.song_catalog c
    where c.id = p_song_id
      and (
        c.normalized_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
        or exists (
          select 1
          from public.song_platform_links l
          where l.song_id = c.id
            and l.platform = 'appleMusic'
            and private.is_official_song_platform_url(l.platform, l.url)
        )
      )
  ) then
    return false;
  end if;

  insert into private.song_enrichment_jobs (
    song_id, state, priority, next_attempt_at, last_requested_by
  ) values (
    p_song_id,
    'pending',
    least(greatest(coalesce(p_priority, 0), 0), 100),
    v_now,
    p_requested_by
  )
  on conflict (song_id) do nothing;
  if found then
    return true;
  end if;

  select * into v_job
  from private.song_enrichment_jobs j
  where j.song_id = p_song_id
  for update;

  if v_job.state in ('pending', 'processing')
    or (v_job.state = 'negative' and v_job.negative_until > v_now)
    or (v_job.state = 'complete' and v_job.refresh_after > v_now)
  then
    update private.song_enrichment_jobs j
    set priority = greatest(
          j.priority,
          least(greatest(coalesce(p_priority, 0), 0), 100)
        ),
        last_requested_by = coalesce(p_requested_by, j.last_requested_by),
        updated_at = v_now
    where j.song_id = p_song_id;
    return false;
  end if;

  update private.song_enrichment_jobs j
  set state = 'pending',
      priority = greatest(
        j.priority,
        least(greatest(coalesce(p_priority, 0), 0), 100)
      ),
      attempts = case when j.state = 'dead' then 0 else j.attempts end,
      next_attempt_at = v_now,
      claim_id = null,
      claimed_at = null,
      negative_until = null,
      refresh_after = null,
      last_requested_by = coalesce(p_requested_by, j.last_requested_by),
      last_error = null,
      updated_at = v_now
  where j.song_id = p_song_id;
  return true;
end;
$$;

revoke all on function private.enqueue_song_enrichment_internal(
  uuid, uuid, smallint
) from public, anon, authenticated;

create or replace function public.enqueue_song_enrichment(p_song_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_song_id is null or not exists (
    select 1 from public.song_catalog c where c.id = p_song_id
  ) then
    raise exception 'song_not_found' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('song-enrichment-user:' || v_actor::text, 0)
  );
  delete from private.song_enrichment_user_requests r
  where r.requested_at < v_now - interval '24 hours';

  if exists (
    select 1
    from private.song_enrichment_user_requests r
    where r.user_id = v_actor
      and r.song_id = p_song_id
      and r.requested_at >= v_now - interval '5 minutes'
  ) then
    return false;
  end if;
  if (
    select count(*)
    from private.song_enrichment_user_requests r
    where r.user_id = v_actor
      and r.requested_at >= v_now - interval '1 hour'
  ) >= 20 then
    raise exception 'song_enrichment_rate_limited' using errcode = 'P0001';
  end if;

  insert into private.song_enrichment_user_requests(user_id, song_id)
  values (v_actor, p_song_id);
  perform private.enqueue_song_enrichment_internal(
    p_song_id, v_actor, 50::smallint
  );
  -- `true` signifie « première demande utilisateur de la fenêtre » : même si
  -- un trigger avait déjà créé le job pending, le handler doit lancer une fois
  -- le worker ciblé. Un doublon dans les cinq minutes retourne `false`.
  return true;
end;
$$;

revoke all on function public.enqueue_song_enrichment(uuid)
  from public, anon;
grant execute on function public.enqueue_song_enrichment(uuid)
  to authenticated;

create or replace function private.song_catalog_apple_track_id_from_url(
  p_url text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_match text[];
begin
  if not private.is_official_song_platform_url('appleMusic', p_url) then
    return null;
  end if;
  v_match := regexp_match(
    p_url, '[?&]i=([0-9]{1,20})(&|#|$)', 'i'
  );
  if v_match is not null then return v_match[1]; end if;
  v_match := regexp_match(
    p_url, '/song/([^/?#]+/)*([0-9]{1,20})([/?#]|$)', 'i'
  );
  if v_match is not null then return v_match[2]; end if;
  return null;
end;
$$;

revoke all on function private.song_catalog_apple_track_id_from_url(text)
  from public, anon, authenticated;

create or replace function private.song_platform_external_id(
  p_platform text,
  p_url text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_match text[];
begin
  if not private.is_official_song_platform_url(p_platform, p_url) then
    return null;
  end if;
  case p_platform
    when 'appleMusic' then
      return private.song_catalog_apple_track_id_from_url(p_url);
    when 'spotify' then
      v_match := regexp_match(
        p_url,
        '^https://open[.]spotify[.]com/track/([A-Za-z0-9]{10,64})([/?#]|$)',
        'i'
      );
    when 'youtubeMusic' then
      v_match := regexp_match(
        p_url,
        '^https://music[.]youtube[.]com/watch[?][^#]*[?&]?v=([A-Za-z0-9_-]{6,32})(&|#|$)',
        'i'
      );
      if v_match is null then
        v_match := regexp_match(
          p_url, '[?&]v=([A-Za-z0-9_-]{6,32})(&|#|$)', 'i'
        );
      end if;
    when 'deezer' then
      v_match := regexp_match(
        p_url,
        '^https://(www[.])?deezer[.]com/track/([0-9]{1,24})([/?#]|$)',
        'i'
      );
      if v_match is not null then return v_match[2]; end if;
    when 'tidal' then
      v_match := regexp_match(
        p_url,
        '^https://(listen[.])?tidal[.]com/track/([0-9]{1,24})([/?#]|$)',
        'i'
      );
      if v_match is not null then return v_match[2]; end if;
    when 'amazonMusic' then
      v_match := regexp_match(
        p_url, '[?&]trackAsin=([A-Za-z0-9]{8,20})(&|#|$)', 'i'
      );
      if v_match is null then
        v_match := regexp_match(
          p_url, '/tracks/([A-Za-z0-9]{8,20})([/?#]|$)', 'i'
        );
      end if;
    else
      return null;
  end case;
  return case when v_match is not null then v_match[1] end;
end;
$$;

revoke all on function private.song_platform_external_id(text, text)
  from public, anon, authenticated;

-- La migration catalogue précédente amorce ses lignes depuis des JSON écrits
-- par les membres. Avant d'exposer ce nouvel objet en production, on réduit
-- donc cet amorçage à l'identité vérifiable seulement. Les titres, artistes,
-- artworks, métriques et liens non Apple seront republiés après fournisseur.
delete from public.song_platform_links l
using public.song_catalog c
where c.id = l.song_id
  and (
    l.platform <> 'appleMusic'
    or private.song_platform_external_id(l.platform, l.url) is null
    or (
      nullif(c.platform_ids ->> 'appleMusic', '') is not null
      and c.platform_ids ->> 'appleMusic'
        <> private.song_platform_external_id(l.platform, l.url)
    )
  );

with verified_apple as (
  select distinct on (l.song_id)
    l.song_id,
    private.song_platform_external_id(l.platform, l.url) as apple_id
  from public.song_platform_links l
  where l.platform = 'appleMusic'
    and private.song_platform_external_id(l.platform, l.url) is not null
  order by l.song_id, l.checked_at desc
)
update public.song_catalog c
set platform_ids = case
      when coalesce(
        nullif(c.platform_ids ->> 'appleMusic', ''),
        verified_apple.apple_id
      ) ~ '^[0-9]{1,20}$'
      then jsonb_build_object(
        'appleMusic',
        coalesce(
          nullif(c.platform_ids ->> 'appleMusic', ''),
          verified_apple.apple_id
        )
      )
      else '{}'::jsonb
    end,
    isrc = case
      when coalesce(
        nullif(c.platform_ids ->> 'appleMusic', ''),
        verified_apple.apple_id
      ) is null then c.isrc
    end,
    title = case
      when coalesce(
        nullif(c.platform_ids ->> 'appleMusic', ''),
        verified_apple.apple_id
      ) is not null
      then 'Apple Music ' || coalesce(
        nullif(c.platform_ids ->> 'appleMusic', ''),
        verified_apple.apple_id
      )
      else 'ISRC ' || coalesce(c.normalized_isrc, c.id::text)
    end,
    artist = '',
    composer = null,
    album_title = null,
    artwork_url = null,
    musical_key = null,
    tempo_bpm = null,
    duration_ms = null,
    genres = '{}'::text[],
    release_year = null,
    metadata_source = 'identity-candidate',
    metadata_updated_at = null
from verified_apple
where verified_apple.song_id = c.id;

-- Inclut aussi les candidates ISRC sans URL Apple dans la réduction ci-dessus.
update public.song_catalog c
set platform_ids = case
      when nullif(c.platform_ids ->> 'appleMusic', '') ~ '^[0-9]{1,20}$'
      then jsonb_build_object(
        'appleMusic', c.platform_ids ->> 'appleMusic'
      )
      else '{}'::jsonb
    end,
    isrc = case
      when nullif(c.platform_ids ->> 'appleMusic', '') is null then c.isrc
    end,
    title = case
      when nullif(c.platform_ids ->> 'appleMusic', '') is not null
      then 'Apple Music ' || (c.platform_ids ->> 'appleMusic')
      else 'ISRC ' || coalesce(c.normalized_isrc, c.id::text)
    end,
    artist = '',
    composer = null,
    album_title = null,
    artwork_url = null,
    musical_key = null,
    tempo_bpm = null,
    duration_ms = null,
    genres = '{}'::text[],
    release_year = null,
    metadata_source = 'identity-candidate',
    metadata_updated_at = null
where c.metadata_source is distinct from 'identity-candidate';

delete from public.song_platform_links l
using public.song_catalog c
where c.id = l.song_id
  and (
    l.platform <> 'appleMusic'
    or private.song_platform_external_id(l.platform, l.url)
      is distinct from c.platform_ids ->> 'appleMusic'
  );
update public.song_platform_links l
set external_id = private.song_platform_external_id(l.platform, l.url),
    source = 'identity-candidate',
    match_kind = 'exact',
    checked_at = clock_timestamp(),
    updated_at = clock_timestamp()
where l.platform = 'appleMusic';

-- Synchronisation progressive : seules les fiches possedant un ISRC valide ou
-- un identifiant Apple numerique rejoignent le catalogue global. Un morceau
-- manuel reste exclusivement dans le JSON prive de son groupe.
create or replace function private.sync_song_catalog_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_isrc text;
  v_canonical_id uuid;
  v_catalog_apple_id text;
  v_platform_apple_id text;
  v_url_apple_id text;
  v_apple_id text;
  v_catalog_id uuid;
  v_track_url text;
begin
  if jsonb_typeof(p_payload) <> 'object' then return null; end if;
  v_isrc := private.song_catalog_snapshot_isrc(p_payload);
  v_canonical_id := private.song_catalog_canonical_uuid(
    p_payload ->> 'canonical_song_id'
  );
  v_catalog_apple_id := private.song_catalog_apple_id(p_payload);
  if jsonb_typeof(p_payload -> 'platform_ids') = 'object'
    and nullif(p_payload -> 'platform_ids' ->> 'appleMusic', '') is not null
  then
    if p_payload -> 'platform_ids' ->> 'appleMusic' !~ '^[0-9]{1,20}$' then
      return null;
    end if;
    v_platform_apple_id := p_payload -> 'platform_ids' ->> 'appleMusic';
  end if;
  v_track_url := coalesce(
    nullif(btrim(p_payload ->> 'track_url'), ''),
    case when jsonb_typeof(p_payload -> 'platform_links') = 'object'
      then nullif(btrim(
        p_payload -> 'platform_links' ->> 'appleMusic'
      ), '') end
  );
  if v_track_url is not null then
    v_url_apple_id := private.song_catalog_apple_track_id_from_url(v_track_url);
    if v_url_apple_id is null then return null; end if;
  end if;
  if (v_catalog_apple_id is not null and v_platform_apple_id is not null
      and v_catalog_apple_id <> v_platform_apple_id)
    or (v_catalog_apple_id is not null and v_url_apple_id is not null
      and v_catalog_apple_id <> v_url_apple_id)
    or (v_platform_apple_id is not null and v_url_apple_id is not null
      and v_platform_apple_id <> v_url_apple_id)
  then
    return null;
  end if;
  v_apple_id := coalesce(
    v_url_apple_id, v_catalog_apple_id, v_platform_apple_id
  );

  if v_canonical_id is not null then
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.id = v_canonical_id
      and (v_isrc is null or c.normalized_isrc = v_isrc)
      and (
        v_apple_id is null
        or c.platform_ids ->> 'appleMusic' = v_apple_id
      )
    limit 1;
    if v_catalog_id is null then return null; end if;
  elsif v_isrc is not null then
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.normalized_isrc = v_isrc
      and (
        v_apple_id is null
        or c.platform_ids ->> 'appleMusic' = v_apple_id
      )
    limit 1;
    if v_catalog_id is null then return null; end if;
  elsif v_apple_id is not null then
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.platform_ids ->> 'appleMusic' = v_apple_id
    limit 1;
  end if;
  -- Une nouvelle identité ne reçoit aucune métadonnée client. Elle reste
  -- cachée par RLS jusqu'à confirmation Odesli/Musicfetch. Une URL Apple
  -- directe et cohérente est obligatoire pour rendre la piste vérifiable.
  if v_catalog_id is null and v_url_apple_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'song-catalog-apple:' || v_url_apple_id, 0
      )
    );
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.platform_ids ->> 'appleMusic' = v_url_apple_id
    limit 1;
    if v_catalog_id is null then
      insert into public.song_catalog (
        title, artist, platform_ids, metadata_source, metadata_updated_at
      ) values (
        'Apple Music ' || v_url_apple_id,
        '',
        jsonb_build_object('appleMusic', v_url_apple_id),
        'identity-candidate',
        null
      )
      returning id into v_catalog_id;
    end if;
    insert into public.song_platform_links (
      song_id, platform, market, url, external_id, source, match_kind, checked_at
    ) values (
      v_catalog_id, 'appleMusic', 'CH', v_track_url, v_url_apple_id,
      'identity-candidate', 'exact', clock_timestamp()
    )
    on conflict (song_id, platform, market) do update
    set url = excluded.url,
        external_id = excluded.external_id,
        source = excluded.source,
        checked_at = excluded.checked_at,
        updated_at = clock_timestamp()
    where public.song_platform_links.source = 'identity-candidate';
  end if;
  if v_catalog_id is null then return null; end if;

  perform private.enqueue_song_enrichment_internal(
    v_catalog_id, null, 10::smallint
  );
  return v_catalog_id;
end;
$$;

revoke all on function private.sync_song_catalog_snapshot(jsonb)
  from public, anon, authenticated;

-- Permet au client de sélectionner une piste iTunes qui n'est pas encore au
-- catalogue sans jamais envoyer son titre, son artiste ou son artwork dans le
-- catalogue global. L'identité reste cachée jusqu'à la réponse fournisseur.
create or replace function public.enqueue_song_enrichment_candidate(
  p_apple_url text,
  p_apple_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_song_id uuid;
  v_now timestamptz := clock_timestamp();
  v_queued boolean;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_apple_id !~ '^[0-9]{1,20}$'
    or private.song_catalog_apple_track_id_from_url(p_apple_url)
      is distinct from p_apple_id
  then
    raise exception 'invalid_apple_track_identity' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('song-enrichment-user:' || v_actor::text, 0)
  );
  delete from private.song_enrichment_user_requests r
  where r.requested_at < v_now - interval '24 hours';
  if (
    select count(*) from private.song_enrichment_user_requests r
    where r.user_id = v_actor
      and r.requested_at >= v_now - interval '1 hour'
  ) >= 20 then
    raise exception 'song_enrichment_rate_limited' using errcode = 'P0001';
  end if;
  v_song_id := private.sync_song_catalog_snapshot(jsonb_build_object(
    'catalog_id', 'apple:' || p_apple_id,
    'platform_ids', jsonb_build_object('appleMusic', p_apple_id),
    'track_url', p_apple_url
  ));
  if v_song_id is null then
    raise exception 'candidate_creation_failed' using errcode = 'P0001';
  end if;
  v_queued := public.enqueue_song_enrichment(v_song_id);
  return jsonb_build_object('song_id', v_song_id, 'queued', v_queued);
end;
$$;

revoke all on function public.enqueue_song_enrichment_candidate(text, text)
  from public, anon;
grant execute on function public.enqueue_song_enrichment_candidate(text, text)
  to authenticated;

create or replace function private.sync_song_catalog_snapshots(p_songs jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_songs) <> 'array' then return 0; end if;
  for v_payload in select value from jsonb_array_elements(p_songs)
  loop
    if private.sync_song_catalog_snapshot(v_payload) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.sync_song_catalog_snapshots(jsonb)
  from public, anon, authenticated;

create or replace function private.sync_group_repertoire_song_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_song_catalog_snapshots(new.repertoire);
  return new;
end;
$$;
create or replace function private.sync_event_setlist_song_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_song_catalog_snapshots(new.setlist);
  return new;
end;
$$;
revoke all on function private.sync_group_repertoire_song_catalog()
  from public, anon, authenticated;
revoke all on function private.sync_event_setlist_song_catalog()
  from public, anon, authenticated;

drop trigger if exists music_groups_90_sync_song_catalog on public.music_groups;
create trigger music_groups_90_sync_song_catalog
after insert or update of repertoire on public.music_groups
for each row execute function private.sync_group_repertoire_song_catalog();
drop trigger if exists group_events_90_sync_song_catalog on public.group_events;
create trigger group_events_90_sync_song_catalog
after insert or update of setlist on public.group_events
for each row execute function private.sync_event_setlist_song_catalog();

create or replace function public.claim_song_enrichment_jobs(
  p_claim_id uuid,
  p_limit integer default 5,
  p_song_id uuid default null
)
returns table (
  song_id uuid,
  title text,
  artist text,
  isrc text,
  apple_id text,
  apple_url text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer;
begin
  if p_claim_id is null then
    raise exception 'invalid_claim_id' using errcode = '22023';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 5), 1), 5);

  return query
  with candidates as materialized (
    select j.song_id
    from private.song_enrichment_jobs j
    join public.song_catalog c on c.id = j.song_id
    where j.attempts < 8
      and j.next_attempt_at <= v_now
      and (
        j.state = 'pending'
        or (j.state = 'processing' and j.claimed_at < v_now - interval '5 minutes')
        or (j.state = 'complete' and j.refresh_after <= v_now)
        or (j.state = 'negative' and j.negative_until <= v_now)
      )
      and (
        c.normalized_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
        or exists (
          select 1 from public.song_platform_links l
          where l.song_id = c.id and l.platform = 'appleMusic'
        )
      )
      and (p_song_id is null or j.song_id = p_song_id)
    order by j.priority desc, j.next_attempt_at, j.song_id
    for update of j skip locked
    limit v_limit
  ), claimed as (
    update private.song_enrichment_jobs j
    set state = 'processing',
        attempts = j.attempts + 1,
        claim_id = p_claim_id,
        claimed_at = v_now,
        negative_until = null,
        refresh_after = null,
        updated_at = v_now
    from candidates c
    where j.song_id = c.song_id
    returning j.song_id, j.attempts
  )
  select
    c.id,
    c.title,
    c.artist,
    c.normalized_isrc,
    nullif(c.platform_ids ->> 'appleMusic', ''),
    apple.url,
    claimed.attempts::integer
  from claimed
  join public.song_catalog c on c.id = claimed.song_id
  left join lateral (
    select l.url
    from public.song_platform_links l
    where l.song_id = c.id
      and l.platform = 'appleMusic'
      and l.market in ('CH', 'ZZ')
      and private.is_official_song_platform_url(l.platform, l.url)
    order by case l.market when 'CH' then 0 else 1 end, l.checked_at desc
    limit 1
  ) apple on true
  order by claimed.song_id;
end;
$$;

revoke all on function public.claim_song_enrichment_jobs(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_song_enrichment_jobs(uuid, integer, uuid)
  to service_role;

create or replace function public.reserve_song_enrichment_provider_call(
  p_song_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_song_id is null or not exists (
    select 1 from private.song_enrichment_jobs j
    where j.song_id = p_song_id and j.state = 'processing'
  ) then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('song-enrichment-provider-rate', 0)
  );
  delete from private.song_enrichment_rate_events e
  where e.started_at < v_now - interval '24 hours';
  if (
    select count(*) from private.song_enrichment_rate_events e
    where e.started_at > v_now - interval '60 seconds'
  ) >= 5 then
    return false;
  end if;
  insert into private.song_enrichment_rate_events(song_id, started_at)
  values (p_song_id, v_now);
  return true;
end;
$$;

revoke all on function public.reserve_song_enrichment_provider_call(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_song_enrichment_provider_call(uuid)
  to service_role;

create or replace function private.song_snapshot_matches_catalog(
  p_snapshot jsonb,
  p_song_id uuid,
  p_normalized_isrc text,
  p_apple_id text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  with identity as (
    select
      private.song_catalog_canonical_uuid(
        p_snapshot ->> 'canonical_song_id'
      ) as canonical_id,
      private.song_catalog_snapshot_isrc(p_snapshot) as normalized_isrc,
      private.song_catalog_apple_id(p_snapshot) as catalog_apple_id,
      case when jsonb_typeof(p_snapshot -> 'platform_ids') = 'object'
        then nullif(p_snapshot -> 'platform_ids' ->> 'appleMusic', '')
      end as platform_apple_id,
      coalesce(
        nullif(btrim(p_snapshot ->> 'track_url'), ''),
        case when jsonb_typeof(p_snapshot -> 'platform_links') = 'object'
          then nullif(btrim(
            p_snapshot -> 'platform_links' ->> 'appleMusic'
          ), '')
        end
      ) as apple_url
  )
  select jsonb_typeof(p_snapshot) = 'object'
    and (
      canonical_id is not null
      or normalized_isrc is not null
      or catalog_apple_id is not null
      or platform_apple_id is not null
      or apple_url is not null
    )
    and (canonical_id is null or canonical_id = p_song_id)
    and (
      normalized_isrc is null
      or (
        p_normalized_isrc is not null
        and normalized_isrc = p_normalized_isrc
      )
    )
    and (
      catalog_apple_id is null
      or (p_apple_id is not null and catalog_apple_id = p_apple_id)
    )
    and (
      platform_apple_id is null
      or (
        platform_apple_id ~ '^[0-9]{1,20}$'
        and p_apple_id is not null
        and platform_apple_id = p_apple_id
      )
    )
    and (
      apple_url is null
      or (
        p_apple_id is not null
        and private.song_catalog_apple_track_id_from_url(apple_url) = p_apple_id
      )
    )
    and not (
      lower(btrim(coalesce(p_snapshot ->> 'catalog_id', '')))
        like 'apple:%'
      and catalog_apple_id is null
    )
  from identity;
$$;

revoke all on function private.song_snapshot_matches_catalog(
  jsonb, uuid, text, text
) from public, anon, authenticated;

-- Fusionne seulement les champs canoniques partageables. Les champs
-- d'arrangement du groupe (titre libre, artiste, forme, accords, solos,
-- annotations et iReal Pro) restent byte-for-byte ceux du snapshot existant.
create or replace function private.merge_song_enrichment_snapshot(
  p_snapshot jsonb,
  p_catalog jsonb,
  p_links jsonb
)
returns jsonb
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  v_result jsonb := p_snapshot;
  v_existing_ids jsonb := case
    when jsonb_typeof(p_snapshot -> 'platform_ids') = 'object'
      then p_snapshot -> 'platform_ids' else '{}'::jsonb end;
  v_existing_links jsonb := case
    when jsonb_typeof(p_snapshot -> 'platform_links') = 'object'
      then p_snapshot -> 'platform_links' else '{}'::jsonb end;
  v_catalog_ids jsonb := case
    when jsonb_typeof(p_catalog -> 'platform_ids') = 'object'
      then p_catalog -> 'platform_ids' else '{}'::jsonb end;
  v_merged_links jsonb := v_existing_links || coalesce(p_links, '{}'::jsonb);
  v_first_genre text;
begin
  if jsonb_typeof(p_snapshot) <> 'object' then return p_snapshot; end if;
  v_result := v_result || jsonb_build_object(
    'canonical_song_id', p_catalog ->> 'id',
    'platform_ids', v_existing_ids || v_catalog_ids,
    'platform_links', v_merged_links
  );
  if nullif(btrim(v_result ->> 'isrc'), '') is null
    and nullif(btrim(p_catalog ->> 'isrc'), '') is not null
  then v_result := v_result || jsonb_build_object('isrc', p_catalog ->> 'isrc');
  end if;
  if nullif(v_catalog_ids ->> 'appleMusic', '') is not null then
    v_result := v_result || jsonb_build_object(
      'catalog_id', 'apple:' || (v_catalog_ids ->> 'appleMusic')
    );
  end if;
  if nullif(v_merged_links ->> 'appleMusic', '') is not null then
    v_result := v_result || jsonb_build_object(
      'track_url', v_merged_links ->> 'appleMusic'
    );
  end if;
  if nullif(btrim(v_result ->> 'key'), '') is null
    and nullif(btrim(p_catalog ->> 'musical_key'), '') is not null
  then
    v_result := v_result || jsonb_build_object(
      'key', p_catalog ->> 'musical_key'
    );
  end if;
  if nullif(btrim(v_result ->> 'tempo_bpm'), '') is null
    and jsonb_typeof(p_catalog -> 'tempo_bpm') = 'number'
  then
    v_result := v_result || jsonb_build_object(
      'tempo_bpm', p_catalog -> 'tempo_bpm'
    );
  end if;
  if nullif(btrim(p_catalog ->> 'artwork_url'), '') is not null then
    v_result := v_result || jsonb_build_object(
      'artwork_url', p_catalog ->> 'artwork_url'
    );
  end if;
  if nullif(btrim(p_catalog ->> 'album_title'), '') is not null then
    v_result := v_result || jsonb_build_object(
      'album_title', p_catalog ->> 'album_title'
    );
  end if;
  if jsonb_typeof(p_catalog -> 'duration_ms') = 'number' then
    v_result := v_result || jsonb_build_object(
      'duration_ms', p_catalog -> 'duration_ms'
    );
  end if;
  if jsonb_typeof(p_catalog -> 'release_year') = 'number' then
    v_result := v_result || jsonb_build_object(
      'release_year', p_catalog -> 'release_year'
    );
  end if;
  if jsonb_typeof(p_catalog -> 'genres') = 'array' then
    select value into v_first_genre
    from jsonb_array_elements_text(p_catalog -> 'genres') genre(value)
    where nullif(btrim(value), '') is not null
    limit 1;
    if v_first_genre is not null then
      v_result := v_result || jsonb_build_object('genre', v_first_genre);
    end if;
  end if;
  if nullif(btrim(p_catalog ->> 'metadata_source'), '') is not null then
    v_result := v_result || jsonb_build_object(
      'metadata_source', p_catalog ->> 'metadata_source'
    );
  end if;
  if p_catalog -> 'metadata_updated_at' is not null
    and jsonb_typeof(p_catalog -> 'metadata_updated_at') = 'string'
  then
    v_result := v_result || jsonb_build_object(
      'metadata_updated_at', p_catalog -> 'metadata_updated_at'
    );
  end if;
  return v_result;
end;
$$;

revoke all on function private.merge_song_enrichment_snapshot(
  jsonb, jsonb, jsonb
) from public, anon, authenticated;

create or replace function private.propagate_song_enrichment(p_song_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog jsonb;
  v_isrc text;
  v_apple_id text;
  v_links jsonb;
  v_groups integer := 0;
  v_events integer := 0;
begin
  select to_jsonb(c), c.normalized_isrc,
    nullif(c.platform_ids ->> 'appleMusic', '')
  into v_catalog, v_isrc, v_apple_id
  from public.song_catalog c where c.id = p_song_id;
  if v_catalog is null then return 0; end if;

  select coalesce(jsonb_object_agg(chosen.platform, chosen.url), '{}'::jsonb)
  into v_links
  from (
    select distinct on (l.platform) l.platform, l.url
    from public.song_platform_links l
    where l.song_id = p_song_id and l.market in ('CH', 'ZZ')
    order by l.platform, case l.market when 'CH' then 0 else 1 end,
      l.checked_at desc
  ) chosen;

  update public.music_groups g
  set repertoire = (
    select coalesce(jsonb_agg(
      case when private.song_snapshot_matches_catalog(
        song.value, p_song_id, v_isrc, v_apple_id
      ) then private.merge_song_enrichment_snapshot(
        song.value, v_catalog, v_links
      ) else song.value end
      order by song.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(
      case when jsonb_typeof(g.repertoire) = 'array'
        then g.repertoire else '[]'::jsonb end
    ) with ordinality song(value, ordinality)
  )
  where exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(g.repertoire) = 'array'
        then g.repertoire else '[]'::jsonb end
    ) song(value)
    where private.song_snapshot_matches_catalog(
      song.value, p_song_id, v_isrc, v_apple_id
    )
  );
  get diagnostics v_groups = row_count;

  update public.group_events e
  set setlist = (
    select coalesce(jsonb_agg(
      case when private.song_snapshot_matches_catalog(
        song.value, p_song_id, v_isrc, v_apple_id
      ) then private.merge_song_enrichment_snapshot(
        song.value, v_catalog, v_links
      ) else song.value end
      order by song.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(
      case when jsonb_typeof(e.setlist) = 'array'
        then e.setlist else '[]'::jsonb end
    ) with ordinality song(value, ordinality)
  )
  where exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(e.setlist) = 'array'
        then e.setlist else '[]'::jsonb end
    ) song(value)
    where private.song_snapshot_matches_catalog(
      song.value, p_song_id, v_isrc, v_apple_id
    )
  );
  get diagnostics v_events = row_count;
  return v_groups + v_events;
end;
$$;

revoke all on function private.propagate_song_enrichment(uuid)
  from public, anon, authenticated;

create or replace function public.complete_song_enrichment_job(
  p_song_id uuid,
  p_claim_id uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_result_isrc text;
  v_current_isrc text;
  v_platform_ids jsonb;
  v_source text;
  v_title text;
  v_artist text;
  v_album_title text;
  v_artwork_url text;
  v_duration_ms integer;
  v_genres text[] := '{}'::text[];
  v_release_year smallint;
  v_is_candidate boolean := false;
  v_tempo_bpm integer;
  v_musical_key text;
  v_link record;
  v_link_count integer := 0;
  v_seen_platforms text[] := '{}'::text[];
  v_url_external_id text;
  v_market text;
begin
  if p_song_id is null or p_claim_id is null
    or coalesce(jsonb_typeof(p_result), '') <> 'object'
  then
    raise exception 'invalid_enrichment_result' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.song_enrichment_jobs j
    where j.song_id = p_song_id
      and j.state = 'processing'
      and j.claim_id = p_claim_id
      and j.claimed_at >= v_now - interval '5 minutes'
    for update
  ) then
    return false;
  end if;

  v_result_isrc := nullif(upper(regexp_replace(
    coalesce(p_result ->> 'isrc', ''), '[^a-zA-Z0-9]', '', 'g'
  )), '');
  if v_result_isrc is not null
    and v_result_isrc !~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
  then
    raise exception 'invalid_enrichment_isrc' using errcode = '22023';
  end if;
  select c.normalized_isrc, c.metadata_source = 'identity-candidate'
  into v_current_isrc, v_is_candidate
  from public.song_catalog c where c.id = p_song_id;
  if v_current_isrc is not null and v_result_isrc is not null
    and v_result_isrc is distinct from v_current_isrc
  then
    raise exception 'song_enrichment_isrc_mismatch' using errcode = '23514';
  end if;
  if v_current_isrc is null and v_result_isrc is not null and exists (
    select 1 from public.song_catalog c
    where c.normalized_isrc = v_result_isrc and c.id <> p_song_id
  ) then
    raise exception 'song_enrichment_isrc_conflict' using errcode = '23505';
  end if;

  v_source := coalesce(nullif(btrim(p_result ->> 'source'), ''), 'odesli');
  if v_source not in ('odesli', 'musicfetch', 'odesli+musicfetch') then
    raise exception 'invalid_enrichment_source' using errcode = '22023';
  end if;

  if p_result ? 'title' then
    if jsonb_typeof(p_result -> 'title') <> 'string'
      or length(btrim(p_result ->> 'title')) not between 1 and 300
    then raise exception 'invalid_enrichment_title' using errcode = '22023';
    end if;
    v_title := btrim(p_result ->> 'title');
  end if;
  if p_result ? 'artist' then
    if jsonb_typeof(p_result -> 'artist') <> 'string'
      or length(btrim(p_result ->> 'artist')) not between 1 and 300
    then raise exception 'invalid_enrichment_artist' using errcode = '22023';
    end if;
    v_artist := btrim(p_result ->> 'artist');
  end if;
  if v_is_candidate and (v_title is null or v_artist is null) then
    raise exception 'candidate_metadata_unverified' using errcode = '23514';
  end if;
  if p_result ? 'album_title' then
    if jsonb_typeof(p_result -> 'album_title') <> 'string'
      or length(btrim(p_result ->> 'album_title')) not between 1 and 300
    then raise exception 'invalid_enrichment_album' using errcode = '22023';
    end if;
    v_album_title := btrim(p_result ->> 'album_title');
  end if;
  if p_result ? 'artwork_url' then
    if jsonb_typeof(p_result -> 'artwork_url') <> 'string'
      or length(p_result ->> 'artwork_url') > 2048
      or p_result ->> 'artwork_url' !~*
        '^https://[a-z0-9-]+[.]mzstatic[.]com/'
      or p_result ->> 'artwork_url' ~ '[[:space:]]'
    then raise exception 'invalid_enrichment_artwork' using errcode = '22023';
    end if;
    v_artwork_url := p_result ->> 'artwork_url';
  end if;
  if p_result ? 'duration_ms' then
    if jsonb_typeof(p_result -> 'duration_ms') <> 'number'
      or p_result ->> 'duration_ms' !~ '^[0-9]{1,10}$'
      or (p_result ->> 'duration_ms')::numeric not between 1 and 2147483647
    then raise exception 'invalid_enrichment_duration' using errcode = '22023';
    end if;
    v_duration_ms := (p_result ->> 'duration_ms')::integer;
  end if;
  if p_result ? 'genres' then
    if jsonb_typeof(p_result -> 'genres') <> 'array'
      or jsonb_array_length(p_result -> 'genres') > 12
      or exists (
        select 1
        from jsonb_array_elements(p_result -> 'genres') item(value)
        where jsonb_typeof(item.value) <> 'string'
          or length(btrim(item.value #>> '{}')) not between 1 and 100
      )
    then raise exception 'invalid_enrichment_genres' using errcode = '22023';
    end if;
    select coalesce(array_agg(btrim(value)), '{}'::text[])
    into v_genres
    from jsonb_array_elements_text(p_result -> 'genres') genre(value);
  end if;
  if p_result ? 'release_year' then
    if jsonb_typeof(p_result -> 'release_year') <> 'number'
      or p_result ->> 'release_year' !~ '^[0-9]{4}$'
      or (p_result ->> 'release_year')::integer not between 1800 and 2200
    then raise exception 'invalid_enrichment_release_year' using errcode = '22023';
    end if;
    v_release_year := (p_result ->> 'release_year')::smallint;
  end if;

  if p_result ? 'tempo_bpm' then
    if jsonb_typeof(p_result -> 'tempo_bpm') <> 'number'
      or p_result ->> 'tempo_bpm' !~ '^[0-9]{1,3}$'
      or (p_result ->> 'tempo_bpm')::integer not between 20 and 400
    then
      raise exception 'invalid_enrichment_tempo' using errcode = '22023';
    end if;
    v_tempo_bpm := (p_result ->> 'tempo_bpm')::integer;
  end if;

  if p_result ? 'musical_key' then
    if jsonb_typeof(p_result -> 'musical_key') <> 'string'
      or p_result ->> 'musical_key' not in (
        'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
        'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'Abm', 'Am',
        'Bbm', 'Bm'
      )
    then
      raise exception 'invalid_enrichment_musical_key' using errcode = '22023';
    end if;
    v_musical_key := p_result ->> 'musical_key';
  end if;

  v_platform_ids := coalesce(p_result -> 'platform_ids', '{}'::jsonb);
  if jsonb_typeof(v_platform_ids) <> 'object' or exists (
    select 1 from jsonb_each(v_platform_ids) item
    where item.key not in (
      'appleMusic', 'spotify', 'youtubeMusic', 'deezer', 'tidal', 'amazonMusic'
    )
      or jsonb_typeof(item.value) <> 'string'
      or length(item.value #>> '{}') not between 1 and 256
  ) then
    raise exception 'invalid_enrichment_platform_ids' using errcode = '22023';
  end if;
  if jsonb_typeof(p_result -> 'links') <> 'array' then
    raise exception 'invalid_enrichment_links' using errcode = '22023';
  end if;

  for v_link in
    select * from jsonb_to_recordset(p_result -> 'links') as link(
      platform text, market text, url text, external_id text
    )
  loop
    v_market := upper(coalesce(nullif(btrim(v_link.market), ''), 'CH'));
    v_url_external_id := private.song_platform_external_id(
      v_link.platform, v_link.url
    );
    if v_link.platform not in (
      'appleMusic', 'spotify', 'youtubeMusic', 'deezer', 'tidal', 'amazonMusic'
    ) or v_market <> 'CH'
      or length(coalesce(v_link.url, '')) > 2048
      or v_url_external_id is null
      or length(coalesce(v_link.external_id, '')) > 256
      or (
        nullif(v_link.external_id, '') is not null
        and v_link.external_id <> v_url_external_id
      )
      or (
        v_platform_ids ? v_link.platform
        and v_platform_ids ->> v_link.platform <> v_url_external_id
      )
      or v_link.platform = any(v_seen_platforms)
    then
      raise exception 'untrusted_enrichment_link' using errcode = '23514';
    end if;
    v_seen_platforms := array_append(v_seen_platforms, v_link.platform);
    v_link_count := v_link_count + 1;
  end loop;
  if v_link_count < 1 or v_link_count > 6 then
    raise exception 'invalid_enrichment_link_count' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_platform_ids) item(key)
    where not (item.key = any(v_seen_platforms))
  ) then
    raise exception 'orphan_enrichment_platform_id' using errcode = '23514';
  end if;

  update public.song_catalog c
  set title = case when v_is_candidate then v_title else c.title end,
      artist = case when v_is_candidate then v_artist else c.artist end,
      album_title = coalesce(c.album_title, v_album_title),
      artwork_url = coalesce(c.artwork_url, v_artwork_url),
      isrc = coalesce(c.isrc, v_result_isrc),
      tempo_bpm = coalesce(c.tempo_bpm, v_tempo_bpm),
      musical_key = coalesce(c.musical_key, v_musical_key),
      duration_ms = coalesce(c.duration_ms, v_duration_ms),
      genres = case when cardinality(c.genres) = 0 then v_genres else c.genres end,
      release_year = coalesce(c.release_year, v_release_year),
      platform_ids = c.platform_ids || v_platform_ids,
      metadata_source = v_source,
      metadata_updated_at = v_now
  where c.id = p_song_id;

  for v_link in
    select * from jsonb_to_recordset(p_result -> 'links') as link(
      platform text, market text, url text, external_id text
    )
  loop
    insert into public.song_platform_links (
      song_id, platform, market, url, external_id, source, match_kind, checked_at
    ) values (
      p_song_id, v_link.platform, 'CH', v_link.url,
      private.song_platform_external_id(v_link.platform, v_link.url),
      v_source, 'exact', v_now
    )
    on conflict (song_id, platform, market) do update
    set url = excluded.url,
        external_id = excluded.external_id,
        source = v_source,
        match_kind = 'exact',
        checked_at = v_now,
        updated_at = v_now;
  end loop;

  perform private.propagate_song_enrichment(p_song_id);

  update private.song_enrichment_jobs j
  set state = 'complete',
      attempts = 0,
      next_attempt_at = v_now + interval '30 days',
      claim_id = null,
      claimed_at = null,
      negative_until = null,
      refresh_after = v_now + interval '30 days',
      last_error = null,
      updated_at = v_now
  where j.song_id = p_song_id and j.claim_id = p_claim_id;
  return found;
end;
$$;

revoke all on function public.complete_song_enrichment_job(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_song_enrichment_job(uuid, uuid, jsonb)
  to service_role;

create or replace function public.finish_song_enrichment_job(
  p_song_id uuid,
  p_claim_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_delay integer := least(
    greatest(coalesce(p_retry_after_seconds, 60), 10), 86400
  );
begin
  if p_outcome not in ('retry', 'negative', 'dead') then
    raise exception 'invalid_enrichment_outcome' using errcode = '22023';
  end if;
  select j.attempts into v_attempts
  from private.song_enrichment_jobs j
  where j.song_id = p_song_id
    and j.state = 'processing'
    and j.claim_id = p_claim_id
  for update;
  if not found then return false; end if;

  update private.song_enrichment_jobs j
  set state = case
        when p_outcome = 'negative' then 'negative'
        when p_outcome = 'dead' or v_attempts >= 8 then 'dead'
        else 'pending'
      end,
      attempts = case when p_outcome = 'negative' then 0 else j.attempts end,
      next_attempt_at = case
        when p_outcome = 'negative' then v_now + interval '7 days'
        when p_outcome = 'dead' or v_attempts >= 8 then v_now + interval '365 days'
        else v_now + make_interval(secs => v_delay)
      end,
      claim_id = null,
      claimed_at = null,
      negative_until = case
        when p_outcome = 'negative' then v_now + interval '7 days'
      end,
      refresh_after = null,
      last_error = left(coalesce(nullif(p_error, ''), p_outcome), 240),
      updated_at = v_now
  where j.song_id = p_song_id and j.claim_id = p_claim_id;
  return found;
end;
$$;

revoke all on function public.finish_song_enrichment_job(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;
grant execute on function public.finish_song_enrichment_job(
  uuid, uuid, text, text, integer
) to service_role;

create or replace function public.release_song_enrichment_claim(p_claim_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_claim_id is null then return 0; end if;
  with released as (
    update private.song_enrichment_jobs j
    set state = 'pending',
        attempts = greatest(j.attempts - 1, 0),
        next_attempt_at = clock_timestamp() + interval '30 seconds',
        claim_id = null,
        claimed_at = null,
        last_error = coalesce(j.last_error, 'worker_interrupted'),
        updated_at = clock_timestamp()
    where j.state = 'processing' and j.claim_id = p_claim_id
    returning 1
  )
  select count(*)::integer into v_count from released;
  return v_count;
end;
$$;

revoke all on function public.release_song_enrichment_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_song_enrichment_claim(uuid)
  to service_role;

-- Le premier deploiement ne contacte aucun fournisseur : il prepare seulement
-- les morceaux publics deja connus pour un futur worker explicitement configure.
insert into private.song_enrichment_jobs(song_id, state, priority, next_attempt_at)
select c.id, 'pending', 0, clock_timestamp()
from public.song_catalog c
where c.normalized_isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'
   or exists (
     select 1 from public.song_platform_links l
     where l.song_id = c.id and l.platform = 'appleMusic'
   )
on conflict (song_id) do nothing;
