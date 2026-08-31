-- Un meme enregistrement Apple Music peut avoir un track id different selon
-- le storefront. L'identifiant qui a introduit la fiche reste canonique ; les
-- liens directs CH confirmes par Odesli/Musicfetch deviennent des aliases
-- persistants. Les snapshots ne sont fusionnes que si toutes leurs identites
-- Apple appartiennent au meme ensemble verifie.

create table if not exists private.song_apple_identities (
  song_id uuid not null references public.song_catalog(id) on delete cascade,
  apple_id text not null check (apple_id ~ '^[0-9]{1,20}$'),
  kind text not null check (kind in ('canonical', 'storefront')),
  market text,
  source text not null,
  verified_at timestamptz not null default clock_timestamp(),
  primary key (song_id, apple_id),
  unique (apple_id),
  constraint song_apple_identity_market check (
    (kind = 'canonical' and market is null)
    or (kind = 'storefront' and market ~ '^[A-Z]{2}$')
  )
);

create unique index if not exists song_apple_identities_canonical_unique
  on private.song_apple_identities(song_id)
  where kind = 'canonical';

create table if not exists private.song_apple_snapshot_merge_archive (
  parent_table text not null check (
    parent_table in ('music_groups', 'group_events')
  ),
  parent_id uuid not null,
  original_ordinality bigint not null check (original_ordinality > 0),
  storefront_song_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  archived_at timestamptz not null default clock_timestamp(),
  primary key (
    parent_table, parent_id, original_ordinality, storefront_song_id
  )
);

revoke all on table private.song_apple_identities
  from public, anon, authenticated;
revoke all on table private.song_apple_snapshot_merge_archive
  from public, anon, authenticated;

insert into private.song_apple_identities (
  song_id, apple_id, kind, market, source, verified_at
)
select
  c.id,
  c.platform_ids ->> 'appleMusic',
  'canonical',
  null,
  coalesce(nullif(c.metadata_source, ''), 'catalog'),
  coalesce(c.metadata_updated_at, c.created_at, clock_timestamp())
from public.song_catalog c
where nullif(c.platform_ids ->> 'appleMusic', '') ~ '^[0-9]{1,20}$'
on conflict (apple_id) do update
set kind = 'canonical',
    market = null,
    source = excluded.source,
    verified_at = greatest(
      private.song_apple_identities.verified_at,
      excluded.verified_at
    )
where private.song_apple_identities.song_id = excluded.song_id;

insert into private.song_apple_identities (
  song_id, apple_id, kind, market, source, verified_at
)
select
  l.song_id,
  l.external_id,
  'storefront',
  upper(l.market),
  l.source,
  coalesce(l.checked_at, l.updated_at, clock_timestamp())
from public.song_platform_links l
where l.platform = 'appleMusic'
  and l.match_kind = 'exact'
  and l.source in ('odesli', 'musicfetch', 'odesli+musicfetch')
  and l.external_id ~ '^[0-9]{1,20}$'
  and private.song_catalog_apple_track_id_from_url(l.url) = l.external_id
on conflict (apple_id) do update
set kind = case
      when private.song_apple_identities.kind = 'canonical'
        then 'canonical'
      else 'storefront'
    end,
    market = case
      when private.song_apple_identities.kind = 'canonical'
        then null
      else excluded.market
    end,
    source = excluded.source,
    verified_at = greatest(
      private.song_apple_identities.verified_at,
      excluded.verified_at
    )
where private.song_apple_identities.song_id = excluded.song_id;

create or replace function private.song_catalog_verified_apple_identities(
  p_song_id uuid
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(i.apple_id order by i.apple_id), '{}'::text[])
  from private.song_apple_identities i
  where i.song_id = p_song_id;
$$;

revoke all on function private.song_catalog_verified_apple_identities(uuid)
  from public, anon, authenticated;

