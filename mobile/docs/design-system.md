# Système visuel Dispo « Backstage » — règles d'écriture des écrans

Source unique : `src/theme/tokens.ts`, `src/theme/themes.ts` et
`src/components/ui/*`. Toute vue de `src/app/**` et `src/features/**` s'y
conforme. Ce document est la règle ; le code qui s'en écarte est un défaut à
corriger.

## 0. Direction

Dispo est un objet **tactile, matériel, musical** : un étui d'instrument bien
fait, une console de mixage, un billet de concert imprimé — rendus avec une
retenue moderne. Concrètement :

- les surfaces ont une **épaisseur** (dégradé léger, liseré clair en haut,
  arête plus sombre, ombre portée) ;
- les contrôles sont des **touches** que l'on enfonce (arête basse qui
  disparaît à l'appui) ;
- les étiquettes sont **gravées** dans la surface ;
- le fond est un **papier grainé** ;
- les dates et les SOS sont des **billets** perforés ;
- la seule signature « instrument » est le **VU-mètre**. Pas de faux cuir,
  pas de reflets brillants, pas de boutons 2010, pas de gadgets.

Tout cela vit dans les primitives et les tokens : **aucun écran ne
reconstruit une ombre, un dégradé ou un liseré**.

## 1. Typographie

Trois familles, un rôle chacune :

| Rôle                                                                     | Famille               | Variantes `AppText`                                                                      |
| ------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------- |
| Titres éditoriaux (écran, section, noms) et chiffres des billets         | Fraunces              | `display`, `displayItalic`, `title2`, `title3`                                           |
| Lecture et contrôles                                                     | Système (SF / Roboto) | `title`, `headline`, `body`, `callout`, `subheadline`, `footnote`, `caption`, `caption2` |
| Étiquettes gravées et données (dates courtes, BPM, tonalités, compteurs) | Spline Sans Mono      | `label`, `mono`                                                                          |

Règles :

- **Jamais** de `fontSize`, `fontWeight`, `fontFamily`, `lineHeight`,
  `letterSpacing`, `textTransform` ni `textShadow*` dans un `StyleSheet`
  d'écran. On choisit une variante, et au besoin `weight="semibold" | "bold"`
  (le `medium` existe pour les données). `800` et `900` n'existent plus.
- Rien en dessous de `caption2` (11 pt).
- Un titre principal (nom, titre de morceau, d'événement) n'est jamais tronqué
  à une ligne quand il porte l'information : `numberOfLines={2}` au minimum.
- `label` (mono majuscules) est **gravée** automatiquement : ombre de 1 pt,
  claire sur fond clair, sombre sur fond sombre, sans flou. Sur un dégradé ou
  un billet, passer `engraved={false}`. `label` sert aux étiquettes de champ et
  aux petites pastilles de statut. **Ce n'est pas un titre de section.**
- Le texte secondaire est `palette.muted`, jamais une opacité sur le texte.

## 2. Titres d'écran et de section

- Écran d'onglet ou modale sans header natif : `ScreenHeader` (titre Fraunces,
  sous-titre optionnel, `leadingAction` / `action` en `IconButton` ou
  `NativeHeaderButton`). Pas de surtitre décoratif.
- Écran empilé : header natif du `Stack`, le contenu commence sous le header
  sans second titre.
- Section : `SectionHeader` (`title`, `subtitle?`, `action?`). C'est le **seul**
  style de titre de section ; les « Modifier » / « Tout voir » passent par
  `action`.

## 3. Surfaces

- `Card` (`tone="default" | "elevated" | "inset" | "muted"`, `surface="gradient"
| "flat"`) est la seule surface. Une carte porte d'elle-même son dégradé
  vertical (haut ≈ 3 % plus clair que le bas), son liseré clair de 1 pt, son
  arête `palette.edge` et son ombre. `inset` s'enfonce dans la surface
  (remplissage plus sombre, liseré haut sombre, liseré bas clair). `flat`
  supprime le dégradé pour les listes très longues. Une `backgroundColor`
  posée par l'écran prime sur le dégradé.
