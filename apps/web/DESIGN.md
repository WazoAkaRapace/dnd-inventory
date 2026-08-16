# Design System — apps/web

<!-- impeccable:design-doc -->

Le monde visuel de l'app : **parchemin, encre, sang, or** — un grimoire clair
(light-only, pas de dark mode), mobile-first, en français. Les couleurs de
règles (vert/jaune/orange/rouge des paliers d'encombrance et des PV)
enseignent l'état du personnage ; les teintes parchemin/encre portent le
registre. Une seule famille d'icônes : les glyphes emoji existants
(🛡 ❤ ⚔ 🎯), utilisés avec constance. Deux familles de surfaces : la carte
levée (`.card`) pour les panneaux de travail, et la surface réglée — entrées
posées à même le parchemin, séparées par des filets — pour les pages-liste
pleine largeur.

## Tokens — `src/index.css` `@theme`

Quatre rampes sémantiques. **Règle : n'utiliser une nuance (`ink-600`,
`blood-50`…) que si elle est définie dans `@theme`** — Tailwind v4 ne génère
rien pour une classe inconnue, l'erreur serait silencieuse.

| Rampe | Rôle | Nuances |
|---|---|---|
| `parchment-*` | fonds, surfaces, bordures neutres | 50–500 |
| `ink-*` | texte et icônes (brun d'encre) | 100, 300–900 |
| `blood-*` | actions primaires, dégâts, danger | 50–900 |
| `gold-*` | magie, accents dorés | 100, 300–700 |

Typographie : `--font-display` (Cinzel — titres et ordinaux romains),
`--font-body` (Iowan Old Style — texte), `--font-sans` (Inter — fallback
système). Le mono (`font-mono`) est réservé aux valeurs mesurées : PV, CA,
initiative, durées, codes d'invitation.

Couleurs de règles (palette Tailwind standard, hors `@theme`) :
`green/yellow/orange/red` pour les paliers d'encombrance, les PV, les
conditions. Chaque teinte porte un sens de règle — ne pas les réutiliser
comme décoration.

## Classes CSS — `src/index.css`

- `.card` — surface de base : blanc 85 %, flou léger, bordure
  `parchment-200`, ombre réelle (offset + flou), rayon 16px.
- `.btn-primary` / `.btn-secondary` / `.btn-ghost` — les trois boutons.
  Primaire = `blood-600` plein.
- `.input`, `.label`, `.input-compact` — champs de formulaire.
- `.section-title` — LE style de titre de section : `font-display text-lg
  font-semibold`. Tout `h2` de carte ou de feuille l'utilise.
- `.rarity-*` — badges de rareté (teinte par rareté, jamais gris).
- `.bar-*` — remplissage des barres d'encombrance.

## Surfaces réglées — le registre & la table des matières

Alternative légitime à `.card` sur les pages-liste pleine largeur : pas de
fond, pas d'ombre, pas de grille de cartes — les entrées sont posées à même
le parchemin et séparées par des filets. C'est le dialecte du registre des
groupes (« Mes groupes »).

| Dispositif | Recette |
|---|---|
| Tête de page | titre `font-display` centré (`text-2xl` / `sm:text-3xl`) au-dessus de la double règle |
| Double règle de tête | `border-t-2` `parchment-400`, puis à 3 px d'écart `border-t` `parchment-300` ; divs `aria-hidden` |
| Entrées | `ol list-none`, chaque `li` refermé par `border-b` `parchment-200` |
| Ordinaux romains | colonne `w-10` alignée à droite en `font-display` (Cinzel), `aria-hidden` ; `blood-500` `text-2xl` sur l'entrée courante, `ink-400` `text-lg` sur les compactes |
| Entrée courante (la plus récente) | nom `text-2xl`, méta `MD : X · N joueurs · N personnages · depuis {mois abrégé fr-FR} {année}`, roster des personnages rejoint par « · » sous un filet interne `parchment-200` |
| Tampon du MD | hors du lien : chip `<code>` mono sur `parchment-100` bordée `parchment-200` (`tracking-[0.2em]`) + bouton copier à retour inline « Copié ✓ » / « Copie impossible » |
| Entrées compactes | ordinaux `ink-400`, `truncate` sur nom et méta, code MD en `code` mono inline |
| Survol | un seul `Link` par entrée (aria-label « Ouvrir le groupe X ») ; nappe `-mx-3 px-3 rounded-lg` en `parchment-100/70` — le débord négatif étend la nappe au-delà de la mesure sans toucher aux filets |

Page vierge : même tête + double règle, deux chemins d'entrée inline séparés
par des filets (`divide-y` / `sm:divide-x` `parchment-300` — aucune carte,
aucun remplissage), règle de clôture `parchment-200`. Dès qu'une entrée
existe, créer/rejoindre passent en actions fantômes au pied du registre
(`btn-ghost` + séparateur « · ») ouvrant le `Modal` standard ; les mêmes
formulaires servent les deux états. Les états parlent français : chargement
« Ouverture du registre… », échec = `ErrorMsg` + « Réessayer », erreurs API
(chaînes machines anglaises) retraduites par statut HTTP.

La table des matières (`PartyPage.tsx`, la page d'un groupe) est la seconde
page réglée — même grammaire, autre page du même monde : le registre énumère
les volumes, la table des matières ouvre le volume choisi. L'ordre de lecture
EST la hiérarchie : I Ton personnage, II La table, III Outils & annexes.

| Dispositif | Recette |
|---|---|
| Tête de volume | nom du groupe `font-display` centré (`text-2xl` / `sm:text-3xl`), méta « N joueurs · N personnages · mode » ; même double règle de tête, mesure unique `max-w-3xl` |
| En-têtes de section | numéral romain Cinzel `ink-300` (`w-8` aligné à droite, aria-hidden) + `.section-title` + filet `parchment-200` courant jusqu'au bord |
| Points de conduite | `DotLeader` : filet pointillé `parchment-300` entre un libellé et sa valeur de queue (outils, code d'invitation) — réservé aux lignes d'annexes, jamais au corps des entrées |
| La porte sang | UN seul élément sang par page : ici « Ouvrir → » `blood-600` + anneau `blood-300` du médaillon sur SES personnages ; les portes du MD vers les autres fiches restent encre (flèche `ink-300` → `blood-600` au survol) ; fiches des autres joueurs SANS lien, 🔒 `ink-300` en queue avec title explicatif |
| Médaillon | portrait rond ou initiale Cinzel sur `parchment-100`, anneau 2 px — `blood-300` = ton siège, `parchment-300` sinon ; 56 px (`h-14`, portes de section I), 40 px (`h-10`, roster de section II) |
| Roster | un membre par ligne : nom + @pseudo + tampon `MD` (`blood-600` blanc) / `Joueur` (`parchment-200` / `ink-700`) ; sous chaque membre, ses personnages en médaillon 40 px + nom sur méta (verrouillé 🔒 pour les joueurs, porte encre pour le MD) ; « sans personnage » en italique `ink-400` |
| Annexes | lignes réglées à glyphe d'outil (🛡 ⚔ 🎭) + libellé `ink-800` + points de conduite + pastille flèche : mini-médaillon `border-parchment-300` 32 px, flèche `ink-500` → `blood-600` au survol — l'affordance existe au repos, pas seulement au survol ; ligne code (MD) : `code` mono `tracking-[0.2em]` + bouton copier en pastille bordée, état « Copié ✓ » passe bord et texte en sang |

## Composants — `src/components/ui.tsx`

| Composant | Usage | Points clés |
|---|---|---|
| `Modal` | dialogues centrés (desktop) | focus trap, Échap, restore le focus |
| `BottomSheet` | feuilles mobiles portaled | `size` (md/lg), `mobileOnly`, `footer`, `bodyClassName` ; Échap + scroll lock |
| `Fab` | bouton d'action flottant `+` | `mobileOnly`, `raised` (au-dessus du dock) |
| `HpBar` | barre de PV partout (fiche, combat, forme animale) | paliers unifiés : ≤0 `red-700`, ≤25 % `red-500`, ≤50 % `yellow-500`, sinon `green-500` ; `size` xs/sm/md, `showText`, `trackClassName` ; `role="progressbar"` |
| `Chip` | pastille de stat (attaque 🎯, dégâts ⚔, DD 🛡, ×N, +magique ✨) | `tone` (orange/red/blood/blue/amber/gold/indigo), `soft`, `title` = info-bulle de décomposition |
| `EncumbranceBar` | portage et paliers | affiche conséquences de règle au moment où elles s'appliquent ; `compact` = variante une-ligne du bandeau (barre fine + lecture mono + palier, conséquence conservée) |
| `CharacterStateBand` | bandeau d'état de la fiche joueur (`components/CharacterStateBand.tsx`) | rail réglé épinglé sous l'en-tête : identité (renomme inline) + phrase d'état (PV, CA, sorts, états) + ligne de combat (`CombatLine` : appel d'initiative / Agir / tour quiet, `aria-live` sur la copie statique) + encombrement compact ; panneau dépliable (états, emplacements par niveau, PV ±1/±5 — debouncés 700 ms en UN patch pour le jet de concentration sur le total) ; jumeau fixe compact au défilement (`band-drop`, IntersectionObserver — le flux ne change jamais de hauteur) ; le multiplicateur de portage vit dans l'onglet Caractéristiques (tuile « Portage max » des Statistiques dérivées) |
| `ConfirmButton` | suppression en deux temps | arme 4 s puis confirme ; n'bulle pas au parent |
| `ToastStack` / `Toast` | retours d'action | bas d'écran, `aria-live` |
| `RarityBadge` `CategoryBadge` `WeightBadge` `CostBadge` | métadonnées d'objet | |
| `EmptyState` `LoadingSpinner` `ErrorMsg` | états de page | |

## Motion

Une seule courbe de sortie : `cubic-bezier(0.16, 1, 0.3, 1)`. Entrées courtes
(0.2–0.45 s), un moment signé par surface (dock, sword-cut de tour,
sheet-up, register-rise). Le registre arrive par `.register-rise` : montée de
12 px + fondu, 0.35 s, remplissage `backwards`, stagger inline plafonné
(≤ 5 blocs × 60 ms) — les entrées se posent sous la règle de tête l'une après
l'autre, puis plus rien ne bouge. Sur la fiche, la ligne Agir (ou l'appel
d'initiative) monte par `.band-rise` (6 px + fondu, 0.2 s) à l'instant où le
tour devient tien ; le jumeau épinglé descend par `.band-drop` (−8 px, 0.2 s,
transform seul — jamais de changement de hauteur dans le flux au défilement).
Tout est coupé sous
`prefers-reduced-motion: reduce`, avec un état statique lisible quand le
mouvement porte l'information (anneau « à toi de jouer » sans animation).

## Accessibilité

Cibles tactiles ≥ 44px, focus visible, `aria-label` français nommant l'action
(« Retirer Aldric du combat », pas « supprimer »). Les ornements purement
décoratifs — filets du registre, ordinaux romains — sont `aria-hidden`.
Barres = `progressbar`
avec `aria-valuetext` en français (« 8/20 PV », « 0.0 kg sur 120 kg »).
Dialogues = `role="dialog"` + `aria-modal` + Échap.

## Étendre le système

1. Nouvelle nuance → l'ajouter à la rampe `@theme` correspondante, en
   respectant l'ordre de luminosité.
2. Nouveau titre → `.section-title` (+ classes utilitaires si besoin), pas
   de style ad hoc.
3. Nouvelle pastille de stat → `Chip` avec un `tone` existant ; nouveau
   `tone` seulement si le sens est réellement distinct.
4. Nouvelle barre de PV → **jamais** : `HpBar` (`size`, `showText`,
   `trackClassName` couvrent les cas).
5. Overlay plein écran → `Modal` ou `BottomSheet` avant tout markup
   `fixed inset-0` manuel.
6. Nouvelle page-liste pleine largeur → la surface réglée du registre
   (double règle de tête + entrées réglées), pas une grille de cartes ;
   `.card` reste l'outil des panneaux de travail.
