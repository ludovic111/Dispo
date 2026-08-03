-- Dispo 1.3 — ménage de schéma.
--
-- 1. `favorites` : les favoris ont été retirés de l'app en 0.9.5. La table
--    avait été conservée pour ne pas casser les builds 0.9.4 installés ;
--    l'app n'étant pas encore publiée (seul TestFlight tourne, en 1.2),
--    plus personne ne l'interroge.
-- 2. `appreciations` : remplacées en 0.9.5 par les notes 5 étoiles anonymes
--    (`ratings`), où les 26 lignes ont déjà été converties.
--    Sauvegarde des deux tables : Dispo-dist/db-backups/.
-- 3. `mark_conversation_read` / `mark_messages_delivered` étaient exécutables
--    par le rôle `anon`. Elles s'appuient sur `auth.uid()` (donc sans effet
--    hors session), mais rien ne justifie de les exposer sans authentification.

drop table if exists public.favorites;
drop table if exists public.appreciations;

-- L'EXECUTE venait du grant implicite à PUBLIC, dont `anon` hérite :
-- révoquer sur `anon` seul ne suffit pas.
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.mark_messages_delivered() from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_messages_delivered() to authenticated;
