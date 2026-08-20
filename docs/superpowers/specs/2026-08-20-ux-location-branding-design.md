# Dispo 2.1 — lieu, choix et identité visuelle

## Intention

Chaque écran doit guider sans demander à l’utilisateur de traduire le modèle de données de l’app. Les mêmes actions ont donc la même apparence, les lieux suivent le même parcours et les informations importantes sont visibles sans ouvrir une fiche.

## Lieux

- L’app déduit d’abord le pays à partir de la position déjà autorisée, puis de la région du téléphone, puis du pays enregistré dans le profil.
- Le pays reste toujours visible et modifiable : la détection aide, elle ne verrouille jamais.
- L’utilisateur saisit uniquement son code postal. Dispo remplit automatiquement la ville et montre une confirmation compacte.
- Si le code n’est pas reconnu, un champ ville apparaît comme solution de repli. Aucun écran ne bloque sur un annuaire incomplet.
- Le même composant est utilisé dans l’inscription, le profil, les disponibilités, les filtres, les SOS et les événements de groupe.
- Le profil conserve pays, code postal et ville côté Supabase. Les objets qui ne possèdent pas encore de colonnes structurées conservent un libellé de lieu complet dans leur champ existant.

## Sélections

- Les choix réellement pluriels (instruments, styles, niveaux recherchés) utilisent des pastilles multisélection avec coche, compteur et action d’effacement.
- Les choix incompatibles entre eux (type d’événement, pays, récurrence, paiement) restent uniques, mais utilisent la même famille visuelle.
- Dans un filtre, plusieurs valeurs d’une même famille signifient « l’une ou l’autre » ; les familles se cumulent entre elles.

## Événements et morceaux

- Concert, répétition et jam ont chacun un symbole SF Symbols stable, accompagné du libellé. La couleur n’est jamais le seul vecteur d’information.
- La tonalité est visible directement sur toute tuile de morceau quand elle existe, sous la forme d’une pastille courte.

## Branding

- La palette 2.0 reste la source unique : fond nuit `#050814`, surfaces `#0A1128`/`#0E1835`, cyan `#00D2FF`/`#0099FF`, texte `#F0F4FF`, secondaire `#8E9AAF`.
- Le cyan signifie action, sélection et progression. L’orange-rouge reste réservé aux SOS, erreurs et actions dangereuses. Le gris bleuté porte les informations neutres.
- Tous les contrôles gardent une cible tactile d’au moins 44 points et un libellé explicite. Les icônes renforcent le texte, elles ne le remplacent pas.

## Compatibilité

- Les valeurs persistées existantes et les identifiants de deep links ne changent pas.
- Les anciennes lignes Supabase restent valides grâce à des colonnes nullable et des replis client.
- Les symboles et composants visuels ciblent iOS 17, cible minimale actuelle du projet.
