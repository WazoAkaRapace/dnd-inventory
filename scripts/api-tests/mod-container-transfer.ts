/**
 * #161 — transfert de conteneur entre personnages :
 * POST /characters/:id/transfer-container { toCharacterId, locationId }.
 * Le conteneur (storage_locations type='container') déménage AVEC son
 * contenu : les lignes d'inventaire gardent leur storage_location_id,
 * changent de character_id et arrivent NON équipées. L'objet conteneur
 * lui-même suit le chemin de POST /transfer (décrément/suppression chez
 * le donneur + upsert dans le porté du receveur). Journal : UNE ligne
 * par côté (« Sac (+N objets) »), jamais une par contenu.
 */
import { api, createCharacter, eq, type Fixtures, ok, type ServerHandle } from './harness.ts';

export async function run(base: string, fx: Fixtures, srv: ServerHandle): Promise<void> {
  const GM = fx.gm.token;
  const A = fx.charAlya.id; // alice (GM)
  const B = fx.charBran.id; // bob (joueur)

  // ---------- fixture : un sac conteneur chez Alya, 3 objets dedans ----------
  const seedItems = srv.queryAll('SELECT id FROM items ORDER BY id LIMIT 4');
  ok(seedItems.length >= 4, '#161 seed items available');
  const [containerItem, ...contentItems] = seedItems;

  let r = await api(base, 'POST', `/api/characters/${A}/locations`, {
    token: GM,
    body: { name: 'Sac renforcé', type: 'container', itemId: containerItem.id },
  });
  eq(r.status, 201, '#161 container location created');
  const loc = r.data.location;
  eq(loc.type, 'container', '#161 location type container');
  eq(loc.itemId, containerItem.id, '#161 location linked to container item');

  // L'objet conteneur lui-même, posé dans le porté d'Alya (quantité 2 →
  // branche décrément du transfert d'objet)
  r = await api(base, 'POST', `/api/characters/${A}/inventory`, {
    token: GM,
    body: { itemId: containerItem.id, quantity: 2 },
  });
  eq(r.status, 201, '#161 container object added to giver');

  // 3 objets dans le conteneur, dont un équipé (doit arriver déséquipé)
  const contentEntryIds: number[] = [];
  for (const it of contentItems) {
    r = await api(base, 'POST', `/api/characters/${A}/inventory`, {
      token: GM,
      body: { itemId: it.id, quantity: 1, storageLocationId: loc.id },
    });
    eq(r.status, 201, '#161 content row added');
    contentEntryIds.push(r.data.entry.id);
  }
  r = await api(base, 'PATCH', `/api/inventory/${contentEntryIds[0]}`, {
    token: GM,
    body: { equipped: true },
  });
  eq(r.status, 200, '#161 one content row equipped');

  // ---------- cas limites AVANT le happy path (le sac doit rester entier) ----------
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: GM,
    body: { locationId: loc.id }, // pas de toCharacterId
  });
  eq(r.status, 400, '#161 missing toCharacterId → 400');

  // cross-party : outsider (dave) crée son propre perso dans son groupe
  const oParty = await api(base, 'POST', '/api/parties', {
    token: fx.outsider.token,
    body: { name: 'Groupe lointain #161' },
  });
  const oChar = await createCharacter(base, fx.outsider.token, oParty.data.party.id, {
    name: 'Ailleurs',
    maxHp: 10,
  });
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: GM,
    body: { toCharacterId: oChar.id, locationId: loc.id },
  });
  eq(r.status, 400, '#161 cross-party → 400');

  // non-propriétaire : carol (player2, simple membre) ne peut pas donner
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: fx.player2.token,
    body: { toCharacterId: B, locationId: loc.id },
  });
  eq(r.status, 403, '#161 non-owner → 403');

  // le lieu de quelqu'un d'autre : bob donne « depuis Bran » un sac d'Alya
  r = await api(base, 'POST', `/api/characters/${B}/transfer-container`, {
    token: fx.player.token,
    body: { toCharacterId: A, locationId: loc.id },
  });
  eq(r.status, 404, "#161 someone else's location id → 404");

  // ---------- happy path : Alya → Bran (alice, propriétaire) ----------
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: GM,
    body: { toCharacterId: B, locationId: loc.id },
  });
  eq(r.status, 200, '#161 happy path 200');
  eq(r.data.transferred, 1, '#161 one container transferred');
  eq(r.data.itemsMoved, 3, '#161 3 content rows moved');

  // Le lieu a changé de personnage
  const locRow = srv.query('SELECT character_id FROM storage_locations WHERE id = ?', loc.id);
  eq(locRow.character_id, B, '#161 location now belongs to receiver');

  // Tout le contenu a suivi (même storage_location_id, nouveau character_id,
  // arrivé déséquipé)
  const contentRows = srv.queryAll(
    'SELECT id, character_id, equipped FROM inventory WHERE storage_location_id = ? ORDER BY id',
    loc.id,
  );
  eq(contentRows.length, 3, '#161 all 3 content rows on the location');
  ok(
    contentRows.every((row: any) => row.character_id === B),
    '#161 content rows moved to receiver',
  );
  ok(
    contentRows.every((row: any) => row.equipped === 0),
    '#161 content arrived unequipped',
  );
  eq(
    srv.query(
      'SELECT COUNT(*) AS c FROM inventory WHERE character_id = ? AND storage_location_id = ?',
      A,
      loc.id,
    ).c,
    0,
    '#161 giver has no content left on the location',
  );

  // L'objet conteneur : décrémenté chez la donneuse (2 → 1), arrivé (1) chez
  // le receveur, dans son « Sur moi »
  eq(
    srv.query(
      'SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE character_id = ? AND item_id = ?',
      A,
      containerItem.id,
    ).q,
    1,
    '#161 giver container object decremented to 1',
  );
  const destRow = srv.query(
    `SELECT quantity AS q FROM inventory i
     JOIN storage_locations s ON s.id = i.storage_location_id
     WHERE i.character_id = ? AND i.item_id = ? AND s.type = 'carried'`,
    B,
    containerItem.id,
  );
  eq(destRow.q, 1, '#161 receiver holds the container object in carried');

  // Journal : une ligne par côté, au nom du conteneur avec le compte
  const tx = srv.queryAll(
    'SELECT character_id, item_name, delta_qty FROM transactions WHERE reason LIKE ? ORDER BY id DESC LIMIT 2',
    'transfer%',
  );
  ok(tx.length === 2, '#161 two journal rows (container-level only)');
  ok(
    tx.some((t: any) => t.character_id === A && t.delta_qty === -1),
    '#161 transfer-out logged for giver',
  );
  ok(
    tx.some((t: any) => t.character_id === B && t.delta_qty === 1),
    '#161 transfer-in logged for receiver',
  );
  ok(
    tx.every((t: any) => t.item_name === 'Sac renforcé (+3 objets)'),
    `#161 journal names the container with count, got ${tx.map((t: any) => t.item_name).join(' / ')}`,
  );
  eq(
    srv.query(
      'SELECT COUNT(*) AS c FROM transactions WHERE reason LIKE ? AND item_name = ?',
      'transfer%',
      'Sac renforcé',
    ).c,
    0,
    '#161 no per-content journal lines',
  );

  // ---------- le MD peut transférer le conteneur d'un joueur ----------
  r = await api(base, 'POST', `/api/characters/${B}/transfer-container`, {
    token: GM,
    body: { toCharacterId: A, locationId: loc.id },
  });
  eq(r.status, 200, '#161 GM transfers a player container');
  eq(
    srv.query('SELECT character_id FROM storage_locations WHERE id = ?', loc.id).character_id,
    A,
    '#161 container back on Alya',
  );

  // ---------- un lieu non-conteneur est refusé ----------
  r = await api(base, 'POST', `/api/characters/${A}/locations`, {
    token: GM,
    body: { name: 'Cheval', type: 'mount' },
  });
  const mount = r.data.location;
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: GM,
    body: { toCharacterId: B, locationId: mount.id },
  });
  eq(r.status, 400, '#161 mount (non-container) → 400');

  // lieu inexistant
  r = await api(base, 'POST', `/api/characters/${A}/transfer-container`, {
    token: GM,
    body: { toCharacterId: B, locationId: 999999 },
  });
  eq(r.status, 404, '#161 unknown location → 404');
}
