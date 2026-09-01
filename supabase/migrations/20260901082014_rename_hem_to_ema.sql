-- Corrige l'établissement affiché dans l'annuaire sans recréer la ligne :
-- les affiliations existantes conservent ainsi leur school_id.
do $$
declare
  v_updated integer;
begin
  update public.music_schools
  set slug = 'ema-geneve',
      name = 'École des Musiques Actuelles',
      short_name = 'EMA',
      website_url = 'https://ema.school'
  where slug = 'hem-geneve'
    and short_name = 'HEM';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'expected_one_hem_school_row_updated_got_%', v_updated;
  end if;
end;
$$;
