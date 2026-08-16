# Design System — apps/web

<!-- impeccable:design-doc -->

Le monde visuel de l'app : **parchemin, encre, sang, or** — un grimoire clair
(light-only, pas de dark mode), mobile-first, en français. Les couleurs de
règles (vert/jaune/orange/rouge des paliers d'encombrance et des PV)
enseignent l'état du personnage ; les teintes parchemin/encre portent le
registre. Une seule famille d'icônes : les glyphes emoji existants
(🛡 ❤ ⚔ 🎯), utilisés avec constance.

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

Typographie : `--font-display` (Cinzel — titres), `--font-body` (Iowan Old
Style — texte), `--font-sans` (Inter — fallback système). Le mono
(`font-mono`) est réservé aux valeurs mesurées : PV, CA, initiative, durées.

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

## Composants — `src/components/ui.tsx`

| Composant | Usage | Points clés |
|---|---|---|
| `Modal` | dialogues centrés (desktop) | focus trap, Échap, restore le focus |
| `BottomSheet` | feuilles mobiles portaled | `size` (md/lg), `mobileOnly`, `footer`, `bodyClassName` ; Échap + scroll lock |
| `Fab` | bouton d'action flottant `+` | `mobileOnly`, `raised` (au-dessus du dock) |
| `HpBar` | barre de PV partout (fiche, combat, forme animale) | paliers unifiés : ≤0 `red-700`, ≤25 % `red-500`, ≤50 % `yellow-500`, sinon `green-500` ; `size` xs/sm/md, `showText`, `trackClassName` ; `role="progressbar"` |
| `Chip` | pastille de stat (attaque 🎯, dégâts ⚔, DD 🛡, ×N, +magique ✨) | `tone` (orange/red/blood/blue/amber/gold/indigo), `soft`, `title` = info-bulle de décomposition |
| `EncumbranceBar` | portage et paliers | affiche conséquences de règle au moment où elles s'appliquent |
| `ConfirmButton` | suppression en deux temps | arme 4 s puis confirme ; n'bulle pas au parent |
| `ToastStack` / `Toast` | retours d'action | bas d'écran, `aria-live` |
| `RarityBadge` `CategoryBadge` `WeightBadge` `CostBadge` | métadonnées d'objet | |
| `EmptyState` `LoadingSpinner` `ErrorMsg` | états de page | |

## Motion

Une seule courbe de sortie : `cubic-bezier(0.16, 1, 0.3, 1)`. Entrées courtes
(0.2–0.45 s), un moment signé par surface (dock, sword-cut de tour,
sheet-up). Tout est coupé sous `prefers-reduced-motion: reduce`, avec un
état statique lisible quand le mouvement porte l'information (anneau « à toi
de jouer » sans animation).

## Accessibilité

Cibles tactiles ≥ 44px, focus visible, `aria-label` français nommant l'action
(« Retirer Aldric du combat », pas « supprimer »). Barres = `progressbar`
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
