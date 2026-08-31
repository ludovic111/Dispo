-- Catalogue canonique partagé pour les clients Swift, Kotlin et Expo.
--
-- Les snapshots JSONB existants restent la source opérationnelle pendant la
-- migration progressive. Cette migration les lit pour amorcer le catalogue,
-- mais ne réécrit ni `music_groups.repertoire` ni `group_events.setlist`.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_song_catalog_text(p_value text)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(extensions.unaccent(coalesce(btrim(p_value), ''))),
    '[[:space:]]+',
    ' ',
    'g'
  );
$$;

revoke all on function public.normalize_song_catalog_text(text) from public, anon;
grant execute on function public.normalize_song_catalog_text(text) to authenticated, service_role;

create table public.song_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  artist text not null default '',
  composer text,
  album_title text,
  artwork_url text check (artwork_url is null or artwork_url ~* '^https://'),
  isrc text,
  musical_key text,
  tempo_bpm integer check (tempo_bpm is null or tempo_bpm between 20 and 400),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  genres text[] not null default '{}'::text[],
  release_year smallint check (release_year is null or release_year between 1800 and 2200),
  platform_ids jsonb not null default '{}'::jsonb
    check (jsonb_typeof(platform_ids) = 'object'),
  metadata_source text,
  metadata_updated_at timestamptz,
  normalized_title text not null default '',
  normalized_artist text not null default '',
  normalized_composer text not null default '',
  normalized_isrc text,
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.song_catalog is
  'Métadonnées canoniques de morceaux. Les répertoires/setlists gardent leurs snapshots JSONB durant la migration.';
comment on column public.song_catalog.platform_ids is
  'Identifiants exacts par service, avec les clés appleMusic, spotify, youtubeMusic, deezer, tidal et amazonMusic.';

create or replace function private.set_song_catalog_derived_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.artist := btrim(new.artist);
  new.composer := nullif(btrim(new.composer), '');
  new.album_title := nullif(btrim(new.album_title), '');
  new.isrc := nullif(btrim(new.isrc), '');
  new.musical_key := nullif(btrim(new.musical_key), '');
  new.metadata_source := nullif(btrim(new.metadata_source), '');
  new.normalized_title := public.normalize_song_catalog_text(new.title);
  new.normalized_artist := public.normalize_song_catalog_text(new.artist);
  new.normalized_composer := public.normalize_song_catalog_text(new.composer);
  new.normalized_isrc := nullif(
    upper(regexp_replace(coalesce(new.isrc, ''), '[^a-zA-Z0-9]', '', 'g')),
    ''
  );
  new.search_vector :=
    setweight(to_tsvector('simple', new.normalized_title), 'A') ||
    setweight(to_tsvector('simple', new.normalized_artist), 'A') ||
    setweight(to_tsvector('simple', new.normalized_composer), 'B') ||
    setweight(to_tsvector('simple', array_to_string(new.genres, ' ')), 'C');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.set_song_catalog_derived_fields()
  from public, anon, authenticated;

create or replace function private.song_catalog_bounded_integer(
  p_value text,
  p_min integer,
  p_max integer
)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value ~ '^[0-9]{1,10}$'
      then case
        when p_value::numeric between p_min and p_max then p_value::integer
      end
  end;
$$;

revoke all on function private.song_catalog_bounded_integer(text, integer, integer)
  from public, anon, authenticated;

