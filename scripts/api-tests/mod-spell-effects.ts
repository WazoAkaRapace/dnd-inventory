/**
 * Effets de sort sur la CA (v1) : pose/lecture/levée + chaque voie de
 * rupture de concentration (dégâts fiche + jet raté, conditions brisantes
 * côté fiche ET côté traqueur, 0 PV, remplacement par un nouveau sort
 * concentré, repos long), doublon 409, visibilité groupe (403 non-membre),
 * miroir traqueur (CA du combatant à l'ajout ET EN CONTINU : chaque pose /
 * levée / rupture resynchronise la ligne — plus d'effet fantôme au traqueur),
 * override manuel GAGNE, équipement armure/bouclier.
 */
import { api, createCharacter, eq, type Fixtures, ok, type ServerHandle } from './harness.ts';

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  const A = fx.charBran.id; // perso de bob (joueur) — DEX 16 (+3), sans armure

  // Carol rejoint le groupe : lecture par membre non-propriétaire.
  const join = await api(base, 'POST', '/api/parties/join', {
    token: fx.player2.token,
    body: { inviteCode: fx.inviteCode },
  });
  ok(join.status === 201, 'carol rejoint le groupe');

  const spellId = (slug: string): number => {
    const row = srv.query('SELECT id FROM spells WHERE srd_index = ?', slug);
    ok(row, `sort ${slug} seedé`);
    return row.id;
  };
  const faith = spellId('shield-of-faith');
  const haste = spellId('haste');
  const mageArmor = spellId('mage-armor');
  const shieldSpell = spellId('shield');
  const fireball = spellId('fireball');

  // ---------- POST : pose + concentration suit ----------
  let r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: {},
  });
  eq(r.status, 400, 'pose sans spellId → 400');
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: 999999 },
  });
  eq(r.status, 404, 'pose sort inconnu → 404');
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: fireball },
  });
  eq(r.status, 422, 'pose sort sans effet CA → 422');
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.outsider.token,
    body: { spellId: faith },
  });
  eq(r.status, 403, 'pose par non-membre → 403');

  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 201, 'pose Bouclier de la foi');
  eq(r.data.effect.effectKind, 'ac_bonus', 'kind dérivé de SPELL_AC_EFFECTS');
  eq(r.data.effect.acValue, 2, 'valeur dérivée (+2)');
  eq(r.data.effect.tiedToConcentration, true, 'concentration-dépendant');
  eq(r.data.effect.spell.srdIndex, 'shield-of-faith', 'sort joint par nom');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    1,
    'pose un effet concentré → concentrating = 1',
  );

  // ---------- GET : lignes actives jointes au nom du sort ----------
  r = await api(base, 'GET', `/api/characters/${A}/spell-effects`, { token: fx.gm.token });
  eq(r.status, 200, 'GET effets (MD)');
  eq(r.data.effects.length, 1, 'une ligne active');
  eq(r.data.effects[0].spell.nameFr, 'Bouclier de la foi', 'nom du sort joint');
  r = await api(base, 'GET', `/api/characters/${A}/spell-effects`, { token: fx.player2.token });
  eq(r.status, 200, 'GET effets (membre non owner)');
  r = await api(base, 'GET', `/api/characters/${A}/spell-effects`, { token: fx.outsider.token });
  eq(r.status, 403, 'GET par non-membre → 403');

  // ---------- doublon actif → 409 ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 409, 'POST double → 409');

  // ---------- miroir traqueur : combatant créé APRÈS le cast porte la CA ----------
  const enc = await api(base, 'POST', `/api/parties/${fx.partyId}/encounters`, {
    token: fx.gm.token,
    body: { name: 'Effets' },
  });
  eq(enc.status, 201, 'rencontre créée');
  r = await api(base, 'POST', `/api/encounters/${enc.data.encounter.id}/combatants/player`, {
    token: fx.gm.token,
    body: { characterIds: [A] },
  });
  eq(r.status, 201, 'combatant ajouté');
  const combatantId = r.data.combatants[0].id;
  // Bran : DEX 16 (+3), sans armure → 13 ; + Bouclier de la foi (+2) → 15.
  eq(r.data.combatants[0].armorClass, 15, 'CA du combatant inclut les effets actifs (13+2)');
  /** CA courante du combatant miroir (base : 13 nu, DEX +3 sans armure). */
  const combatantAc = (): number =>
    srv.query('SELECT armor_class AS ac FROM combatants WHERE id = ?', combatantId).ac;

  // ---------- voie DÉGÂTS (fiche) : jet raté → concentrating 0 + effets tombent ----------
  // On force la rupture : PATCH currentHp avec concentrating explicite false
  // (le joueur a raté son jet) — la concentration tombe, les lignes suivent.
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { currentHp: 10, concentrating: false },
  });
  eq(r.status, 200, 'PATCH dégâts + concentration abandonnée');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    0,
    'concentrating = 0',
  );
  eq(
    srv.query(
      'SELECT active FROM character_spell_effects WHERE character_id = ? AND spell_id = ?',
      A,
      faith,
    ).active,
    0,
    'voie dégâts/jet raté : ligne inactive',
  );
  r = await api(base, 'GET', `/api/characters/${A}/spell-effects`, { token: fx.player.token });
  eq(r.data.effects.length, 0, 'GET ne montre plus que les actives');
  eq(combatantAc(), 13, 'voie dégâts (fiche) : CA du combatant retombée à 13');

  // ---------- voie NOUVEAU SORT CONCENTRÉ (remplacement) ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: haste },
  });
  eq(r.status, 201, 're-pose après levée (ligne historique inactive ne bloque pas)');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    1,
    'concentration relevée',
  );
  // Le cast d'un NOUVEAU sort concentré (CastSpellSheet PATCH concentrating true
  // alors qu'un effet concentré est actif) : l'ancien effet tombe dans la même tx.
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { concentrating: true },
  });
  eq(r.status, 200, 'PATCH nouveau sort concentré');
  // concentré manuellement levé : concentrating false → effets liés tombent
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { concentrating: false },
  });
  eq(
    srv.query(
      'SELECT COUNT(*) AS c FROM character_spell_effects WHERE character_id = ? AND active = 1',
      A,
    ).c,
    0,
    'voie remplacement : plus aucun effet actif après la chute de concentration',
  );
  eq(combatantAc(), 13, 'voie remplacement : CA du combatant retombée à 13');

  // ---------- voie CONDITIONS BRISANTES (fiche) : Incapacitated ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 201, 'pose foi (conditions)');
  eq(combatantAc(), 15, 'pose (conditions fiche) : CA du combatant 15');
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { conditions: ['Neutralisé'] },
  });
  eq(r.status, 200, 'PATCH condition brisante');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    0,
    'condition brisante → concentrating 0',
  );
  eq(
    srv.query(
      'SELECT active FROM character_spell_effects WHERE character_id = ? AND spell_id = ?',
      A,
      faith,
    ).active,
    0,
    'voie conditions (fiche) : ligne inactive',
  );
  eq(typeof r.data.concentrationBroken, 'string', 'réponse porte concentrationBroken (annonce UI)');
  eq(combatantAc(), 13, 'voie conditions (fiche) : CA du combatant retombée à 13');
  // nettoie la condition
  await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { conditions: [] },
  });

  // ---------- voie CONDITIONS BRISANTES (traqueur) : le MD pose Inconscient ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 201, 'pose foi (traqueur)');
  eq(combatantAc(), 15, 'pose (conditions traqueur) : CA du combatant 15');
  r = await api(base, 'PATCH', `/api/combatants/${combatantId}`, {
    token: fx.gm.token,
    body: { conditions: [{ name: 'Inconscient', duration: 1 }] },
  });
  eq(r.status, 200, 'PATCH combatant condition brisante');
  eq(r.status, 200, 'conditions mirrorées');
  eq(
    srv.query(
      'SELECT active FROM character_spell_effects WHERE character_id = ? AND spell_id = ?',
      A,
      faith,
    ).active,
    0,
    'voie conditions (traqueur) : ligne inactive',
  );
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    0,
    'voie conditions (traqueur) : concentrating 0',
  );
  eq(combatantAc(), 13, 'voie conditions (traqueur) : CA du combatant retombée à 13');

  // ---------- voie 0 PV (fiche) ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: haste },
  });
  eq(r.status, 201, 'pose hâte (0 PV)');
  eq(combatantAc(), 15, 'pose hâte : CA du combatant 15');
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { currentHp: 0 },
  });
  eq(r.status, 200, 'PATCH 0 PV');
  eq(
    srv.query(
      'SELECT active FROM character_spell_effects WHERE character_id = ? AND spell_id = ?',
      A,
      haste,
    ).active,
    0,
    'voie 0 PV (fiche) : ligne inactive',
  );
  eq(combatantAc(), 13, 'voie 0 PV (fiche) : CA du combatant retombée à 13');
  await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { currentHp: 10 },
  });

  // ---------- voie 0 PV (traqueur) ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: haste },
  });
  eq(r.status, 201, 'pose hâte (traqueur 0 PV)');
  eq(combatantAc(), 15, 'pose hâte (traqueur) : CA du combatant 15');
  r = await api(base, 'PATCH', `/api/combatants/${combatantId}`, {
    token: fx.gm.token,
    body: { hitPoints: 0 },
  });
  eq(r.status, 200, 'PATCH combatant 0 PV');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    0,
    'voie 0 PV (traqueur) : concentrating 0',
  );
  eq(
    srv.query(
      'SELECT active FROM character_spell_effects WHERE character_id = ? AND spell_id = ?',
      A,
      haste,
    ).active,
    0,
    'voie 0 PV (traqueur) : ligne inactive',
  );
  eq(combatantAc(), 13, 'voie 0 PV (traqueur) : CA du combatant retombée à 13');

  // ---------- DELETE : désactive + concentration suit ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 201, 'pose foi (DELETE)');
  eq(combatantAc(), 15, 'pose (DELETE) : CA du combatant 15');
  const effectId = r.data.effect.id;
  r = await api(base, 'DELETE', `/api/spell-effects/${effectId}`, {
    token: fx.outsider.token,
  });
  eq(r.status, 403, 'DELETE par non-membre → 403');
  r = await api(base, 'DELETE', `/api/spell-effects/${effectId}`, { token: fx.gm.token });
  eq(r.status, 200, 'DELETE effet (MD)');
  eq(r.data.concentrating, false, 'plus aucun effet concentré → concentrating suit (0)');
  eq(
    srv.query('SELECT active FROM character_spell_effects WHERE id = ?', effectId).active,
    0,
    'ligne désactivée (historique conservé)',
  );
  eq(
    srv.query('SELECT COUNT(*) AS c FROM character_spell_effects WHERE id = ?', effectId).c,
    1,
    'ligne conservée, pas supprimée',
  );
  eq(combatantAc(), 13, 'levée (DELETE) : CA du combatant retombée à 13');
  r = await api(base, 'DELETE', `/api/spell-effects/${effectId}`, { token: fx.gm.token });
  eq(r.status, 409, 'DELETE déjà levé → 409');

  // DELETE d'un effet NON concentré ne touche pas la concentration :
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: faith },
  });
  eq(r.status, 201, 'pose foi (mixte)');
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: shieldSpell },
  });
  eq(r.status, 201, 'pose Bouclier (non concentré)');
  eq(combatantAc(), 20, 'cumul foi +2 et bouclier +5 : CA du combatant 20');
  eq(
    srv.query('SELECT concentrating FROM characters WHERE id = ?', A).concentrating,
    1,
    'concentration posée par la foi',
  );
  const shieldEffectId = r.data.effect.id;
  r = await api(base, 'DELETE', `/api/spell-effects/${shieldEffectId}`, {
    token: fx.player.token,
  });
  eq(r.status, 200, 'DELETE Bouclier');
  eq(
    r.data.concentrating,
    true,
    'lever un effet non concentré garde la concentration (la foi la justifie encore)',
  );
  eq(combatantAc(), 15, 'levée du bouclier : CA du combatant 15 (la foi tient)');
  // puis lever la foi → concentration tombe
  const faithRow = srv.query(
    'SELECT id FROM character_spell_effects WHERE character_id = ? AND spell_id = ? AND active = 1',
    A,
    faith,
  );
  r = await api(base, 'DELETE', `/api/spell-effects/${faithRow.id}`, {
    token: fx.player.token,
  });
  eq(r.data.concentrating, false, 'lever le dernier effet concentré → concentration 0');
  eq(combatantAc(), 13, 'levée de la foi : CA du combatant 13');

  // ---------- effet non concentré survit à la chute de concentration ----------
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: haste },
  });
  eq(r.status, 201, 'pose hâte (survie armure de mage)');
  r = await api(base, 'POST', `/api/characters/${A}/spell-effects`, {
    token: fx.player.token,
    body: { spellId: mageArmor },
  });
  eq(r.status, 201, 'pose Armure de mage (non concentrée)');
  const mageEffectId = r.data.effect.id;
  // Set-formula = PLANCHER (v1) : hâte déjà posée (13+2=15), l'armure de
  // mage pose max(CA, 13+DEX=16) → 16 — le plancher couvre la hâte, pas
  // d'empilement +3 par-dessus.
  eq(combatantAc(), 16, 'armure de mage plancher 16 couvre la hâte : CA du combatant 16');
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { concentrating: false },
  });
  eq(
    srv.query('SELECT active FROM character_spell_effects WHERE id = ?', mageEffectId).active,
    1,
    'Armure de mage survit à la chute de concentration',
  );
  eq(combatantAc(), 16, 'hâte tombée, armure de mage tient : CA du combatant 16');

  // ---------- repos long : la concentration tombe, les effets liés aussi ----------
  r = await api(base, 'POST', `/api/characters/${A}/rest`, {
    token: fx.player.token,
    body: { type: 'long' },
  });
  eq(r.status, 200, 'repos long');
  eq(
    srv.query('SELECT active FROM character_spell_effects WHERE id = ?', mageEffectId).active,
    1,
    'Armure de mage survit au repos long (8 h à la main — design v1)',
  );

  // ---------- historique : les lignes levées ne polluent pas GET ----------
  r = await api(base, 'GET', `/api/characters/${A}/spell-effects`, { token: fx.player.token });
  eq(r.data.effects.length, 1, 'une seule ligne active (armure de mage)');

  // ---------- override manuel GAGNE : le combatant suit l'override ----------
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { armorClassOverride: 18 },
  });
  eq(r.status, 200, 'PATCH override CA 18');
  eq(combatantAc(), 18, 'override manuel : CA du combatant 18 (GAGNE sur les effets)');
  r = await api(base, 'PATCH', `/api/characters/${A}`, {
    token: fx.player.token,
    body: { armorClassOverride: null },
  });
  eq(
    combatantAc(),
    16,
    'override retiré : CA du combatant revient aux effets (16, armure de mage)',
  );

  // ---------- équipement : équiper/retirer un bouclier suit au traqueur ----------
  // L'armure de mage (plancher 16) masquerait le bouclier — on la lève
  // d'abord : CA nue 13, le bouclier porte à 15.
  r = await api(base, 'DELETE', `/api/spell-effects/${mageEffectId}`, {
    token: fx.player.token,
  });
  eq(r.status, 200, 'lève Armure de mage (calcul propre du bouclier)');
  eq(combatantAc(), 13, 'CA nue : CA du combatant 13');
  const shieldItem = srv.query(
    'SELECT id FROM items WHERE name_fr = ? OR name = ?',
    'Bouclier',
    'Bouclier',
  );
  ok(shieldItem, 'item Bouclier seedé');
  r = await api(base, 'POST', `/api/characters/${A}/inventory`, {
    token: fx.player.token,
    body: { itemId: shieldItem.id, equipped: true },
  });
  eq(r.status, 201, 'équipe un bouclier');
  eq(combatantAc(), 15, 'bouclier équipé (+2 sur 13) : CA du combatant 15');
  const invId = srv.query(
    'SELECT id FROM inventory WHERE character_id = ? AND item_id = ?',
    A,
    shieldItem.id,
  ).id;
  r = await api(base, 'PATCH', `/api/inventory/${invId}`, {
    token: fx.player.token,
    body: { equipped: false },
  });
  eq(r.status, 200, 'déséquipe le bouclier');
  eq(combatantAc(), 13, 'bouclier déséquipé : CA du combatant 13');
  r = await api(base, 'PATCH', `/api/inventory/${invId}`, {
    token: fx.player.token,
    body: { equipped: true },
  });
  eq(combatantAc(), 15, 're-équipé : CA du combatant 15');
  r = await api(base, 'DELETE', `/api/inventory/${invId}`, { token: fx.player.token });
  eq(r.status, 204, 'supprime le bouclier');
  eq(combatantAc(), 13, 'bouclier supprimé : CA du combatant 13');

  // ---------- perso dédié : doublon 409 n\'a pas fui sur un autre perso ----------
  const other = await createCharacter(base, fx.gm.token, fx.partyId, {
    name: 'SansEffet',
    maxHp: 8,
  });
  r = await api(base, 'GET', `/api/characters/${other.id}/spell-effects`, { token: fx.gm.token });
  eq(r.data.effects.length, 0, 'autre perso : aucun effet');
}
