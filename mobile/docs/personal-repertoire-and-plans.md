# Répertoire personnel et formules — build 54

Le répertoire se trouve dans le profil. Il est privé à sa création. Les membres
d'un groupe reçoivent ses morceaux approuvés et ceux de ses événements, y compris
lorsqu'ils rejoignent un groupe existant. Les suggestions non approuvées attendent
leur validation. Quitter un groupe conserve le travail personnel.

Chaque morceau possède une maîtrise (0 à 3) et un classement personnel. Les
changements de maîtrise et de style ne modifient jamais les groupes. La recherche
porte sur le titre, l'artiste et le style ; les tris portent sur le titre, le style
ou la maîtrise. Le catalogue et la saisie libre servent aux ajouts manuels.

Un retrait masque durablement le morceau dans le répertoire, sans le supprimer des
groupes. Les imports ultérieurs et une nouvelle adhésion ne le restaurent pas.
Un ajout manuel peut le restaurer, en conservant sa maîtrise. Les doublons sont
reconnus par titre/artiste normalisés ou par identifiant de catalogue partagé.
Les solos, contributeurs et notes privées des groupes ne sont jamais importés.

Les morceaux ajoutés manuellement peuvent être copiés vers plusieurs groupes et
événements. Le flux de copie existant conserve les contrôles de rôle, suggestions,
doublons, concurrence et résultats partiels. Un visiteur consulte seulement les
répertoires publics ; les blocages dans les deux directions restent prioritaires.

Les deux migrations versionnées créent les tables, RLS et triggers, puis
transfèrent l'ancien tableau de titres de profil avant de vider son champ public.
La seconde migration évite qu'un ancien client contourne le choix privé.

## Formules (2.5.3)

Seules des formules **mensuelles** sont vendues dans l'app (les identifiants
annuels restent reconnus côté serveur pour les abonnés existants).

| Formule | Mensuel CHF | Groupes dirigés | Répertoire personnel | Vidéos de démo |
| ------- | ----------: | --------------: | :------------------: | -------------: |
| Gratuit |           — |               0 |         oui          |   1 × 1 min 30 |
| Groupe  |        2.90 |               1 |         oui          |   1 × 1 min 30 |
| Premium |        6.90 |               6 |         oui          |   6 × 1 min 30 |

Gratuit pour tout le monde depuis 2.5 : filtres avancés, dates récurrentes,
rappels configurables et Auto-SOS (`freeCapabilities` dans `premium-model.ts`,
triggers serveur relâchés par la migration `20260913152000_pricing_2_5_amr`).

Depuis 2.5.3, le répertoire personnel est gratuit : ajouts, arrangements, maîtrise,
styles, copie autorisée et partage public facultatif. Les répertoires restent
privés par défaut ; les blocages et droits des groupes restent inchangés.
Migration : `20260920103828_free_personal_repertoire`.

Écoles :

- **Groupes d'atelier** : un membre actif d'une école dont
  `music_schools.free_workshops_until` couvre la date du jour peut créer et
  diriger des groupes portant `music_groups.school_id`, quelle que soit sa
  formule ; ces groupes ne comptent jamais dans le quota payant. AMR :
  `free_workshops_until = 2028-12-31`.
- **Premium offert** : `public.school_premium_grants` définit des fenêtres
  pendant lesquelles les membres actifs d'une école sont Premium sans achat
  (`get_my_subscription()` renvoie `source = 'school_grant'`). AMR : du
  1ᵉʳ octobre 2026 au 31 janvier 2027 (Europe/Zurich). `profiles.is_premium`
  est recalculé à chaque changement d'affiliation et chaque nuit (pg_cron,
  00:05 UTC, job `dispo-refresh-profile-premium-daily`).
- Les codes d'offre Apple des écoles partenaires (réduction de 30 %) restent
  utilisables via « Utiliser un code école ».

Tout membre Premium — abonnement ou offre d'école — porte la coche bleue
`VerifiedBadge` à côté de son nom. Les prix de boutique réels sont toujours lus
depuis StoreKit ; `premium-model.ts` ne garde que des prix de référence.

## Vérification

- `npm run validate`, `npm run format:check`, `npx expo-doctor`.
- Tests SQL de `supabase/tests/database/personal_repertoire.test.sql` sur la base locale.
- Comptes locaux distincts : import, maîtrise, retrait/réajout, copie vers un
  événement, public/privé et consultation sans modification.
- Contrôles visuels iOS et Android, et site FR/EN à 390 et 1440 pixels.
- Builds natifs de production, vérification des signatures et absence de
  configuration locale de test dans les bundles avant upload TestFlight.

Les preuves détaillées sont conservées hors Git dans
`Dispo-dist/qa-20260908-personal-repertoire/`.
