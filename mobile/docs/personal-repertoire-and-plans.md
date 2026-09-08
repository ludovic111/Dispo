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

## Formules au lancement

| Formule | Mensuel CHF | Annuel CHF | Droits futurs                                                       |
| ------- | ----------: | ---------: | ------------------------------------------------------------------- |
| Groupe  |        2.90 |      29.00 | Créer et diriger un groupe, sans avantages Premium                  |
| Premium |        6.90 |      69.00 | Groupes illimités, tous les avantages Premium, répertoire personnel |

La réduction des écoles partenaires est de 30 % : 2.03 / 20.30 CHF pour Groupe,
4.83 / 48.30 CHF pour Premium. L'affiliation doit être validée ; le commutateur
de tarifs permet seulement de prévisualiser la réduction.

La bêta 2.4 reste gratuite. Aucun achat ni restriction de groupe n'est activé.
Les prix et les futurs droits sont définis et testés dans `premium-model.ts` et
présentés dans l'app et sur le site FR/EN. Avant une commercialisation : créer les
produits et offres dans les boutiques, connecter la validation serveur des achats,
les droits et les affiliations partenaires, puis tester achats/restaurations.
Un prix de boutique réel devra toujours être lu depuis la boutique.

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
