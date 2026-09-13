# Système visuel Dispo — règles d'écriture des écrans

Source unique : `src/theme/tokens.ts` et `src/components/ui/*`. Toute vue de
`src/app/**` et `src/features/**` s'y conforme. Ce document est la règle ; le
code qui s'en écarte est un défaut à corriger.

## 1. Typographie

Trois familles, un rôle chacune :

| Rôle                                                                       | Famille               | Variantes `AppText`                                                                      |
| -------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| Titres éditoriaux (écran, section, noms de personnes / groupes / morceaux) | Fraunces              | `display`, `displayItalic`, `title2`, `title3`                                           |
| Lecture et contrôles                                                       | Système (SF / Roboto) | `title`, `headline`, `body`, `callout`, `subheadline`, `footnote`, `caption`, `caption2` |
| Étiquettes et données (dates courtes, BPM, tonalités, compteurs)           | Spline Sans Mono      | `label`, `mono`                                                                          |

Règles :

- **Jamais** de `fontSize`, `fontWeight`, `fontFamily`, `lineHeight`,
  `letterSpacing` ni `textTransform` dans un `StyleSheet` d'écran. On choisit une
  variante, et au besoin `weight="semibold" | "bold"` (le `medium` existe pour
  les données). `800` et `900` n'existent plus.
- Rien en dessous de `caption2` (11 pt). Un texte de 9 ou 10 pt est un défaut.
- Un titre principal (nom, titre de morceau, d'événement) n'est jamais tronqué
  à une ligne quand il porte l'information : `numberOfLines={2}` au minimum.
- `label` (mono majuscules) sert aux étiquettes de champ et aux petites
  pastilles de statut. **Ce n'est pas un titre de section.**
- Le texte secondaire est `palette.muted`, jamais une opacité sur le texte.

## 2. Titres d'écran et de section

- Écran d'onglet ou modale sans header natif : `ScreenHeader` (titre Fraunces,
  sous-titre optionnel, `leadingAction` / `action` en `IconButton` ou
  `NativeHeaderButton`). Pas de surtitre décoratif.
- Écran empilé : header natif du `Stack` (titre système), le contenu commence
  sous le header sans second titre.
- Section : `SectionHeader` (`title`, `subtitle?`, `action?`). C'est le **seul**
  style de titre de section ; les « MODIFIER » / « Tout voir » à droite passent
  par `action`.

## 3. Surfaces

- `Card` (`tone="default" | "elevated" | "inset"`) est la seule surface. Pas de
  `View` avec `borderRadius` + `borderWidth` + `backgroundColor` réinventée.
- Rayons : `radii.*` uniquement. Cartes `radii.card`, contrôles `radii.control`,
  boutons `radii.button`, champs `radii.input`, pastilles `radii.round`.
- Espacements : `spacing.*` uniquement (grille de 4). Marge d'écran
  `spacing.gutter`. Les alias hérités (`chip`, `control`, `cluster`, `section`,
  `compact`, `xxxs`, `hairline`) sont à remplacer par la clé standard la plus
  proche.
- Ombres : `cardShadow()` via `Card`. Aucune ombre ad hoc.
- Fond : `Screen` / `DispoBackground`. Pas de dégradé de fond dans un écran.

## 4. Couleurs

- `palette.*` uniquement. Blanc fixe sur dégradé : `onAccent`. Encre sur
  dégradé bleu jazz : `billetInk`. Teinte translucide : `tint(color, alpha)`
  au lieu de `${color}26`.
- Bleu jazz `palette.electric` = accent unique (liens, sélection, icônes
  d'action). `palette.signal` = SOS et urgence seulement. `palette.error` =
  erreurs et actions destructives. `palette.jam` / `concert` / `rehearsal` =
  couleur métier des types de session, rien d'autre.
- Les couleurs de marques tierces (Spotify, YouTube…) restent dans le composant
  de logo concerné, jamais ailleurs.

## 5. Contrôles

- `DispoButton` : `primary` (une seule action principale par écran),
  `secondary`, `ghost` (tertiaire / lien), `danger`, `signal` (SOS). Tailles
  `regular` (50) et `compact` (40).
- Bouton icône rond : `IconButton` (cloche, réglages, partage, fermer). Aucun
  `Pressable` circulaire local.
- Puce de choix : `ChoiceChip`. Étiquette non interactive : `Tag`.
  Filtre / segment : `PillButton`.
- Ligne de liste : `ListRow` (élément à gauche, titre + sous-titre, accessoire
  ou chevron ; `titleLines={2}` pour un titre saisi par un utilisateur).
- Choix exclusif entre vues : `SegmentedControl` (rail en creux) ou
  `UnderlineTabs` (onglets soulignés pour les fiches longues).
- Compteur de non-lus : `CountBadge` ; point de non-lu : `UnreadDot`.
- Bloc de date « billet » : `DateTicket` (couleur = type de session ou SOS).
- Feuille montante et menu d'actions : `BottomSheet` (voile `scrimColor`).
- En-tête de modale : `ModalHeader` (Annuler · titre · OK).
- Discussion (privée, groupe, école) : `ChatBubble`, `ChatComposer`,
  `ChatDaySeparator`, `ConversationRow` dans `components/ui/chat/`.
- Sélecteur de date / heure natif : `NativeDateTimeField` (`parts` pour une
  seule partie).
- Champ : `FormField` (`label`, `hint`, `error`).
- Retour d'appui : `pressedStyle` / `disabledStyle` des tokens. Pas de
  `{ opacity: 0.94, transform: [{ scale: 0.97 }] }` local.
- Cible tactile ≥ `minimumTouchTarget` (44 pt iOS / 48 dp Android), y compris
  les icônes seules. Chaque `Pressable` a un `accessibilityRole` et, s'il est
  icône seule, un `accessibilityLabel`.

## 6. Densité et hiérarchie

- Une ligne de liste montre au plus **une** action visible à droite ; les
  autres passent par un menu ou une feuille. Trois icônes sur une ligne
  écrasent le titre.
- Pas de sous-titre qui répète le titre. Pas de texte d'explication permanent
  sous un contrôle évident.
- Un état vide = `EmptyState` avec une action quand une action existe.
- Chargement = `LoadingState`, erreur = `ErrorState`.

## 7. Plateformes

- Même hiérarchie, mêmes composants sur iOS et Android. Les seules différences
  acceptées sont les conventions natives : header de `Stack`, sélecteurs de
  date/heure, barre d'onglets, feuilles d'action.
