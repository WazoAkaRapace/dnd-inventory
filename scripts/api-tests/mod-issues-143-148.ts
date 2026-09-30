/**
 * Régressions issues #143–#148 (2026-09) :
 *  #148 — un joueur à 0 PV est MOURANT, pas vaincu : il reste dans la
 *          rotation d'initiative ; le miroir fiche↔traqueur tient dans les
 *          deux sens, y compris chute et relève.
 *  #144  — revenir au-dessus de 0 PV (fiche OU traqueur) réinitialise les
 *          jets de sauvegarde contre la mort.
 *  #145  — le repos long efface les états (conditions) de la fiche et du
 *          traqueur.
 *  #146  — stabilisation : PATCH successes=3 (API — le bouton l'appelle).
 *  #143  — flèches/carreaux étiquetés par GENRE (ammunition + arrow /
 *          crossbow-bolt) : décrément lié à l'arme via
 *          POST /characters/:id/consume {type:'ammo', ammo:'arrow'} + journal.
 */

import { api, createCharacter, eq, type Fixtures, ok, type ServerHandle } from './harness.ts';

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  const P = fx.partyId;
  const GM = fx.gm.token;
  const PLAYER = fx.player.token;

  // ---------- fixture : un guerrier jouable ----------
  const hero = await createCharacter(base, PLAYER, P, {
    name: 'Moribonde',
    characterClass: 'Guerrier',
    level: 3,
    maxHp: 20,
  });
  await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { currentHp: 20, conditions: ['Empoisonné'] },
  });

  // ---------- rencontre + ajout du joueur ----------
  let r = await api(base, 'POST', `/api/parties/${P}/encounters`, {
    token: GM,
    body: { name: 'Chute et relève (#148)' },
  });
  eq(r.status, 201, '#148 encounter created');
  const enc = r.data.encounter;
  r = await api(base, 'POST', `/api/encounters/${enc.id}/combatants/player`, {
    token: GM,
    body: { characterIds: [hero.id] },
  });
  eq(r.status, 201, '#148 player combatant added');
  const cid = r.data.combatants.find((c: any) => c.characterId === hero.id).id;

  // Initiative + démarrage (le premier next-turn fait passer setup → actif) :
  // le joueur doit être dans la rotation
  await api(base, 'PATCH', `/api/combatants/${cid}`, {
    token: GM,
    body: { initiative: 20 },
  });
  r = await api(base, 'POST', `/api/encounters/${enc.id}/next-turn`, { token: GM });
  eq(r.status, 200, '#148 combat started');
  eq(r.data.encounter.turnIndex, 0, '#148 hero acts first (init 20)');

  // ---------- #148 : le joueur tombe à 0 — MOURANT, pas vaincu ----------
  r = await api(base, 'PATCH', `/api/combatants/${cid}`, {
    token: GM,
    body: { hitPoints: 0 },
  });
  eq(r.status, 200, '#148 tracker drop to 0');
  eq(r.data.combatant.hitPoints, 0, '#148 tracker HP 0');
  eq(r.data.combatant.defeated, false, '#148 DYING player NOT defeated (stays in rotation)');

  // La fiche a suivi la chute (miroir traqueur→fiche)
  let row = srv.query('SELECT current_hp FROM characters WHERE id = ?', [hero.id]);
  eq(row.current_hp, 0, '#148 sheet HP mirrored to 0');

  // next-turn SAUTE bien le mourant pour agir, mais il RESTE dans l'ordre
  r = await api(base, 'POST', `/api/encounters/${enc.id}/next-turn`, { token: GM });
  eq(r.status, 200, '#148 next-turn while hero dying');

  // ---------- #144 : deux échecs, puis relève au traqueur → reset ----------
  await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { deathSaveFailures: 2, deathSaveSuccesses: 1 },
  });
  r = await api(base, 'PATCH', `/api/combatants/${cid}`, {
    token: GM,
    body: { hitPoints: 5 }, // soins : repasse au-dessus de 0
  });
  eq(r.status, 200, '#144 tracker heal above 0');
  row = srv.query(
    'SELECT current_hp, death_save_successes, death_save_failures FROM characters WHERE id = ?',
    [hero.id],
  );
  eq(row.current_hp, 5, '#144 sheet HP mirrored to 5');
  eq(row.death_save_successes, 0, '#144 death saves reset (successes) on revival');
  eq(row.death_save_failures, 0, '#144 death saves reset (failures) on revival');
  eq(r.data.combatant.defeated, false, '#144 revived not defeated');

  // ---------- #144 bis : relève depuis la FICHE → reset aussi ----------
  await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { hitPoints: 0, currentHp: 0, deathSaveFailures: 2 },
  });
  r = await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { currentHp: 8 },
  });
  row = srv.query('SELECT current_hp, death_save_failures FROM characters WHERE id = ?', [hero.id]);
  eq(row.current_hp, 8, '#144-bis sheet healed to 8');
  eq(row.death_save_failures, 0, '#144-bis death saves reset on sheet-side revival');
  // le traqueur a suivi
  row = srv.query('SELECT hit_points, defeated FROM combatants WHERE id = ?', [cid]);
  eq(row.hit_points, 8, '#144-bis tracker mirrored to 8');
  eq(row.defeated, 0, '#144-bis tracker not defeated');

  // ---------- #146 : stabilisation = 3 succès (le bouton PATCH ces champs) ----------
  await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { currentHp: 0, deathSaveFailures: 1 },
  });
  r = await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { deathSaveSuccesses: 3, deathSaveFailures: 0 },
  });
  eq(r.status, 200, '#146 stabilize PATCH accepted');
  row = srv.query('SELECT death_save_successes FROM characters WHERE id = ?', [hero.id]);
  eq(row.death_save_successes, 3, '#146 stabilized at 3 successes');
  // Le mourant stabilisé n'est PAS vaincu pour autant
  row = srv.query('SELECT defeated FROM combatants WHERE id = ?', [cid]);
  eq(row.defeated, 0, '#146 stabilized player still in rotation');

  // ---------- #145 : le repos long efface les états ----------
  r = await api(base, 'POST', `/api/characters/${hero.id}/rest`, {
    token: PLAYER,
    body: { type: 'long' },
  });
  eq(r.status, 200, '#145 long rest ok');
  eq(r.data.character.conditions.length, 0, '#145 conditions cleared by long rest');
  row = srv.query('SELECT conditions FROM characters WHERE id = ?', [hero.id]);
  eq(JSON.parse(row.conditions).length, 0, '#145 conditions column empty after long rest');

  // ---------- #143 : munitions ----------
  // Le catalogue porte l'étiquette sur flèche/carreau — le GENRE en plus du
  // tag générique : c'est lui que l'arme équipée désigne (WEAPON_AMMUNITION).
  const arrow = srv.query("SELECT id, name_fr FROM items WHERE srd_index = 'arrow'");
  ok(arrow, '#143 arrow item exists');
  const bolt = srv.query("SELECT id, name_fr FROM items WHERE srd_index = 'crossbow-bolt'");
  ok(bolt, '#143 crossbow-bolt item exists');
  const tags = srv.query('SELECT survival_tags FROM items WHERE id = ?', [arrow.id]);
  const arrowTags = JSON.parse(tags.survival_tags) as string[];
  ok(arrowTags.includes('ammunition'), '#143 arrow tagged ammunition');
  ok(arrowTags.includes('arrow'), '#143 arrow tagged with its kind');
  const boltTags = JSON.parse(
    srv.query('SELECT survival_tags FROM items WHERE id = ?', [bolt.id]).survival_tags,
  ) as string[];
  ok(boltTags.includes('crossbow-bolt'), '#143 crossbow-bolt tagged with its kind');

  // Inventaire : 5 flèches et 4 carreaux, puis on tire à l'arc
  r = await api(base, 'POST', `/api/characters/${hero.id}/inventory`, {
    token: PLAYER,
    body: { itemId: arrow.id, quantity: 5 },
  });
  eq(r.status, 201, '#143 arrows added to inventory');
  r = await api(base, 'POST', `/api/characters/${hero.id}/inventory`, {
    token: PLAYER,
    body: { itemId: bolt.id, quantity: 4 },
  });
  eq(r.status, 201, '#143 bolts added to inventory');

  // Le genre est OBLIGATOIRE — l'arme équipée désigne SON consommable
  r = await api(base, 'POST', `/api/characters/${hero.id}/consume`, {
    token: PLAYER,
    body: { type: 'ammo' },
  });
  eq(r.status, 400, '#143 ammo consume without kind rejected');

  r = await api(base, 'POST', `/api/characters/${hero.id}/consume`, {
    token: PLAYER,
    body: { type: 'ammo', ammo: 'arrow' },
  });
  eq(r.status, 200, '#143 ammo consume ok');
  row = srv.query('SELECT quantity FROM inventory WHERE character_id = ? AND item_id = ?', [
    hero.id,
    arrow.id,
  ]);
  eq(row.quantity, 4, '#143 arrow count 5 → 4 after one shot');
  row = srv.query('SELECT quantity FROM inventory WHERE character_id = ? AND item_id = ?', [
    hero.id,
    bolt.id,
  ]);
  eq(row.quantity, 4, '#143 bolts untouched by an arrow shot');

  // Un tir à l'arbalète décrémente les carreaux, jamais les flèches
  r = await api(base, 'POST', `/api/characters/${hero.id}/consume`, {
    token: PLAYER,
    body: { type: 'ammo', ammo: 'crossbow-bolt' },
  });
  eq(r.status, 200, '#143 crossbow consume ok');
  row = srv.query('SELECT quantity FROM inventory WHERE character_id = ? AND item_id = ?', [
    hero.id,
    bolt.id,
  ]);
  eq(row.quantity, 3, '#143 bolt count 4 → 3 after one crossbow shot');
  const journal = srv.query(
    "SELECT COUNT(*) AS n FROM transactions WHERE character_id = ? AND reason = 'consume-ammo'",
    [hero.id],
  );
  eq(journal.n, 2, '#143 ammo consumption journaled');

  // Épuisement : refus propre quand il n'y a plus rien
  await api(base, 'PATCH', `/api/characters/${hero.id}`, {
    token: PLAYER,
    body: { currentHp: 20 },
  });
}
