-- Personal edits are separate from the imported recording. Group refreshes keep
-- working without replacing a musician's own key, tempo, form or display title.
alter table public.personal_repertoire add column arrangement jsonb not null default '{}';
alter table public.personal_repertoire add constraint personal_arrangement_object
  check (jsonb_typeof(arrangement) = 'object' and pg_column_size(arrangement) <= 4096);

create function private.update_personal_arrangement(p_id uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_changes jsonb;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or pg_column_size(p_changes) > 4096
    or exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('title','artist','key','tempo_bpm','form'))
  then raise exception 'invalid_arrangement' using errcode = '22023'; end if;
  if (p_changes ? 'title' and (jsonb_typeof(p_changes->'title') is distinct from 'string' or coalesce(length(btrim(p_changes->>'title')),0) not between 1 and 200))
    or (p_changes ? 'artist' and (jsonb_typeof(p_changes->'artist') is distinct from 'string' or length(p_changes->>'artist') > 200))
    or (p_changes ? 'key' and p_changes->'key' <> 'null'::jsonb and (jsonb_typeof(p_changes->'key') <> 'string' or length(p_changes->>'key') > 20))
    or (p_changes ? 'form' and p_changes->'form' <> 'null'::jsonb and (jsonb_typeof(p_changes->'form') <> 'string' or length(p_changes->>'form') > 500))
    or (p_changes ? 'tempo_bpm' and p_changes->'tempo_bpm' <> 'null'::jsonb and (jsonb_typeof(p_changes->'tempo_bpm') <> 'number' or (p_changes->>'tempo_bpm') !~ '^[0-9]+$'))
  then raise exception 'invalid_arrangement' using errcode = '22023'; end if;
  if p_changes ? 'tempo_bpm' and p_changes->'tempo_bpm' <> 'null'::jsonb then
    if (p_changes->>'tempo_bpm')::numeric not between 1 and 400 then
      raise exception 'invalid_tempo' using errcode = '22023';
    end if;
  end if;
  v_changes := p_changes;
  if v_changes ? 'title' then v_changes := jsonb_set(v_changes,'{title}',to_jsonb(btrim(v_changes->>'title'))); end if;
  if v_changes ? 'artist' then v_changes := jsonb_set(v_changes,'{artist}',to_jsonb(btrim(v_changes->>'artist'))); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 54001));
  update public.personal_repertoire set arrangement = arrangement || v_changes
    where id = p_id and profile_id = v_owner and not hidden;
  if not found then raise exception 'song_not_found' using errcode = '42501'; end if;
end;
$$;
create function public.update_personal_arrangement(p_id uuid, p_changes jsonb)
returns void language sql security invoker set search_path = '' as $$
  select private.update_personal_arrangement(p_id, p_changes)
$$;
revoke all on function private.update_personal_arrangement(uuid,jsonb), public.update_personal_arrangement(uuid,jsonb) from public, anon;
grant execute on function private.update_personal_arrangement(uuid,jsonb), public.update_personal_arrangement(uuid,jsonb) to authenticated;

-- Preserve manual form edits atomically when adding/restoring a song.
create or replace function public.add_personal_song(p_song jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  v_id := private.add_personal_song(p_song);
  if nullif(btrim(p_song->>'form'),'') is not null then
    perform private.update_personal_arrangement(v_id,jsonb_build_object('form',p_song->'form'));
  end if;
  return v_id;
end;
$$;
