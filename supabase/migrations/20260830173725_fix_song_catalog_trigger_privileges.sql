-- Les triggers s'exécutent sous le rôle qui modifie le répertoire ou la
-- setlist. Leur helper privé est volontairement exécutable uniquement par
-- postgres ; en SECURITY INVOKER, toute écriture authentifiée échouait donc
-- avec `permission denied for function assert_unique_song_cards` avant même
-- que les contrôles d'unicité soient évalués.
--
-- Les deux wrappers ne prennent aucun argument, ne font aucune écriture et
-- conservent `search_path = ''`. SECURITY DEFINER leur permet uniquement
-- d'appeler le helper privé pendant l'exécution du trigger. Les appels directs
-- restent révoqués pour les rôles exposés.

alter function private.guard_unique_group_repertoire() security definer;
alter function private.guard_unique_event_setlist() security definer;

revoke all on function private.guard_unique_group_repertoire()
  from public, anon, authenticated;
revoke all on function private.guard_unique_event_setlist()
  from public, anon, authenticated;
