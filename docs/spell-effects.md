# Effets de sort sur la CA — v1

> Feature **effets-sort-ca-v1** (plan du 2026-10-05). 6 sorts modifiant la CA
> « auto-sur-soi » posent un état d'effet au lancement ; la CA de la fiche ET
> du traqueur MD suit automatiquement ; la concentration rompue retire
> l'effet. Édition 2014 uniquement, valeurs vérifiées contre `spells-seed.json`
> (FR officiel AideDD). La suite : **ciblage v2** (section dédiée ci-dessous).

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
- **Miroir traqueur continu** (`mirrorAcToCombatants` + `trackerAcOf`,
  exportés de `character-spell-effects.ts`) : la formule d'ajout d'un
  combatant ET celle du miroir sont LA MÊME fonction — création et
  rafraîchissement ne peuvent pas diverger.
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
- **Combatant en initiative** : la CA suit EN CONTINU. Toute écriture qui
  change une entrée de la CA (effet posé/levé, rupture de concentration — y
  compris DEPUIS le traqueur : condition brisante posée par le MD, 0 PV au
  PATCH combatant —, override manuel, DEX/CON/WIS, style Défense, équipement
  d'armure/bouclier, transfert d'objet équipé) resynchronise
  `combatants.armor_class` dans la même écriture (`mirrorAcToCombatants`) et
  émet `combat:change action 'ac'` quand une ligne bouge (les PATCH combatant
  s'appuient sur leur propre `combat:change` chirurgical). Seule exception :
  en **forme sauvage**, les miroirs wild shape possèdent la CA du combatant
  (elle repasse au miroir générique au retour à la forme normale).
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

## Extension v2 : ciblage d'un autre joueur / « Autre » (implémentée)

Plan `effets-sort-ca-v2` (2026-10-06) : les 5 sorts à cible possible —
Bouclier de la foi, Peau d'écorce, Hâte, Costume d'Outremonde (concentration)
ET Armure de mage (touch, « une créature consentante », sans concentration) —
peuvent être posés sur un AUTRE personnage du groupe (non caché) ou une cible
« Autre » à nom libre (PNJ/monstre). **Bouclier reste self-only** (réaction,
1 tour, RAW) — pas de picker.

### Modèle de données (migration `0033`)

- `character_id` = le PORTEUR de l'effet (la CA se calcule sur lui) ;
- `caster_character_id` (nullable) = le LANCEUR, **celui qui concentre** ;
- `target_label` (nullable) = nom libre quand la cible n'a pas de fiche
  (« Gobelin ») — la ligne vit alors sur la fiche du LANCEUR
  (`character_id` = lanceur, colonne notNull) et `activeAcEffectsOf` filtre
  `target_label IS NULL` : un effet étiqueté ne touche JAMAIS la CA du
  porteur de ligne ;
- contrat : `character_id` (porteur fiche) **XOR** `target_label` (porteur
  sans fiche), au moins l'un des deux ;
- backfill migration : `caster_character_id = character_id` pour les lignes
  v1 (le poseur v1 était toujours le lanceur = le porteur).

### API

- `POST /characters/:id/spell-effects` — `:id` = le LANCEUR (owner/GM).
  Payload `{ spellId, targetCharacterId?, targetLabel? }` ; ni l'un ni
  l'autre = self (compatible v1). Validation : cible du même groupe non
  cachée (404 sinon), label trimmé ≤ 60 caractères, doublon actif du même
  sort sur le MÊME porteur → 409.
- `GET /characters/:id/spell-effects` — effets PORTÉS par `:id` **plus**
  effets CASTÉS par `:id` vers autrui/« Autre », flag `role:
  'bearer' | 'caster'` par ligne (l'UI sépare chips CA et chips « → cible »).
- **La concentration reste celle du LANCEUR** : la rupture se juge sur
  `caster_character_id` (`deactivateConcentrationEffects` des sites traqueur
  et le bloc fiche filtrant sur le lanceur) — une condition brisante posée
  au LANCEUR (Neutralisé, Étourdi, Inconscient, Paralysé, Pétrifié), un jet
  raté après dégâts au lanceur ou un nouveau sort concentré font tomber
  TOUTES ses lignes, y compris celles qui vivent sur d'autres fiches ; le
  miroir traqueur de chaque porteur touché resynchronise
  (`mirrorAcToCombatants` par porteur).
- `DELETE /spell-effects/:id` : la levée est possible **depuis l'une ou
  l'autre fiche** — par le MD depuis la fiche du porteur, ou par le lanceur
  depuis sa mini-feuille (section « Posés sur autrui ») ; `concentrating`
  retombe sur le LANCEUR si plus aucun effet actif concentré casté par lui.
- Événements : poser un effet sur une autre fiche émet `character:change
  action 'stats'` pour la CIBLE **et** pour le LANCEUR ; « Autre » n'émet
  que pour le lanceur.

### UX

1. **Rangée « Cible »** dans la feuille d'incantation (sous l'annonce CA,
   avant les boutons d'emplacement) : pastille « Moi » pré-sélectionnée,
   le libellé ouvre le BottomSheet de cibles. L'annonce CA se RECALCULE
   pour la cible choisie (« CA 20 → 22 » = la CA de Kael) ; « Autre »
   affiche la formule seule (« +2 · CA de Gobelin »), sans chiffre.
2. **BottomSheet** : « Moi » épinglé, membres non cachés (lignes réglées,
   CA effective visible, aria « Cibler Kael avec Bouclier de la foi »),
   entrée « Autre… » à nom libre. Choisir ne lance RIEN : le bouton
   principal devient « Lancer sur Kael ».
3. **Après le cast** : chez le LANCEUR, chip or
   « +2 · Bouclier de la foi → Kael » (title : formule + « tenu par votre
   concentration ») et section « Posés sur autrui » dans la mini-feuille ;
   chez la CIBLE, même rendu que v1 (tuile CA liserée or, chips, title
   « posé par Mira ») — le miroir traqueur suit.
4. **« Autre »** : chip pense-bête du lanceur, sans delta CA, levée
   manuelle ou rupture — pas de tracker de PNJ.

### Règles de non-cumul (arbitrage MD)

- **Doublon par PORTEUR** : l'API refuse (409) un effet ACTIF du même sort
  sur le même porteur, self ou cible dédiée.
- **Même nom, deux lanceurs** : deux lanceurs différents peuvent chacun
  bénir le même porteur (deux lignes, deux +2 affichés). RAW, les bonus de
  même nom ne se cumulent PAS — **l'app suit les lignes, c'est le MD qui
  tranche à la table** (il lève l'une des deux depuis la fiche du porteur).

### E2E

`e2e/spell-effects-target.spec.ts` (chromium, pas de @smoke) : cast de Mira
sur Kael via le picker → CA 20 → 22 chez Kael + chips des deux fiches ;
Neutralisé sur MIRA rompt SA concentration → CA de Kael retombe, chips
disparaissent des deux fiches ; « Autre » avec « Gobelin » → chip lanceur
sans impact CA. beforeEach/afterEach relèvent les effets et réarment les
deux fiches (rendu idempotent).

## Extensions futures (prévues par le schéma)

- `target_character_id` — effets sur cible tierce (Lien de protection, Lenteur,
  bénédiction de chance…) avec visibilité appropriée pour la cible.
- `expires_at` — durées horlogées (Bouclier 1 round, Armure de mage 8 h,
  Cérémonie 24 h) levées automatiquement au lieu du geste manuel.
- **Autres stats que la CA** — `effect_kind` extensible : sauvegardes
  (Bénédiction/Protection contre le mal), vitesse (Hâte ×2, Lenteur ÷2),
  jets d'attaque, résistances aux dégâts. Le moteur `applyAcEffects` sert de
  patron : un `applyEffects` par famille de stats, `computeAC` montre la voie
  du paramètre optionnel non-breaking.