- Pas de `View` avec `borderRadius` + `borderWidth` + `backgroundColor`
  réinventée. Pour une surface qui n'est pas une `Card`, consommer les
  constructeurs de tokens : `surfaceStyle(palette, tone)`,
  `insetStyle(palette)` / `insetInputStyle(palette)`, `elevation(level,
palette)`, `keyStyle(fill, edge)`.
- Rayons : `radii.*` uniquement. Cartes `radii.card`, contrôles
  `radii.control`, boutons `radii.button`, champs `radii.input`, pastilles
  `radii.round`.
- Espacements : `spacing.*` uniquement (grille de 4). Marge d'écran
  `spacing.gutter`. Les alias hérités (`chip`, `control`, `cluster`,
  `section`, `compact`, `xxxs`, `hairline`) sont à remplacer par la clé
  standard la plus proche.
- Ombres : `elevation(0–3, palette)` — 1 carte, 2 surface flottante (barre
  d'onglets, feuille), 3 billet mis en avant. Une seule ombre par vue ; sur
  Android c'est `elevation`. **Aucune ombre sur une ligne de liste** au-delà
  de celle de sa `Card`. `cardShadow(scheme)` reste pour l'existant.
- Fond : `Screen` / `DispoBackground` = couleur du thème + grain de papier
  (`GrainOverlay`, textures `assets/images/textures/grain-{light,dark}.png`,
  régénérées par `scripts/gen-textures.py`) + une lueur accent. Pas de
  dégradé de fond dans un écran. Les feuilles (`BottomSheet`) portent le même
  grain.

## 4. Couleurs et thèmes

- `palette.*` uniquement ; aucun hex dans un écran. Blanc fixe sur signal et
  dégradé premium : `onAccent`. Encre des billets papier (SOS) : `billetInk`.
  Teinte translucide : `tint(color, alpha)` (accepte hex, `rgba()`, `hsl()`).
  Mélange tolérant : `blend(a, b, t)`.
- Le bleu **Jazz** est le thème par défaut. Quinze thèmes vivent dans
  `themes.ts` (Jazz, Minuit, Océan, Lagon, Émeraude, Forêt, Ambre, Cuivre,
  Corail, Rose, Violet, Prune, Graphite, Sable, Bordeaux), chacun en clair et
  en sombre, dérivés d'une graine HSL. Un écran ne connaît jamais le thème :
  il lit `palette` via `useDispoTheme()` (`themeId`, `setThemeId`, `themes`
  sont réservés au sélecteur `/settings/theme`).
- Chaque palette garantit : texte et `muted` ≥ 4,5:1 sur fond et cartes,
  `electric` ≥ 3:1 sur toute surface, `accentInk` ≥ 4,5:1 sur `accent`
  (`src/test/theme-palettes.test.ts`). Une nouvelle clé de palette est
  additive et se dérive dans `extendPalette`.
- Rôles :
  - `accent` = remplissage des touches et sélections ; `accentInk` = encre
    posée dessus ; `accentDeep` = arête basse ; `accentSoft` = fond doux d'un
    filtre actif ; `electric` = accent **utilisable en texte** (liens, icônes
    d'action).
  - `edge` = arête sombre des surfaces ; `highlight` = liseré clair ;
    `surfaceTop` / `surfaceBottom` = dégradé des cartes ; `shadowKey` /
    `shadowAmbient` = ombres ; `ink` / `paper` = extrêmes du thème.
  - `signal` = SOS et urgence seulement (rouge-orangé dans tous les thèmes).
    `error` = erreurs et actions destructives. `warning` = ambre (VU-mètre,
    états intermédiaires). `jam` / `concert` / `rehearsal` = couleur métier des
    types de session, rien d'autre — identiques dans tous les thèmes.
- Dégradés : `gradientsFor(palette)` (`hero`, `premium`, `surface`,
  `duotone`…). `gradients` (constante) n'existe que pour l'existant.
- Les couleurs de marques tierces (Spotify, YouTube…) restent dans le composant
  de logo concerné, jamais ailleurs.

## 5. Contrôles

- `DispoButton` : `primary` (touche accent, une seule action principale par
  écran), `secondary` (touche surface), `ghost` (plat, tertiaire / lien),
  `danger` (contour), `signal` (touche SOS). Tailles `regular` (50) et
  `compact` (40). L'appui enfonce la touche (`pressedKeyStyle`) et garde
  l'haptique.
- Bouton icône rond : `IconButton` (`filled` relevé, `plain`, `accent`). Aucun
  `Pressable` circulaire local.
- Puce de choix : `ChoiceChip` (en creux au repos, touche accent
  sélectionnée). Étiquette non interactive : `Tag`. Filtre / segment :
  `PillButton`.
- Ligne de liste : `ListRow` (élément à gauche, titre + sous-titre, accessoire
  ou chevron ; `titleLines={2}` pour un titre saisi par un utilisateur).
- Choix exclusif entre vues : `SegmentedControl` (rail en creux, touche qui
  glisse — ressort natif, sauté avec « Réduire les animations ») ou
  `UnderlineTabs` (onglets soulignés pour les fiches longues).
- Compteur de non-lus : `CountBadge` ; point de non-lu : `UnreadDot`.
- Bloc de date « billet » : `DateTicket` (couleur = type de session ou SOS ;
  encre choisie par contraste, perforation, arête basse).
- Billet SOS : `TicketCard` (papier clair fixe, encoches, perforation
  pointillée, `Barcode`) — le seul objet qui ne suit pas le thème.
- Score / progression : `VuMeter` (`tone="level"` vert → ambre → rouge,
  `tone="accent"`). Pas de jauge continue ailleurs.
- Avatar : `Avatar` — photo, sinon initiales Fraunces sur un duotone dérivé
  de l'accent (`avatarDuotone`). Jamais un dégradé arbitraire.
- Feuille montante et menu d'actions : `BottomSheet` (voile
  `scrimFor(palette)`).
- En-tête de modale : `ModalHeader` (Annuler · titre · OK).
- Discussion (privée, groupe, école) : `ChatBubble` (mes messages = dégradé
  accent, encre `accentInk` ; les autres = carte à liseré), `ChatComposer`,
  `ChatDaySeparator`, `ConversationRow` dans `components/ui/chat/`.
- Sélecteur de date / heure natif : `NativeDateTimeField` (`parts` pour une
  seule partie).
- Champ : `FormField` (`label`, `hint`, `error`) — champ en creux.
- Retour d'appui : `pressedStyle` / `pressedKeyStyle` / `disabledStyle` des
  tokens. Pas de `{ opacity: 0.94, transform: [{ scale: 0.97 }] }` local.
  Respecter `useReducedMotion` pour tout mouvement.
- Cible tactile ≥ `minimumTouchTarget` (44 pt iOS / 48 dp Android), y compris
  les icônes seules. Chaque `Pressable` a un `accessibilityRole` et, s'il est
  icône seule, un `accessibilityLabel`.

## 6. Barres d'onglets

- iOS : `IosTabs` — plateau flottant relevé (surface dégradée, liseré,
  arête, `elevation(2)`), pastille accent au-dessus de l'onglet courant,
  libellés 11 pt semibold, badges `signal`.
- Android : `NativeTabs` colorées par la palette (`cardElevated`,
  `accentSoft` pour l'indicateur, `electric` / `muted` pour icônes et
  libellés).

## 7. Densité et hiérarchie

- Une ligne de liste montre au plus **une** action visible à droite ; les
  autres passent par un menu ou une feuille.
- Pas de sous-titre qui répète le titre. Pas de texte d'explication permanent
  sous un contrôle évident.
- Un état vide = `EmptyState` avec une action quand une action existe.
  Chargement = `LoadingState`, erreur = `ErrorState`.
- La matière ne remplace pas la hiérarchie : une seule touche accent par
  écran, les cartes ne s'empilent pas plus de deux niveaux (`default` dans
  `elevated`, jamais l'inverse).

## 8. Plateformes et performance

- Même hiérarchie, mêmes composants sur iOS et Android. Les seules différences
  acceptées sont les conventions natives : header de `Stack`, sélecteurs de
  date/heure, barre d'onglets, feuilles d'action.
- Les constructeurs de style (`surfaceStyle`, `insetStyle`, `elevation`) sont
  mémoïsés par palette : les appeler dans le rendu est gratuit. Ne pas les
  recopier dans un `StyleSheet.create`, qui figerait le thème.
- Une carte = un dégradé natif ; c'est acceptable dans une liste. Une ombre
  supplémentaire par ligne ne l'est pas.
