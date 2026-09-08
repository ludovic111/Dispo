-- Move the old title-only list into the private-by-default repertoire.
-- Clear the old public field only after every non-empty title has been preserved,
-- so a user making the new repertoire private cannot leak it through old clients.
do $$
declare v_profile record; v_title text; v_song jsonb; v_existing uuid;
begin
  for v_profile in select id,repertoire from public.profiles where cardinality(repertoire)>0 order by id loop
    perform pg_advisory_xact_lock(hashtextextended(v_profile.id::text,54001));
    foreach v_title in array v_profile.repertoire loop
      if nullif(btrim(v_title),'') is null then continue; end if;
      if length(btrim(v_title))>200 then raise exception 'legacy_repertoire_title_too_long'; end if;
      select id into v_existing from public.personal_repertoire where profile_id=v_profile.id
        and lower(regexp_replace(btrim(song->>'title'),'\s+',' ','g'))=lower(regexp_replace(btrim(v_title),'\s+',' ','g'))
        order by hidden desc,created_at,id limit 1;
      if v_existing is not null then
        update public.personal_repertoire set origin='manual' where id=v_existing;
      else
        v_song:=jsonb_build_object('title',btrim(v_title),'artist','');
        insert into public.personal_repertoire(profile_id,song,identity,origin)
          values(v_profile.id,v_song,private.personal_song_identity(v_song),'manual');
      end if;
    end loop;
    update public.profiles set repertoire='{}'::text[] where id=v_profile.id;
  end loop;
end $$;
