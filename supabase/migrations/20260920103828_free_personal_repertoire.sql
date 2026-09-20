-- Personal repertoire is free. Ownership, opt-in sharing and blocks remain enforced.
begin;

drop trigger personal_repertoire_edit_subscription on public.personal_repertoire;
drop trigger personal_repertoire_visibility_subscription on public.personal_repertoire_settings;
drop function private.guard_personal_repertoire_edit();

create or replace function private.can_read_personal_repertoire(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (p_owner=(select auth.uid()) or (
    exists(select 1 from public.personal_repertoire_settings s where s.profile_id=p_owner and s.is_public)
    and exists(select 1 from public.profiles p where p.id=p_owner and length(btrim(p.name))>=2 and cardinality(p.instruments)>0)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=p_owner and b.blocked_id=(select auth.uid())) or
      (b.blocked_id=p_owner and b.blocker_id=(select auth.uid())))
  ))
$$;
CREATE OR REPLACE FUNCTION private.add_personal_song(p_song jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid := (select auth.uid()); v_payload jsonb; v_id uuid;
begin
  if v_owner is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if jsonb_typeof(p_song) is distinct from 'object' or coalesce(length(btrim(p_song->>'title')),0) not between 1 and 200
    or length(coalesce(p_song->>'artist','')) > 200 or pg_column_size(p_song) > 16384
  then raise exception 'invalid_song' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 54001));
  v_payload := private.personal_song_payload(p_song) || jsonb_build_object('title', btrim(p_song->>'title'), 'artist', btrim(coalesce(p_song->>'artist','')));
  select id into v_id from public.personal_repertoire where profile_id=v_owner
    and private.personal_songs_match(song,v_payload) order by hidden desc,created_at,id limit 1;
  if v_id is not null then
    update public.personal_repertoire set hidden=false,origin='manual',song=v_payload where id=v_id;
  else
    insert into public.personal_repertoire(profile_id,song,identity,origin)
    values(v_owner,v_payload,private.personal_song_identity(v_payload),'manual') returning id into v_id;
  end if;
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.update_personal_arrangement(p_id uuid, p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


notify pgrst, 'reload schema';
commit;
