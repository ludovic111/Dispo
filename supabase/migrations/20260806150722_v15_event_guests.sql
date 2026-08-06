-- Dispo 1.5 — l'invité d'un soir.
--
-- Quand un SOS publié pour un événement de groupe trouve preneur, le musicien
-- retenu n'entre pas dans le groupe : il joue CE soir-là, et nulle part
-- ailleurs. Le groupe doit quand même le voir dans l'événement — sinon
-- personne ne sait qui remplace qui.
--
-- Les candidatures ne sont lisibles que par l'organisateur et le candidat
-- (RLS). Cette fonction ouvre juste ce qu'il faut : les invités des événements
-- des groupes dont je fais partie, et rien d'autre.

create or replace function public.my_event_guests()
returns table (
    event_id   uuid,
    group_id   uuid,
    gig_id     uuid,
    musician_id uuid,
    name       text,
    instrument text,
    photo_url  text
)
language sql
stable
security definer
set search_path = public
as $$
    select e.id, e.group_id, g.id, a.musician_id,
           coalesce(nullif(p.name, ''), 'Invité'),
           a.instrument,
           p.photo_url
      from public.gig_requests g
      join public.group_events e on e.id = g.event_id
      join public.gig_applications a on a.gig_id = g.id and a.status = 'accepted'
      join public.profiles p on p.id = a.musician_id
     where exists (
         select 1 from public.group_members m
         where m.group_id = e.group_id and m.profile_id = auth.uid()
     );
$$;

revoke all on function public.my_event_guests() from public, anon;
grant execute on function public.my_event_guests() to authenticated;
