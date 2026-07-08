-- Durcissement (linter Supabase) : search_path figé sur les fonctions
-- SECURITY DEFINER et retrait de l'EXECUTE inutile. Déjà appliqué sur le
-- projet hébergé.
-- search_path = public (et non '') : les corps de fonctions utilisent des
-- références non qualifiées ; on fige la résolution sans les casser.
alter function public.touch_updated_at() set search_path = public;
alter function public.protect_admin_flag() set search_path = public;
alter function public.can_see_full_gig(public.gig_requests) set search_path = public;
alter function public.is_conversation_member(uuid) set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- handle_new_user est un trigger interne (auth.users) : personne n'a besoin
-- de l'appeler via l'API REST.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- L'app impose la connexion : anon n'a aucune raison d'appeler ces
-- fonctions. authenticated garde EXECUTE (les policies RLS les évaluent).
revoke execute on function public.can_see_full_gig(public.gig_requests) from anon;
revoke execute on function public.is_conversation_member(uuid) from anon;

-- Note : la vue gig_requests_feed reste volontairement SECURITY DEFINER —
-- c'est elle qui applique le masquage teaser de l'avant-première Premium
-- (les colonnes sensibles sont déjà masquées dans la vue elle-même).
