-- Revoke PUBLIC execute on new SECURITY DEFINER helpers/triggers.
-- (Postgres grants EXECUTE to PUBLIC by default; revoke anon/authenticated alone is not enough.)

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_group_leader(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_leader(uuid) to authenticated;

revoke execute on function public.add_leader_as_member() from public, anon, authenticated;
revoke execute on function public.mark_leader_available_on_event() from public, anon, authenticated;
