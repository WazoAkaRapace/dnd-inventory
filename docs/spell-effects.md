# Effets de sort sur la CA — v1

> Feature **effets-sort-ca-v1** (plan du 2026-10-05). 6 sorts modifiant la CA
> « auto-sur-soi » posent un état d'effet au lancement ; la CA de la fiche ET
> du traqueur MD suit automatiquement ; la concentration rompue retire
> l'effet. Édition 2014 uniquement, valeurs vérifiées contre `spells-seed.json`
> (FR officiel AideDD).

## Les 6 sorts

| Sort | Slug (`srdIndex`) | Mécanique | Concentration |
| --- | --- | --- | --- |
| Bouclier de la foi | `shield-of-faith` | `ac_bonus` +2 | oui |
| Peau d'écorce | `barkskin` | `ac_floor` ≥ 16 | oui |
| Hâte | `haste` | `ac_bonus` +2 | oui |
| Costume d'Outremonde | `tasha-s-otherworldly-guise` | `ac_bonus` +2 | oui |
| Armure de mage | `mage-armor` | `ac_set_formula` 13 + DEX (max avec la CA actuelle) | non (8 h) |
| Bouclier | `shield` | `ac_bonus` +5 | non (1 round, réaction) |

Mécanique (moteur pur `applyAcEffects` dans `packages/shared`) :

- `ac_bonus` — la CA **augmente** de N (cumulatif : foi + hâte = +4) ;
- `ac_floor` — la CA devient `max(CA, 16)` — ne fait rien si déjà ≥ 16 ;
- `ac_set_formula` — la CA devient `max(CA, 13 + mod. DEX)` (Armure de mage ne
   remplace pas une armure physique meilleure, SRD).

`computeAC` reçoit les effets actifs en paramètre optionnel (`acEffects?`) et
les applique en dernière étape, y compris sur le `10 + DEX` nu — zéro break
des appelants existants.

## Architecture

- Table dédiée `character_spell_effects` (décision Mika) : une ligne par effet
  posé, `tied_to_concentration`, `active` (0 = levé, historique conservé).
  Migrations `0032_*.sql`.
- Table statique `SPELL_AC_EFFECTS` (shared) : slug → kind/value/tied.
- Cast existant (`CastSpellSheet` → PATCH personnage) + POST
  `/characters/:id/spell-effects` conditionnel : l'emplacement est consommé
  D'ABORD, un échec du POST d'effet n'annule rien (toast orange « effet non
  posé — lève/pose à la main »).
- Les **3 voies de rupture de concentration** (dégâts → jet raté, condition
  brisante, nouveau sort concentré) désactivent les lignes liées dans la MÊME
  transaction que `concentrating = 0` — aucun effet fantôme.
- Conditions brisantes (`CONCENTRATION_BREAKING_CONDITIONS_FR`) : Neutralisé,
  Étourdi, Inconscient, Paralysé, Pétrifié.

## UX (brief v1)

1. **Annonce avant consommation** : « ⛨ CA 18 → 20 (+2, tant que concentré) »
   sous le résumé de la feuille d'incantation — or = magie, chiffres calculés
   sur la CA effective actuelle (override inclus).
2. **Bandeau d'état** : tuile CA liserée or, chip par effet actif
   (« +2 · Bouclier de la foi », « ≥ 16 · Peau d'écorce »,
   « 13 + DEX · Armure de mage »), title = formule.
3. **Levée** : tap tuile CA → mini-feuille (BottomSheet) avec « Lever » par
   ligne (≥ 44 px, aria-label verbal « Lever Bouclier de la foi ») ; lever un
   effet concentré retombe `concentrating` si plus rien ne le justifie.
4. **Bouclier** : bouton « Réagir — Bouclier » dans la feuille de lancer ;
   levée manuelle après le tour (pas de timer).
5. **Override manuel GAGNE** : chips affichées + « CA manuelle — effet non
   appliqué » en orange ; la contribution or n'entre pas dans le chiffre.

## Limites v1 (documentées, pas des bugs)

- **Pas d'horloge** : Armure de mage (8 h) et Bouclier (1 round) se lèvent à la
  main — même geste que le joueur cochant ses conditions.
- **Combatant en initiative** : la CA d'un combatant DÉJÀ créé ne suit PAS en
  continu — elle se met à jour au prochain **miroir** (miroir PV, ajout de
  combatant, wild shape…). Un combatant créé APRÈS le cast porte la bonne CA.
- **Un seul sort à effet par ligne** : POST en double → 409 (pas de double
  effet) ; l'historique inactif est conservé en base.
- **E2E** : `e2e/spell-effects.spec.ts` (chromium, pas de @smoke — la spec
  mute le seed : sorts de Mira, effets, conditions, override ; elle réarme la
  fiche de Mira en `afterEach` pour les specs suivantes).

## Les 3 exclus (et pourquoi)

- **Lien de protection** (`warding-bond`) — cible **tierce** : le bénéficiaire
  n'est pas le lanceur. v1 ne pose des effets que sur soi ; il faut
  `target_character_id` (v2).
- **Cérémonie** (`ceremony`) — sorts à **durées hétérogènes** (24 h, « jusqu'à
  l'aube »…) et effets non-CA pour la plupart des options ; hors périmètre CA.
- **Lenteur** (`slow`) — cible tierce **hostile** et CA **−2** : demande la
  pose d'effets sur un ennemi du traqueur, pas sur une fiche de PJ.

Règle commune : v1 = sorts auto-sur-soi uniquement, pas de sélecteur de cible.

## Extension v2 (prévue par le schéma)

- `target_character_id` — effets sur cible tierce (Lien de protection, Lenteur,
  bénédiction de chance…) avec visibilité appropriée pour la cible.
- `expires_at` — durées horlogées (Bouclier 1 round, Armure de mage 8 h,
  Cérémonie 24 h) levées automatiquement au lieu du geste manuel.
- **Autres stats que la CA** — `effect_kind` extensible : sauvegardes
  (Bénédiction/Protection contre le mal), vitesse (Hâte ×2, Lenteur ÷2),
  jets d'attaque, résistances aux dégâts. Le moteur `applyAcEffects` sert de
  patron : un `applyEffects` par famille de stats, `computeAC` montre la voie
  du paramètre optionnel non-breaking.