create or replace function private.song_snapshot_matches_catalog(
  p_snapshot jsonb,
  p_song_id uuid,
  p_normalized_isrc text,
  p_apple_id text,
  p_apple_identities text[]
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
      nullif(btrim(p_snapshot ->> 'track_url'), '') as track_url,
      case when jsonb_typeof(p_snapshot -> 'platform_links') = 'object'
        then nullif(btrim(
          p_snapshot -> 'platform_links' ->> 'appleMusic'
        ), '')
      end as platform_link_url
  ), aliases as (
    select coalesce(array_agg(distinct candidate), '{}'::text[]) as ids
    from unnest(
      array_append(coalesce(p_apple_identities, '{}'::text[]), p_apple_id)
    ) candidate
    where candidate ~ '^[0-9]{1,20}$'
  )
  select jsonb_typeof(p_snapshot) = 'object'
    and (
      canonical_id is not null
      or normalized_isrc is not null
      or catalog_apple_id is not null
      or platform_apple_id is not null
      or track_url is not null
      or platform_link_url is not null
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
      or catalog_apple_id = any(aliases.ids)
    )
    and (
      platform_apple_id is null
      or (
        platform_apple_id ~ '^[0-9]{1,20}$'
        and platform_apple_id = any(aliases.ids)
      )
    )
    and (
      track_url is null
      or private.song_catalog_apple_track_id_from_url(track_url)
        = any(aliases.ids)
    )
    and (
      platform_link_url is null
      or private.song_catalog_apple_track_id_from_url(platform_link_url)
        = any(aliases.ids)
    )
    and not (
      lower(btrim(coalesce(p_snapshot ->> 'catalog_id', '')))
        like 'apple:%'
      and catalog_apple_id is null
    )
  from identity cross join aliases;
$$;

revoke all on function private.song_snapshot_matches_catalog(
  jsonb, uuid, text, text, text[]
) from public, anon, authenticated;

-- Compatibilite avec les appels historiques et les tests sans alias.
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
  select private.song_snapshot_matches_catalog(
    p_snapshot,
    p_song_id,
    p_normalized_isrc,
    p_apple_id,
    case when p_apple_id is null then '{}'::text[] else array[p_apple_id] end
  );
$$;

revoke all on function private.song_snapshot_matches_catalog(
  jsonb, uuid, text, text
) from public, anon, authenticated;

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
  v_track_url text;
  v_track_apple_id text;
  v_platform_link_url text;
  v_platform_link_apple_id text;
  v_direct_url text;
  v_apple_ids text[] := '{}'::text[];
  v_catalog_id uuid;
  v_candidates uuid[];
