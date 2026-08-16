# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Le MD (Mika)** : anime la partie depuis un ordinateur portable (desktop ≥1024px), gère le traqueur de combat, l'inventaire du groupe et les PNJ. Pressé par le temps pendant les combats, flux souris/tactile — pas de frappe au clavier en plein combat (confirmé en interview).
- **5 joueurs (Léna, Paul, Sofia, Tom, Yvette)** : chacun sur son téléphone, à une main, fréquemment interrompus au milieu d'une partie physique. Leur surface principale est leur fiche de personnage — l'app existe pour ça (confirmé : pas de mode combat dédié côté joueur ; le combat à l'écran est surtout pour le MD).

## Product Purpose

Application web mobile-first, entièrement en français, de gestion de fiches de personnage, d'inventaire (poids en kilogrammes, encombrance par paliers) et de combat pour D&D 5e — utilisée en direct autour d'une table physique, avec synchronisation temps réel (WebSocket) entre le MD et les joueurs. Succès = une table qui joue plus vite qu'avec du papier, sans erreur de règles, chaque joueur voyant son propre état à jour en permanence.

## Positioning

Un seul état partagé en temps réel pour toute la table : l'encombrance et la monnaie qui pèsent, les dégâts du traqueur du MD qui déclenchent les jets de concentration sur la fiche du joueur, les transferts d'objets entre personnages en direct, le moteur de règles SRD complet en français (646 objets, 490 sorts, bestiaire avec blocs de stats). Les outils voisins (paper, PDF partagé, trackers génériques) n'ont pas ce lien temps réel fiche↔traqueur.

## Operating Context

- Parties en présentiel autour d'une table ; pièce souvent tamisée ; Wi-Fi parfois médiocre.
- Les joueurs ont le téléphone en main ou en poche pendant les combats ; l'alerte « À toi de jouer » doit les atteindre par vibration (confirmé : vibration seule, pas de son, pas de notifications système).
- PWA installable ; déployée en Docker (web + api) ; usage intensif en séance.
- Vocabulaire D&D 5e français (FOR/DEX/CON, Roublard, PO/PA/PC, DD/CA/PV, tu-toiement à la table).

## Capabilities and Constraints

- Groupes avec codes d'invitation, rôles MD/joueur ; personnages avec fiches complètes (inventaire multi-emplacements, bourse, survie, sorts avec emplacements et incantation supérieure, traits, notes, description, forme sauvage).
- Traqueur de combat MD : rencontres, initiative, groupes de monstres, conditions avec durées, concentration, PV, supprimer avec confirmation en deux temps.
- Contraintes : React 19 + Vite + Tailwind v4 + react-router 7 côté web ; Fastify + SQLite côté api ; sync WebSocket ; mobile-first ; français ; poids kg/SI.
- Décision produit confirmée : **outil D&D générique réutilisable** — pas d'habillage propre à une campagne (pas de thème Chult dans le design), même si les données de la campagne en cours sont Chult.

## Evidence on Hand

- Déploiement live (docker, web:8080 / api:4010) avec les vraies données de la campagne « Les Héros de Chult » (6 personnages actifs).
- Catalogues SRD français importés (objets, sorts, monstres) ; README.md détaillé avec captures d'écran (docs/screenshots/).
- Critique de design archivée : `.impeccable/critique/2026-08-16T11-41-01Z__apps-web-src-app-tsx.md` (25/40).

## Product Principles

1. **La table d'abord** : chaque interaction se juge en secondes gagnées autour de la table physique, écran du MD comme téléphone d'un joueur.
2. **Les règles s'enseignent par l'UI** : l'encombrance montre ses paliers et ses conséquences au moment où ils s'appliquent ; la concentration déclenche son jet quand elle est menacée.
3. **La fiche est au centre pour le joueur** ; le combat écran est l'outil du MD — le joueur doit retrouver son état (PV, tour, initiative) sans quitter sa fiche.
4. **Un seul monde visuel** : parchemin/encre/sang/or, une seule famille d'icônes — pas de second système par-dessus.
5. **Fiable en séance** : les erreurs réseau se voient et se rattrapent ; jamais de perte silencieuse.

## Accessibility & Inclusion

Aucune exigence normative confirmée ; cibles pragmatiques : cibles tactiles ≥44px sur mobile, focus visible, aria-labels français (améliorations planifiées dans les passes `audit`/`adapt`).
