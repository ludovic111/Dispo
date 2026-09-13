# Dispo 2.5.0 — reprise du 13 septembre 2026

La version reprend la session Claude interrompue par sa limite d’usage, puis ajoute les correctifs d’intégration et la livraison Codex.

## Périmètre

- Tarifs mensuels, filtres et organisation automatisée gratuits, avantages AMR.
- Matching SOS avec critères, répertoire, contact préalable unique et dédoublonnage des demandes.
- Groupes : auteur des suggestions, discussions ouvertes par le leader, réponses, réactions, modification et départ d’un membre.
- Calendrier, pochettes masquables, onboarding, quinze thèmes et corrections d’affichage.
- Modération, restrictions des comptes, quotas et verrouillage des écritures privilégiées.
- Passkeys natives sur iPhone : inscription, connexion et révocation ; challenges vérifiés par Supabase. [API Supabase expérimentale](https://supabase.com/docs/guides/auth/passkeys).

## Correctifs de reprise

- Traductions terminées dans les huit langues en plus du français ; parité des clés et placeholders contrôlée.
- Écritures calendrier sérialisées : les ajouts simultanés ne créent plus de doublon et ne perdent plus la carte des événements. Régression reproduite avant correctif.
- RPC de matching SECURITY DEFINER : exclusion des profils bannis. Régression reproduite avant correctif SQL.
- Fin de suite Jest sans fuite de timer du QueryClient de test.

## Validation

- TypeScript strict, ESLint, 92 suites Jest et 629 tests réussis.
- 18 suites SQL transactionnelles locales réussies ; rejeu des migrations dans une base fantôme réussi.
- 16 tests Deno réussis ; vérification de types des deux fonctions modifiées réussie.
- Huit migrations présentes en production ; `revenuecat-webhook` et `sync-subscription` déployées après les migrations.
- Captures iOS FR/EN 1320 × 2868 vérifiées ; parcours locaux iOS/Android de Claude conservés dans le dossier QA.
- Expo Doctor : 20/21 contrôles, avertissements de versions correctives des dépendances déjà présents avant ce lot.

## Limites

- Aucun fournisseur SMS : Ludovic le confirme. Les vérifications téléphone et e-mail obligatoires restent désactivées dans `app_settings`. Les textes ne promettent pas de SMS actif.
- Passkeys Android non proposées tant que le certificat de distribution Android n’est pas associé au domaine. Aucun certificat de debug autorisé sur le domaine de production.
- Création puis connexion par passkey sur un iPhone physique avec trousseau iCloud encore à valider. Les tests vérifient le contrat natif/serveur, les refus et l’annulation.
- Synchronisation calendrier sur activation et autorisation système de l’utilisateur.
- Advisors : RPC SECURITY DEFINER intentionnellement accessibles aux utilisateurs authentifiés et double policy SELECT des signalements ; aucune erreur critique. Les tables privées sans policy sont volontairement fermées aux rôles API.
- Le site présente la 2.5 en aperçu jusqu’à l’approbation Apple. TestFlight, App Review et publication restent des états distincts.

Les preuves de signature, import Apple, revue et déploiement sont conservées hors Git dans `Dispo-dist/qa-20260913-release-2.5/` et `Dispo-dist/2.5.0/`.

## Livraison confirmée

- PR [#2](https://github.com/ludovic111/Dispo/pull/2) fusionnée sur `main` : `8dbe3b5`.
- iOS 2.5.0 (64) signé, import `VALID`, `APP_STORE_ELIGIBLE`, TestFlight interne `IN_BETA_TESTING`.
- Soumission Apple `1c58e7ad-94b4-461c-95eb-7f936ed3b524` : `WAITING_FOR_REVIEW` depuis le 13 septembre 2026 à 18:59:33 Europe/Paris. Dix captures FR/EN `COMPLETE`, descriptions et nouveautés actualisées. Suisse et 13+ conservés.
- Site `7822345` déployé sur Railway, état `SUCCESS` ; routes et association de domaine HTTP 200.
- Passkeys iPhone : association Apple et configuration Auth actives ; challenge serveur pour `dispoapp.net` confirmé. Validation physique iCloud toujours à faire.
- APK Android de validation conservé hors Git ; signature de debug, aucune distribution Google Play.