create or replace function private.song_catalog_canonical_uuid(p_value text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_value::uuid
  end;
$$;

revoke all on function private.song_catalog_canonical_uuid(text)
  from public, anon, authenticated;

create trigger song_catalog_00_derived_fields
before insert or update of
  title, artist, composer, album_title, artwork_url, isrc, musical_key,
  tempo_bpm, duration_ms, genres, release_year, platform_ids,
  metadata_source, metadata_updated_at
on public.song_catalog
for each row execute function private.set_song_catalog_derived_fields();

create unique index song_catalog_isrc_unique
  on public.song_catalog(normalized_isrc)
  where normalized_isrc is not null;
create unique index song_catalog_text_fallback_unique
  on public.song_catalog(normalized_artist, normalized_title)
  where normalized_isrc is null;
create index song_catalog_title_cursor_idx
  on public.song_catalog(normalized_title, id);
create index song_catalog_search_vector_idx
  on public.song_catalog using gin(search_vector);
create index song_catalog_title_trgm_idx
  on public.song_catalog using gin(normalized_title extensions.gin_trgm_ops);
create index song_catalog_artist_trgm_idx
  on public.song_catalog using gin(normalized_artist extensions.gin_trgm_ops);
create index song_catalog_composer_trgm_idx
  on public.song_catalog using gin(normalized_composer extensions.gin_trgm_ops);

create or replace function private.is_official_song_platform_url(
  p_platform text,
  p_url text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_url !~ '[[:space:]]' and case p_platform
    when 'appleMusic' then p_url ~*
      '^https://(music|itunes|geo[.]music)[.]apple[.]com([/?#][^[:space:]]*)?$'
    when 'spotify' then p_url ~*
      '^https://open[.]spotify[.]com([/?#][^[:space:]]*)?$'
    when 'youtubeMusic' then p_url ~*
      '^https://music[.]youtube[.]com([/?#][^[:space:]]*)?$'
    when 'deezer' then p_url ~*
      '^https://(www[.])?deezer[.]com([/?#][^[:space:]]*)?$'
    when 'tidal' then p_url ~*
      '^https://(listen[.])?tidal[.]com([/?#][^[:space:]]*)?$'
    when 'amazonMusic' then p_url ~*
      '^https://music[.]amazon[.]com([/?#][^[:space:]]*)?$'
    else false
  end;
$$;

revoke all on function private.is_official_song_platform_url(text, text)
  from public, anon, authenticated;

create table public.song_platform_links (
  song_id uuid not null references public.song_catalog(id) on delete cascade,
  platform text not null check (
    platform in ('appleMusic', 'spotify', 'youtubeMusic', 'deezer', 'tidal', 'amazonMusic')
  ),
  market text not null default 'CH' check (market = 'ZZ' or market ~ '^[A-Z]{2}$'),
  url text not null check (url ~* '^https://'),
  external_id text,
  source text,
  match_kind text not null default 'exact' check (match_kind in ('exact', 'manual')),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_id, platform, market)
);

comment on table public.song_platform_links is
  'Cache des liens HTTPS exacts par morceau, service et marché. Les recherches web de secours restent calculées côté client.';

create unique index song_platform_links_external_id_unique
  on public.song_platform_links(platform, external_id, market)
  where external_id is not null;
create index song_platform_links_song_checked_idx
  on public.song_platform_links(song_id, checked_at desc);

create or replace function private.guard_official_song_platform_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_official_song_platform_url(new.platform, new.url) then
    raise exception 'untrusted_song_platform_url'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_official_song_platform_link()
  from public, anon, authenticated;

create trigger song_platform_links_00_guard_official_url
before insert or update of platform, url on public.song_platform_links
for each row execute function private.guard_official_song_platform_link();

create trigger song_platform_links_touch_updated_at
before update on public.song_platform_links
for each row execute function public.touch_updated_at();

create or replace function private.song_catalog_apple_id(p_payload jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when lower(btrim(coalesce(p_payload ->> 'catalog_id', ''))) ~ '^apple:[0-9]+$'
      then split_part(lower(btrim(p_payload ->> 'catalog_id')), ':', 2)
  end;
$$;

revoke all on function private.song_catalog_apple_id(jsonb)
  from public, anon, authenticated;

create or replace function private.song_catalog_snapshot_isrc(p_payload jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with candidate as (
    select upper(
      regexp_replace(
        coalesce(p_payload ->> 'isrc', ''),
        '[^a-zA-Z0-9]',
        '',
        'g'
      )
    ) as value
  )
  select case
    when value ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$' then value
  end
  from candidate;
$$;

revoke all on function private.song_catalog_snapshot_isrc(jsonb)
  from public, anon, authenticated;

create or replace function private.song_catalog_snapshot_identity(p_payload jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    'isrc:' || private.song_catalog_snapshot_isrc(p_payload),
    'apple:' || private.song_catalog_apple_id(p_payload),
    'text:' || public.normalize_song_catalog_text(p_payload ->> 'artist')
      || '|' || public.normalize_song_catalog_text(p_payload ->> 'title')
  );
$$;

revoke all on function private.song_catalog_snapshot_identity(jsonb)
  from public, anon, authenticated;

create or replace function private.song_catalog_snapshot_has_public_identity(
  p_payload jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_payload) = 'object'
    and (
      private.song_catalog_snapshot_isrc(p_payload) is not null
      or private.song_catalog_apple_id(p_payload) is not null
    ),
    false
  );
$$;

revoke all on function private.song_catalog_snapshot_has_public_identity(jsonb)
  from public, anon, authenticated;

-- Amorçage non destructif depuis les deux collections JSONB historiques.
-- Un morceau saisi manuellement reste exclusivement dans le JSON privé de son
-- groupe. Seules les identités publiques vérifiables alimentent le catalogue
-- global lisible par les utilisateurs authentifiés.
create temporary table dispo_song_catalog_snapshots on commit drop as
with raw_songs as (
  select song.value as payload
  from public.music_groups groups
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(groups.repertoire) = 'array'
      then groups.repertoire else '[]'::jsonb end
  ) song(value)
  union all
  select song.value as payload
  from public.group_events events
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(events.setlist) = 'array'
      then events.setlist else '[]'::jsonb end
  ) song(value)
), normalized as (
  select
    payload,
    nullif(btrim(payload ->> 'title'), '') as title,
    coalesce(nullif(btrim(payload ->> 'artist'), ''), '') as artist,
    public.normalize_song_catalog_text(payload ->> 'title') as normalized_title,
    public.normalize_song_catalog_text(
      coalesce(nullif(btrim(payload ->> 'artist'), ''), '')
    ) as normalized_artist,
    private.song_catalog_snapshot_isrc(payload) as normalized_isrc,
    private.song_catalog_apple_id(payload) as apple_id
  from raw_songs
  where jsonb_typeof(payload) = 'object'
    and nullif(btrim(payload ->> 'title'), '') is not null
    and private.song_catalog_snapshot_has_public_identity(payload)
)
select
  normalized.*,
  row_number() over (
    partition by private.song_catalog_snapshot_identity(payload)
    order by
      (private.song_catalog_apple_id(payload) is not null)::integer desc,
      (nullif(payload ->> 'artwork_url', '') is not null)::integer desc,
      (nullif(payload ->> 'album_title', '') is not null)::integer desc,
      (nullif(payload ->> 'composer', '') is not null)::integer desc
  ) as identity_rank