begin
  if jsonb_typeof(p_payload) <> 'object' then return null; end if;
  v_isrc := private.song_catalog_snapshot_isrc(p_payload);
  v_canonical_id := private.song_catalog_canonical_uuid(
    p_payload ->> 'canonical_song_id'
  );
  v_catalog_apple_id := private.song_catalog_apple_id(p_payload);
  if lower(btrim(coalesce(p_payload ->> 'catalog_id', ''))) like 'apple:%'
    and v_catalog_apple_id is null
  then return null;
  end if;
  if v_catalog_apple_id is not null then
    v_apple_ids := array_append(v_apple_ids, v_catalog_apple_id);
  end if;

  if jsonb_typeof(p_payload -> 'platform_ids') = 'object'
    and nullif(p_payload -> 'platform_ids' ->> 'appleMusic', '') is not null
  then
    v_platform_apple_id := p_payload -> 'platform_ids' ->> 'appleMusic';
    if v_platform_apple_id !~ '^[0-9]{1,20}$' then return null; end if;
    v_apple_ids := array_append(v_apple_ids, v_platform_apple_id);
  end if;

  v_track_url := nullif(btrim(p_payload ->> 'track_url'), '');
  if v_track_url is not null then
    v_track_apple_id := private.song_catalog_apple_track_id_from_url(v_track_url);
    if v_track_apple_id is null then return null; end if;
    v_apple_ids := array_append(v_apple_ids, v_track_apple_id);
  end if;
  if jsonb_typeof(p_payload -> 'platform_links') = 'object' then
    v_platform_link_url := nullif(btrim(
      p_payload -> 'platform_links' ->> 'appleMusic'
    ), '');
  end if;
  if v_platform_link_url is not null then
    v_platform_link_apple_id := private.song_catalog_apple_track_id_from_url(
      v_platform_link_url
    );
    if v_platform_link_apple_id is null then return null; end if;
    v_apple_ids := array_append(v_apple_ids, v_platform_link_apple_id);
  end if;
  select coalesce(array_agg(distinct apple_id order by apple_id), '{}'::text[])
  into v_apple_ids from unnest(v_apple_ids) apple(apple_id);
  v_direct_url := coalesce(v_track_url, v_platform_link_url);

  if v_canonical_id is not null then
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.id = v_canonical_id
      and (v_isrc is null or c.normalized_isrc = v_isrc)
      and not exists (
        select 1 from unnest(v_apple_ids) identity(apple_id)
        where not (
          identity.apple_id = any(
            private.song_catalog_verified_apple_identities(c.id)
          )
        )
      )
    limit 1;
    if v_catalog_id is null then return null; end if;
  elsif v_isrc is not null then
    select array_agg(c.id order by c.id) into v_candidates
    from public.song_catalog c
    where c.normalized_isrc = v_isrc
      and not exists (
        select 1 from unnest(v_apple_ids) identity(apple_id)
        where not (
          identity.apple_id = any(
            private.song_catalog_verified_apple_identities(c.id)
          )
        )
      );
    if cardinality(v_candidates) > 1 then return null; end if;
    v_catalog_id := v_candidates[1];
  elsif cardinality(v_apple_ids) > 0 then
    select array_agg(c.id order by c.id) into v_candidates
    from public.song_catalog c
    where not exists (
      select 1 from unnest(v_apple_ids) identity(apple_id)
      where not (
        identity.apple_id = any(
          private.song_catalog_verified_apple_identities(c.id)
        )
      )
    );
    if cardinality(v_candidates) > 1 then return null; end if;
    v_catalog_id := v_candidates[1];
  end if;

  -- Sans relation deja verifiee, plusieurs IDs differents ne prouvent jamais
  -- qu'il s'agit du meme morceau. Une candidate neuve exige une URL directe
  -- dont l'unique ID est celui qui devient canonique.
  if v_catalog_id is null and cardinality(v_apple_ids) = 1
    and v_direct_url is not null
    and private.song_catalog_apple_track_id_from_url(v_direct_url)
      = v_apple_ids[1]
  then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'song-catalog-apple:' || v_apple_ids[1], 0
      )
    );
    select c.id into v_catalog_id
    from public.song_catalog c
    where c.platform_ids ->> 'appleMusic' = v_apple_ids[1]
    limit 1;
    if v_catalog_id is null then
      insert into public.song_catalog (
        title, artist, platform_ids, metadata_source, metadata_updated_at
      ) values (
        'Apple Music ' || v_apple_ids[1],
        '',
        jsonb_build_object('appleMusic', v_apple_ids[1]),
        'identity-candidate',
        null
      )
      returning id into v_catalog_id;
    end if;
    insert into public.song_platform_links (
      song_id, platform, market, url, external_id, source, match_kind, checked_at
    ) values (
      v_catalog_id, 'appleMusic', 'CH', v_direct_url, v_apple_ids[1],
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
  v_apple_identities text[];
  v_links jsonb;
  v_groups integer := 0;
  v_events integer := 0;
begin
  select to_jsonb(c), c.normalized_isrc,
    nullif(c.platform_ids ->> 'appleMusic', '')
  into v_catalog, v_isrc, v_apple_id
  from public.song_catalog c where c.id = p_song_id;
  if v_catalog is null then return 0; end if;
  v_apple_identities := private.song_catalog_verified_apple_identities(p_song_id);

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
        song.value, p_song_id, v_isrc, v_apple_id, v_apple_identities
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
      song.value, p_song_id, v_isrc, v_apple_id, v_apple_identities
    )
  );
  get diagnostics v_groups = row_count;

  update public.group_events e
  set setlist = (
    select coalesce(jsonb_agg(
      case when private.song_snapshot_matches_catalog(
        song.value, p_song_id, v_isrc, v_apple_id, v_apple_identities
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
      song.value, p_song_id, v_isrc, v_apple_id, v_apple_identities
    )
  );
  get diagnostics v_events = row_count;
  return v_groups + v_events;
end;
$$;

revoke all on function private.propagate_song_enrichment(uuid)
  from public, anon, authenticated;

-- Repare uniquement les cinq remaps observes pendant le premier backfill. Le
-- UUID de la candidate d'origine reste canonique : les metadonnees, liens et
-- etat de job verifies sont rattaches a cette ligne, les snapshots qui visaient
-- le doublon CH sont repointes, puis le doublon enrichi est supprime.
do $$
declare
  v_mapping record;
  v_original public.song_catalog%rowtype;
  v_storefront public.song_catalog%rowtype;
  v_storefront_job private.song_enrichment_jobs%rowtype;
  v_catalog jsonb;
  v_normalized_isrc text;
  v_links jsonb;
  v_apple_identities text[];
  v_jobs_before bigint;
  v_expected_job_delta bigint := 0;
begin
  select count(*) into v_jobs_before from private.song_enrichment_jobs;

  for v_mapping in
    select * from (values
      ('724502206'::text, '738336150'::text),
      ('275583013'::text, '1719225009'::text),
      ('716753607'::text, '1641203854'::text),
      ('962194529'::text, '962199387'::text),
      ('1440721554'::text, '6766275341'::text)
    ) mapping(canonical_id, storefront_id)
  loop
    v_original := null;
    v_storefront := null;
    v_storefront_job := null;

    select c.* into v_original
    from public.song_catalog c
    where c.platform_ids ->> 'appleMusic' = v_mapping.canonical_id
    limit 1;

    select c.* into v_storefront
    from public.song_catalog c
    where c.platform_ids ->> 'appleMusic' = v_mapping.storefront_id
      and c.metadata_source in ('odesli', 'musicfetch', 'odesli+musicfetch')
      and exists (
        select 1 from public.song_platform_links l
        where l.song_id = c.id
          and l.platform = 'appleMusic'
          and l.external_id = v_mapping.storefront_id
          and l.match_kind = 'exact'
          and l.source in ('odesli', 'musicfetch', 'odesli+musicfetch')
          and private.song_catalog_apple_track_id_from_url(l.url)
            = v_mapping.storefront_id
      )
    limit 1;

    -- Rien a reparer si le fournisseur n'a pas encore cree le doublon CH.
    if v_storefront.id is null then continue; end if;
    if v_original.id is null
      or v_original.metadata_source is distinct from 'identity-candidate'
    then
      raise exception 'verified_apple_identity_conflict:%',
        v_mapping.canonical_id using errcode = '23505';
    end if;

    -- Les six liens verifies sont conserves. Leur UPDATE in-place evite de
    -- heurter l'unicite globale (plateforme, external_id, marche) qui serait
    -- violee par un INSERT tant que le doublon CH existe encore.
    if exists (
      select 1
      from public.song_platform_links original_link
      join public.song_platform_links storefront_link
        on storefront_link.song_id = v_storefront.id
       and storefront_link.platform = original_link.platform
       and storefront_link.market = original_link.market
      where original_link.song_id = v_original.id
        and original_link.source is distinct from 'identity-candidate'
    ) then
      raise exception 'verified_apple_link_conflict:%',
        v_mapping.canonical_id using errcode = '23505';
    end if;
    delete from public.song_platform_links original_link
    where original_link.song_id = v_original.id
      and original_link.source = 'identity-candidate'
      and exists (
        select 1 from public.song_platform_links storefront_link
        where storefront_link.song_id = v_storefront.id
          and storefront_link.platform = original_link.platform
          and storefront_link.market = original_link.market
      );
    update public.song_platform_links
    set song_id = v_original.id
    where song_id = v_storefront.id;

    -- Le job enrichi remplace l'etat pending de la candidate originale, tout
    -- en gardant la cle et donc l'identite canonique d'origine.
    select j.* into v_storefront_job
    from private.song_enrichment_jobs j
    where j.song_id = v_storefront.id;
    if v_storefront_job.song_id is not null then
      if v_storefront_job.state <> 'complete' then
        raise exception 'apple_storefront_job_not_complete:%',
          v_mapping.canonical_id using errcode = '23514';
      end if;
      if exists (
        select 1 from private.song_enrichment_jobs j
        where j.song_id = v_original.id
      ) then
        v_expected_job_delta := v_expected_job_delta + 1;
      end if;
      insert into private.song_enrichment_jobs (
        song_id, state, priority, attempts, next_attempt_at, claim_id,
        claimed_at, negative_until, refresh_after, last_requested_by,
        last_error, created_at, updated_at
      ) values (
        v_original.id, v_storefront_job.state, v_storefront_job.priority,
        v_storefront_job.attempts, v_storefront_job.next_attempt_at,
        v_storefront_job.claim_id, v_storefront_job.claimed_at,
        v_storefront_job.negative_until, v_storefront_job.refresh_after,
        v_storefront_job.last_requested_by, v_storefront_job.last_error,
        v_storefront_job.created_at, v_storefront_job.updated_at
      )
      on conflict (song_id) do update
      set state = excluded.state,
          priority = greatest(
            private.song_enrichment_jobs.priority,
            excluded.priority
          ),
          attempts = excluded.attempts,
          next_attempt_at = excluded.next_attempt_at,
          claim_id = excluded.claim_id,
          claimed_at = excluded.claimed_at,
          negative_until = excluded.negative_until,
          refresh_after = excluded.refresh_after,
          last_requested_by = coalesce(
            excluded.last_requested_by,
            private.song_enrichment_jobs.last_requested_by
          ),
          last_error = excluded.last_error,
          created_at = least(
            private.song_enrichment_jobs.created_at,
            excluded.created_at
          ),
          updated_at = greatest(
            private.song_enrichment_jobs.updated_at,
            excluded.updated_at
          );
    end if;

    update private.song_enrichment_rate_events
    set song_id = v_original.id
    where song_id = v_storefront.id;
    update private.song_enrichment_user_requests
    set song_id = v_original.id
    where song_id = v_storefront.id;

    -- La ligne enrichie est maintenant detachable. Sa suppression libere son
    -- ISRC unique et son Apple ID storefront avant l'update canonique.
    delete from private.song_apple_identities
    where song_id = v_storefront.id;
    delete from public.song_catalog where id = v_storefront.id;

    update public.song_catalog c
    set title = v_storefront.title,
        artist = v_storefront.artist,
        album_title = v_storefront.album_title,
        artwork_url = v_storefront.artwork_url,
        isrc = v_storefront.isrc,
        tempo_bpm = v_storefront.tempo_bpm,
        musical_key = v_storefront.musical_key,
        duration_ms = v_storefront.duration_ms,
        genres = v_storefront.genres,
        release_year = v_storefront.release_year,
        platform_ids = jsonb_set(
          coalesce(v_storefront.platform_ids, '{}'::jsonb),
          '{appleMusic}', to_jsonb(v_mapping.canonical_id), true
        ),
        metadata_source = v_storefront.metadata_source,
        metadata_updated_at = v_storefront.metadata_updated_at
    where c.id = v_original.id;

    delete from private.song_apple_identities
    where song_id = v_original.id;
    insert into private.song_apple_identities (
      song_id, apple_id, kind, market, source, verified_at
    ) values (
      v_original.id, v_mapping.canonical_id, 'canonical', null,
      'catalog-repair', clock_timestamp()
    );
    insert into private.song_apple_identities (
      song_id, apple_id, kind, market, source, verified_at
    ) values (
      v_original.id, v_mapping.storefront_id, 'storefront', 'CH',
      'odesli', clock_timestamp()
    );

    select to_jsonb(c), c.normalized_isrc
    into v_catalog, v_normalized_isrc
    from public.song_catalog c where c.id = v_original.id;
    v_apple_identities := private.song_catalog_verified_apple_identities(
      v_original.id
    );
    select coalesce(jsonb_object_agg(chosen.platform, chosen.url), '{}'::jsonb)
    into v_links
    from (
      select distinct on (l.platform) l.platform, l.url
      from public.song_platform_links l
      where l.song_id = v_original.id and l.market in ('CH', 'ZZ')
      order by l.platform, case l.market when 'CH' then 0 else 1 end,
        l.checked_at desc
    ) chosen;

    -- Si deux cartes qui paraissaient distinctes deviennent le meme morceau,
    -- la premiere garde sa position et ses champs d'arrangement. Les suivantes
    -- sont archivees byte-for-byte dans private avant d'etre retirees : aucune
    -- donnee utilisateur n'est perdue et l'invariant anti-doublon reste valide.
    insert into private.song_apple_snapshot_merge_archive (
      parent_table, parent_id, original_ordinality, storefront_song_id, snapshot
    )
    select
      'music_groups', ranked.parent_id, ranked.ordinality,
      v_storefront.id, ranked.original_snapshot
    from (
      select marked.*,
        count(*) filter (where marked.matches_catalog) over (
          partition by marked.parent_id order by marked.ordinality
        ) as match_rank
      from (
        select
          g.id as parent_id,
          song.ordinality,
          song.value as original_snapshot,
          private.song_snapshot_matches_catalog(
            normalized.snapshot, v_original.id, v_normalized_isrc,
            v_mapping.canonical_id, v_apple_identities
          ) as matches_catalog
        from public.music_groups g
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(g.repertoire) = 'array'
            then g.repertoire else '[]'::jsonb end
        ) with ordinality song(value, ordinality)
        cross join lateral (
          select case when private.song_catalog_canonical_uuid(
            song.value ->> 'canonical_song_id'
          ) = v_storefront.id
          then song.value || jsonb_build_object(
            'canonical_song_id', v_original.id::text
          )
          else song.value end as snapshot
        ) normalized
      ) marked
    ) ranked
    where ranked.matches_catalog and ranked.match_rank > 1
    on conflict do nothing;

    insert into private.song_apple_snapshot_merge_archive (
      parent_table, parent_id, original_ordinality, storefront_song_id, snapshot
    )
    select
      'group_events', ranked.parent_id, ranked.ordinality,
      v_storefront.id, ranked.original_snapshot
    from (
      select marked.*,
        count(*) filter (where marked.matches_catalog) over (
          partition by marked.parent_id order by marked.ordinality
        ) as match_rank
      from (
        select
          e.id as parent_id,
          song.ordinality,
          song.value as original_snapshot,
          private.song_snapshot_matches_catalog(
            normalized.snapshot, v_original.id, v_normalized_isrc,
            v_mapping.canonical_id, v_apple_identities
          ) as matches_catalog
        from public.group_events e
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(e.setlist) = 'array'
            then e.setlist else '[]'::jsonb end
        ) with ordinality song(value, ordinality)
        cross join lateral (
          select case when private.song_catalog_canonical_uuid(
            song.value ->> 'canonical_song_id'
          ) = v_storefront.id
          then song.value || jsonb_build_object(
            'canonical_song_id', v_original.id::text
          )
          else song.value end as snapshot
        ) normalized
      ) marked
    ) ranked
    where ranked.matches_catalog and ranked.match_rank > 1
    on conflict do nothing;

    update public.music_groups g
    set repertoire = (
      select coalesce(jsonb_agg(
        case when ranked.matches_catalog and ranked.match_rank = 1
          then private.merge_song_enrichment_snapshot(
            ranked.normalized_snapshot, v_catalog, v_links
          )
          else ranked.normalized_snapshot end
        order by ranked.ordinality
      ), '[]'::jsonb)
      from (
        select marked.*,
          count(*) filter (where marked.matches_catalog) over (
            order by marked.ordinality
          ) as match_rank
        from (
          select
            song.ordinality,
            normalized.snapshot as normalized_snapshot,
            private.song_snapshot_matches_catalog(
              normalized.snapshot, v_original.id, v_normalized_isrc,
              v_mapping.canonical_id, v_apple_identities
            ) as matches_catalog
          from jsonb_array_elements(
            case when jsonb_typeof(g.repertoire) = 'array'
              then g.repertoire else '[]'::jsonb end
          ) with ordinality song(value, ordinality)
          cross join lateral (
            select case when private.song_catalog_canonical_uuid(
              song.value ->> 'canonical_song_id'
            ) = v_storefront.id
            then song.value || jsonb_build_object(
              'canonical_song_id', v_original.id::text
            )
            else song.value end as snapshot
          ) normalized
        ) marked
      ) ranked
      where not ranked.matches_catalog or ranked.match_rank = 1
    )
    where exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(g.repertoire) = 'array'
          then g.repertoire else '[]'::jsonb end
      ) song(value)
      cross join lateral (
        select case when private.song_catalog_canonical_uuid(
          song.value ->> 'canonical_song_id'
        ) = v_storefront.id
        then song.value || jsonb_build_object(
          'canonical_song_id', v_original.id::text
        )
        else song.value end as snapshot
      ) normalized
      where private.song_catalog_canonical_uuid(
          song.value ->> 'canonical_song_id'
        ) = v_storefront.id
        or private.song_snapshot_matches_catalog(
          normalized.snapshot, v_original.id, v_normalized_isrc,
          v_mapping.canonical_id, v_apple_identities
        )
    );
    update public.group_events e
    set setlist = (
      select coalesce(jsonb_agg(
        case when ranked.matches_catalog and ranked.match_rank = 1
          then private.merge_song_enrichment_snapshot(
            ranked.normalized_snapshot, v_catalog, v_links
          )
          else ranked.normalized_snapshot end
        order by ranked.ordinality
      ), '[]'::jsonb)
      from (
        select marked.*,
          count(*) filter (where marked.matches_catalog) over (
            order by marked.ordinality
          ) as match_rank
        from (
          select
            song.ordinality,
            normalized.snapshot as normalized_snapshot,
            private.song_snapshot_matches_catalog(
              normalized.snapshot, v_original.id, v_normalized_isrc,
              v_mapping.canonical_id, v_apple_identities
            ) as matches_catalog
          from jsonb_array_elements(
            case when jsonb_typeof(e.setlist) = 'array'
              then e.setlist else '[]'::jsonb end
          ) with ordinality song(value, ordinality)
          cross join lateral (
            select case when private.song_catalog_canonical_uuid(
              song.value ->> 'canonical_song_id'
            ) = v_storefront.id
            then song.value || jsonb_build_object(
              'canonical_song_id', v_original.id::text
            )
            else song.value end as snapshot
          ) normalized
        ) marked
      ) ranked
      where not ranked.matches_catalog or ranked.match_rank = 1
    )
    where exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(e.setlist) = 'array'
          then e.setlist else '[]'::jsonb end
      ) song(value)
      cross join lateral (
        select case when private.song_catalog_canonical_uuid(
          song.value ->> 'canonical_song_id'
        ) = v_storefront.id
        then song.value || jsonb_build_object(
          'canonical_song_id', v_original.id::text
        )
        else song.value end as snapshot
      ) normalized
      where private.song_catalog_canonical_uuid(
          song.value ->> 'canonical_song_id'
        ) = v_storefront.id
        or private.song_snapshot_matches_catalog(
          normalized.snapshot, v_original.id, v_normalized_isrc,
          v_mapping.canonical_id, v_apple_identities
        )
    );

    if exists (
      select 1 from public.song_catalog c
      where c.id = v_storefront.id
         or c.platform_ids ->> 'appleMusic' = v_mapping.storefront_id
    ) or not exists (
      select 1 from private.song_apple_identities i
      where i.song_id = v_original.id
        and i.apple_id = v_mapping.canonical_id
        and i.kind = 'canonical'
    ) or not exists (
      select 1 from private.song_apple_identities i
      where i.song_id = v_original.id
        and i.apple_id = v_mapping.storefront_id
        and i.kind = 'storefront'
        and i.market = 'CH'
    ) or exists (
      select 1
      from public.music_groups g
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(g.repertoire) = 'array'
          then g.repertoire else '[]'::jsonb end
      ) song(value)
      where private.song_catalog_canonical_uuid(
        song.value ->> 'canonical_song_id'
      ) = v_storefront.id
    ) or exists (
      select 1
      from public.group_events e
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(e.setlist) = 'array'
          then e.setlist else '[]'::jsonb end
      ) song(value)
      where private.song_catalog_canonical_uuid(
        song.value ->> 'canonical_song_id'
      ) = v_storefront.id
    ) or (
      v_storefront_job.song_id is not null
      and not exists (
        select 1 from private.song_enrichment_jobs j
        where j.song_id = v_original.id
          and j.state = v_storefront_job.state
      )
    ) then
      raise exception 'apple_storefront_merge_incomplete:%',
        v_mapping.canonical_id using errcode = '23514';
    end if;
  end loop;

  if (select count(*) from private.song_enrichment_jobs)
      <> v_jobs_before - v_expected_job_delta
  then
    raise exception 'apple_storefront_job_merge_count_mismatch'
      using errcode = '23514';
  end if;

