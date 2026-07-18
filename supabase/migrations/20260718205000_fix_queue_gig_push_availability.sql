-- La 0.9.2 a introduit queue_gig_push avec un filtre sur profiles.availability,
-- colonne supprimée par 20260708140000_available_dates : chaque INSERT sur
-- gig_requests échouait (42703) — publier un SOS était cassé côté serveur.
-- La dispo se dérive désormais des dates cochées (au moins une à venir).
create or replace function public.queue_gig_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_notifications
    (user_id, actor_id, category, title, body, data, source_table, source_id)
  select
    p.id,
    new.host_id,
    'sos',
    'Nouveau SOS compatible',
    left(new.title || case when new.place <> '' then ' · ' || new.place else '' end, 180),
    jsonb_build_object('category', 'sos', 'target_tab', 'sos', 'gig_id', new.id::text),
    'gig_requests',
    new.id
  from public.profiles p
  where p.id <> new.host_id
    and exists (
      select 1 from unnest(p.available_dates) as dispo(day)
      where dispo.day >= current_date
    )
    and p.instruments && new.wanted_instruments
    and exists (
      select 1 from public.push_devices d
      where d.user_id = p.id and d.notifications_enabled and d.sos_enabled
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p.id and b.blocked_id = new.host_id)
         or (b.blocker_id = new.host_id and b.blocked_id = p.id)
    )
  on conflict do nothing;
  return new;
end;
$$;