from normalized;

insert into public.song_catalog (
  id, title, artist, composer, album_title, artwork_url, isrc, musical_key,
  tempo_bpm, duration_ms, genres, release_year, platform_ids,
  metadata_source, metadata_updated_at
)
select
  coalesce(
    private.song_catalog_canonical_uuid(payload ->> 'canonical_song_id'),
    gen_random_uuid()
  ),
  title,
  artist,
  nullif(btrim(payload ->> 'composer'), ''),
  nullif(btrim(payload ->> 'album_title'), ''),
  case when payload ->> 'artwork_url' ~* '^https://' then payload ->> 'artwork_url' end,
  nullif(btrim(payload ->> 'isrc'), ''),
  nullif(btrim(payload ->> 'key'), ''),
  private.song_catalog_bounded_integer(payload ->> 'tempo_bpm', 20, 400),
  private.song_catalog_bounded_integer(payload ->> 'duration_ms', 1, 2147483647),
  case
    when jsonb_typeof(payload -> 'genres') = 'array' then array(
      select value
      from jsonb_array_elements_text(payload -> 'genres') genre(value)
      where btrim(value) <> ''
    )
    when nullif(btrim(payload ->> 'genre'), '') is not null
      then array[btrim(payload ->> 'genre')]
    else '{}'::text[]
  end,
  case
    when payload ->> 'release_year' ~ '^[0-9]{4}$'
      and (payload ->> 'release_year')::integer between 1800 and 2200
      then (payload ->> 'release_year')::smallint
  end,
  (
    case when jsonb_typeof(payload -> 'platform_ids') = 'object'
      then payload -> 'platform_ids' else '{}'::jsonb end
  ) || (
    case when private.song_catalog_apple_id(payload) is not null
      then jsonb_build_object('appleMusic', private.song_catalog_apple_id(payload))
      else '{}'::jsonb end
  ),
  coalesce(nullif(btrim(payload ->> 'metadata_source'), ''), 'legacy-json'),
  now()