end;
$$;

create or replace function private.preserve_song_catalog_apple_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_id text := nullif(old.platform_ids ->> 'appleMusic', '');
  v_new_id text := nullif(new.platform_ids ->> 'appleMusic', '');
begin
  if v_old_id is not null and v_new_id is distinct from v_old_id then
    new.platform_ids := jsonb_set(
      coalesce(new.platform_ids, '{}'::jsonb),
      '{appleMusic}',
      to_jsonb(v_old_id),
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_song_catalog_apple_identity()
  from public, anon, authenticated;

drop trigger if exists song_catalog_10_preserve_apple_identity
  on public.song_catalog;
create trigger song_catalog_10_preserve_apple_identity
before update of platform_ids on public.song_catalog
for each row execute function private.preserve_song_catalog_apple_identity();

create or replace function private.record_song_apple_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_apple_id text;
begin
  if tg_table_name = 'song_catalog' then
    v_apple_id := nullif(new.platform_ids ->> 'appleMusic', '');
    if v_apple_id ~ '^[0-9]{1,20}$' then
      insert into private.song_apple_identities (
        song_id, apple_id, kind, market, source, verified_at
      ) values (
        new.id, v_apple_id, 'canonical', null,
        coalesce(nullif(new.metadata_source, ''), 'catalog'),
        coalesce(new.metadata_updated_at, clock_timestamp())
      )
      on conflict (song_id, apple_id) do update
      set kind = 'canonical', market = null,
          source = excluded.source,
          verified_at = greatest(
            private.song_apple_identities.verified_at,
            excluded.verified_at
          );
    end if;
    return new;
  end if;

  if new.platform = 'appleMusic'
    and new.match_kind = 'exact'
    and new.source in ('odesli', 'musicfetch', 'odesli+musicfetch')
    and new.external_id ~ '^[0-9]{1,20}$'
    and private.song_catalog_apple_track_id_from_url(new.url) = new.external_id
  then
    insert into private.song_apple_identities (
      song_id, apple_id, kind, market, source, verified_at
    ) values (
      new.song_id, new.external_id, 'storefront', upper(new.market),
      new.source, coalesce(new.checked_at, clock_timestamp())
    )
    on conflict (song_id, apple_id) do update
    set kind = case
          when private.song_apple_identities.kind = 'canonical'
            then 'canonical'
          else 'storefront'
        end,
        market = case
          when private.song_apple_identities.kind = 'canonical'
            then null
          else excluded.market
        end,
        source = excluded.source,
        verified_at = greatest(
          private.song_apple_identities.verified_at,
          excluded.verified_at
        );
  end if;
  return new;
end;
$$;

revoke all on function private.record_song_apple_identity()
  from public, anon, authenticated;

drop trigger if exists song_catalog_record_apple_identity
  on public.song_catalog;
create trigger song_catalog_record_apple_identity
after insert or update of platform_ids, metadata_source
on public.song_catalog
for each row execute function private.record_song_apple_identity();

drop trigger if exists song_platform_links_record_apple_identity
  on public.song_platform_links;
create trigger song_platform_links_record_apple_identity
after insert or update of platform, market, url, external_id, source, match_kind
on public.song_platform_links
for each row execute function private.record_song_apple_identity();
