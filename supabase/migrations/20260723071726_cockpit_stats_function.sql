-- Statistiques agrégées pour le cockpit interne (Edge Function `cockpit`).
-- Réservée au service_role : jamais exposée à anon/authenticated.
create or replace function public.cockpit_stats()
returns jsonb
language sql
security definer
set search_path = public, auth, storage
as $$
  select jsonb_build_object(
    'real_profiles',        (select count(*) from public.profiles where is_demo = false),
    'demo_profiles',        (select count(*) from public.profiles where is_demo = true),
    'premium_real',         (select count(*) from public.profiles where is_demo = false and is_premium = true),
    'auth_users',           (select count(*) from auth.users),
    'active_30d',           (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'new_7d',               (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'sos_total',            (select count(*) from public.gig_requests),
    'sos_upcoming',         (select count(*) from public.gig_requests where date > now()),
    'messages_total',       (select count(*) from public.messages),
    'group_messages_total', (select count(*) from public.group_messages),
    'groups_total',         (select count(*) from public.music_groups),
    'storage_bytes',        (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'storage_objects',      (select count(*) from storage.objects),
    'generated_at',         now()
  );
$$;

revoke all on function public.cockpit_stats() from public;
revoke all on function public.cockpit_stats() from anon;
revoke all on function public.cockpit_stats() from authenticated;
grant execute on function public.cockpit_stats() to service_role;