from dispo_song_catalog_snapshots
where identity_rank = 1
on conflict do nothing;

with snapshot_catalog as (
  select snapshots.payload, catalog.id as song_id
  from dispo_song_catalog_snapshots snapshots
  join public.song_catalog catalog on (
    snapshots.normalized_isrc is not null
    and catalog.normalized_isrc = snapshots.normalized_isrc
  ) or (
    snapshots.normalized_isrc is null
    and snapshots.apple_id is not null
    and catalog.normalized_isrc is null
    and catalog.platform_ids ->> 'appleMusic' = snapshots.apple_id
  ) or (
    snapshots.normalized_isrc is null
    and snapshots.apple_id is null
    and catalog.normalized_isrc is null
    and catalog.normalized_artist = snapshots.normalized_artist
    and catalog.normalized_title = snapshots.normalized_title
  )
), raw_links as (
  select
    snapshot_catalog.song_id,
    snapshot_catalog.payload,
    links.key as raw_platform,
    links.value as url,
    0 as source_priority
  from snapshot_catalog
  cross join lateral jsonb_each_text(
    case when jsonb_typeof(snapshot_catalog.payload -> 'platform_links') = 'object'
      then snapshot_catalog.payload -> 'platform_links' else '{}'::jsonb end
  ) links(key, value)
  union all
  select
    snapshot_catalog.song_id,
    snapshot_catalog.payload,
    'appleMusic',
    snapshot_catalog.payload ->> 'track_url',
    1
  from snapshot_catalog
  where snapshot_catalog.payload ->> 'track_url' ~* '^https://'
), canonical_links as (
  select
    song_id,
    payload,
    case regexp_replace(lower(raw_platform), '[^a-z0-9]', '', 'g')
      when 'apple' then 'appleMusic'
      when 'applemusic' then 'appleMusic'
      when 'itunes' then 'appleMusic'
      when 'spotify' then 'spotify'
      when 'youtube' then 'youtubeMusic'
      when 'youtubemusic' then 'youtubeMusic'
      when 'deezer' then 'deezer'
      when 'tidal' then 'tidal'
      when 'amazon' then 'amazonMusic'
      when 'amazonmusic' then 'amazonMusic'
    end as platform,
    url,
    source_priority
  from raw_links
  where url ~* '^https://'
), chosen_links as (
  select distinct on (song_id, platform)
    song_id,
    platform,
    url,
    case
      when platform = 'appleMusic'
        and private.song_catalog_apple_id(payload) is not null
        then private.song_catalog_apple_id(payload)
      when jsonb_typeof(payload -> 'platform_ids') = 'object'
        then nullif(payload -> 'platform_ids' ->> platform, '')
    end as external_id,
    coalesce(nullif(payload ->> 'metadata_source', ''), 'legacy-json') as source
  from canonical_links
  where platform is not null
    and private.is_official_song_platform_url(platform, url)
  order by song_id, platform, source_priority, char_length(url) desc
)
insert into public.song_platform_links (
  song_id, platform, market, url, external_id, source, match_kind
)
select song_id, platform, 'CH', url, external_id, source, 'exact'
from chosen_links
on conflict do nothing;

