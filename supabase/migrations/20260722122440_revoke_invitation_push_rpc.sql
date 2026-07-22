-- La fonction trigger n'a pas besoin d'être appelable via l'API REST.
revoke all on function public.queue_group_invitation_push() from public, anon, authenticated;
