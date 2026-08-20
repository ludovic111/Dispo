# Plan d’implémentation Dispo 2.1

1. Ajouter des tests unitaires pour le modèle de lieu, la sélection multiple, l’unicité des symboles d’événement et le libellé de tonalité.
2. Créer le contexte pays et le composant de lieu partagé, puis remplacer les saisies disparates dans l’inscription, le profil, les disponibilités, les filtres, les SOS et les événements.
3. Versionner et déployer les colonnes de lieu du profil, en conservant des replis compatibles pour les anciennes données.
4. Introduire des composants de choix cohérents et rendre les filtres instruments, styles et niveaux multisélection.
5. Centraliser les symboles de concert, répétition et jam, puis les utiliser sur les cartes, détails et formulaires.
6. Ajouter la tonalité aux tuiles de morceau et clarifier les rôles sémantiques de la palette existante.
7. Régénérer Xcode, exécuter tests, contrôles musique/i18n, build et analyse, puis vérifier les parcours touchés sur simulateur.
8. Ajouter l’entrée obligatoire au journal racine, committer et pousser `rename-to-dispo` sur GitHub.