alter table public.song_catalog enable row level security;
alter table public.song_platform_links enable row level security;

create policy song_catalog_authenticated_read
on public.song_catalog
for select
to authenticated
using ((select auth.uid()) is not null);

create policy song_platform_links_authenticated_read
on public.song_platform_links
for select
to authenticated
using ((select auth.uid()) is not null);

revoke all on table public.song_catalog from public, anon, authenticated;
revoke all on table public.song_platform_links from public, anon, authenticated;
grant select on table public.song_catalog to authenticated;
grant select on table public.song_platform_links to authenticated;
grant select, insert, update, delete on table public.song_catalog to service_role;
grant select, insert, update, delete on table public.song_platform_links to service_role;

create or replace function public.search_song_catalog(
  p_query text default '',
  p_limit integer default 20,
  p_after_title text default null,
  p_after_id uuid default null,
  p_market text default 'CH'
)
returns table (
  id uuid,
  title text,
  artist text,
  composer text,
  album_title text,
  artwork_url text,
  isrc text,
  musical_key text,
  tempo_bpm integer,
  duration_ms integer,
  genres text[],
  release_year smallint,
  platform_ids jsonb,
  platform_links jsonb,
  metadata_source text,
  metadata_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cursor_title text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      public.normalize_song_catalog_text(left(coalesce(p_query, ''), 160)) as query,
      public.normalize_song_catalog_text(p_after_title) as after_title,
      upper(coalesce(nullif(btrim(p_market), ''), 'CH')) as market
  ), page as (
    select catalog.*
    from public.song_catalog catalog
    cross join input
    where (
      input.query = ''
      or catalog.search_vector @@ websearch_to_tsquery('simple', input.query)
      or catalog.normalized_title like '%' || input.query || '%'
      or catalog.normalized_artist like '%' || input.query || '%'
      or catalog.normalized_composer like '%' || input.query || '%'
    )
      and (
        (p_after_title is null and p_after_id is null)
        or (
          p_after_title is not null
          and p_after_id is not null
          and (catalog.normalized_title, catalog.id) > (input.after_title, p_after_id)
        )
      )
    order by catalog.normalized_title, catalog.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select
    page.id,
    page.title,
    page.artist,
    page.composer,
    page.album_title,
    page.artwork_url,
    page.isrc,
    page.musical_key,
    page.tempo_bpm,
    page.duration_ms,
    page.genres,
    page.release_year,
    page.platform_ids || coalesce(links.external_ids, '{}'::jsonb),
    coalesce(links.urls, '{}'::jsonb),
    page.metadata_source,
    page.metadata_updated_at,
    page.created_at,
    page.updated_at,
    page.normalized_title
  from page
  cross join input
  left join lateral (
    select
      jsonb_object_agg(chosen.platform, chosen.url) as urls,
      jsonb_object_agg(chosen.platform, chosen.external_id)
        filter (where chosen.external_id is not null) as external_ids
    from (
      select distinct on (links.platform)
        links.platform,
        links.url,
        links.external_id
      from public.song_platform_links links
      where links.song_id = page.id
        and links.market in (input.market, 'ZZ')
      order by
        links.platform,
        case links.market when input.market then 0 else 1 end,
        links.checked_at desc
    ) chosen
  ) links on true
  order by page.normalized_title, page.id;
$$;

comment on function public.search_song_catalog(text, integer, text, uuid, text) is
  'Recherche accent-insensible, requête limitée à 160 caractères, pagination par paire (cursor_title,id), 50 lignes maximum et liens HTTPS exacts du marché.';

revoke all on function public.search_song_catalog(text, integer, text, uuid, text)
  from public, anon;
grant execute on function public.search_song_catalog(text, integer, text, uuid, text)
  to authenticated, service_role;
