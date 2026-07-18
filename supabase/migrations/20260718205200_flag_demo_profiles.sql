-- Marque les comptes de démonstration (…@demo.dispo.ch) de façon versionnée.
-- Jusqu'ici ce marquage était une opération manuelle hors Git : une base
-- recréée depuis les migrations laissait les profils de démo non marqués
-- (badge « Démo » absent, reply_as_demo refusant de répondre).
-- Le trigger protect_demo_flag autorise ce changement pour les rôles
-- d'administration (postgres / service_role / supabase_admin).
update public.profiles p
set is_demo = true
from auth.users u
where u.id = p.id
  and u.email like '%@demo.dispo.ch'
  and p.is_demo is distinct from true;
