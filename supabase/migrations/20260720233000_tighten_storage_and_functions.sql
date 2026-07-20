-- Suite au passage des advisors sécurité :
-- 1. Les buckets publics n'ont pas besoin de policy SELECT pour servir les
--    fichiers par URL publique — la policy large permettait de LISTER tous
--    les fichiers (énumération des dossiers <uid>/). On la retire.
-- 2. refresh_profile_rating (fonction trigger SECURITY DEFINER) n'a pas à
--    être appelable via l'API REST.
-- 3. protect_premium_flag : fixe le search_path (warning historique).

drop policy if exists "demo_videos_public_read" on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;

revoke execute on function public.refresh_profile_rating() from anon, authenticated;

alter function public.protect_premium_flag() set search_path = '';
