-- La dispo devient une liste de dates concrètes (l'utilisateur coche un
-- calendrier) au lieu d'un statut abstrait « cette semaine / ce week-end ».
-- Le statut affiché (Ce soir, Cette semaine…) est dérivé côté app.

alter table public.profiles add column available_dates date[] not null default '{}';

-- Reprise des statuts existants vers des dates plausibles.
update public.profiles set available_dates = case availability
  when 'Ce soir'       then array[current_date, current_date + 2]
  when 'Cette semaine' then array[current_date + 1, current_date + 3]
  when 'Ce week-end'   then array[
    current_date + ((6 - extract(dow from current_date)::int + 7) % 7),
    current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 1
  ]
  when 'Sur demande'   then array[current_date + 12]
  else '{}'::date[]
end;

alter table public.profiles drop column availability;
