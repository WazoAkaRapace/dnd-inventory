/**
 * Combat routes: encounters + combatants CRUD, initiative, turn management.
 *
 * Encounters are party-scoped. Any party member can read; only the GM can
 * create/mutate encounters and combatants — EXCEPT a player can set the
 * initiative for their own combatant (so players roll their own initiative).
 *
 * Every mutation emits a 'combat:change' sync event so all connected clients
 * (GM grid + player widgets) refresh in real time.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { requireUser, isPartyMember, isPartyGM, getUserId, mirrorConditionsToCharacter } from './helpers.ts';
import { abilityModifier, computeAC, CONCENTRATION_BREAKING_CONDITIONS_FR } from '@dnd-inventory/shared';
import type {
  Combatant,
  CombatantCondition,
  ConcentrationCheck,
  Encounter,
  EncounterDetail,
  EncounterSummary,
  CombatantType,
  AddMonsterPayload,
  AddPlayerPayload,
  PatchCombatantPayload,
  PatchEncounterPayload,
  CreateEncounterPayload,
  SetInitiativePayload,
} from '@dnd-inventory/shared';

// ---------- Row mappers ----------

function parseConditions(raw: any): CombatantCondition[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapCombatant(row: any): Combatant {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    type: row.type as CombatantType,
    characterId: row.character_id ?? null,
    monsterSlug: row.monster_slug ?? null,
    name: row.name,
    count: row.count ?? 1,
    groupId: row.group_id ?? null,
    initiative: row.initiative ?? null,
    initiativeBonus: row.initiative_bonus ?? 0,
    armorClass: row.armor_class ?? 10,
    hitPoints: row.hit_points ?? 1,
    maxHitPoints: row.max_hit_points ?? 1,
    conditions: parseConditions(row.conditions),
    sortOrder: row.sort_order ?? 0,
    defeated: !!row.defeated,
    cardColor: row.card_color ?? null,
  };
}

function mapEncounter(row: any): Encounter {
  return {
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    round: row.round ?? 0,
    turnIndex: row.turn_index ?? 0,
    status: row.status ?? 'setup',
    createdAt: row.created_at,
  };
}

function mapEncounterSummary(row: any): EncounterSummary {
  return {
    ...mapEncounter(row),
    combatantCount: row.combatant_count ?? 0,
  };
}

/**
 * Sort combatants by initiative (desc), then initiative bonus (desc), then
 * name (asc). Combatants with null initiative sort last.
 * This is the canonical combat order.
 */
function sortCombatants(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    // Defeated combatants always go last
    if (a.defeated !== b.defeated) return a.defeated ? 1 : -1;
    // Null initiative sorts last
    const ai = a.initiative ?? -1;
    const bi = b.initiative ?? -1;
    if (bi !== ai) return bi - ai;
    // Tie-break on initiative bonus (dex mod)
    if (b.initiativeBonus !== a.initiativeBonus) return b.initiativeBonus - a.initiativeBonus;
    // Keep grouped monsters together
    const ga = a.groupId ?? -1;
    const gb = b.groupId ?? -1;
    if (ga !== gb) return ga - gb;
    // Final tie-break: name
    return a.name.localeCompare(b.name, 'fr');
  });
}

/**
 * Roll HP from a hit dice formula like "2d6+0" or "18d10+36".
 * Each die is rolled individually, then the flat bonus is added.
 * Falls back to the average HP if the formula can't be parsed.
 */
function rollHitPoints(hitDice: string | null, avgHp: number, conMod: number): number {
  if (!hitDice) return Math.max(1, avgHp);
  // Parse "2d6+0", "18d10+36", "3d8-1", etc.
  const match = hitDice.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/);
  if (!match) return Math.max(1, avgHp);
  const numDice = parseInt(match[1], 10);
  const dieSize = parseInt(match[2], 10);
  const flatBonus = match[3] ? parseInt(match[3], 10) : 0;
  let total = flatBonus;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * dieSize) + 1;
  }
  return Math.max(1, total);
}

/** Fetch encounter, verify party membership, return the encounter row or send error. */
async function getEncounterForUser(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<any | null> {
  const userId = requireUser(req, reply);
  if (userId === null) return null;
  const db = getDb();
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
  if (!enc) {
    reply.code(404).send({ error: 'Rencontre introuvable' });
    return null;
  }
  if (!isPartyMember(enc.party_id, userId)) {
    reply.code(403).send({ error: 'Pas membre du groupe' });
    return null;
  }
  return enc;
}

// ---------- Routes ----------

export async function combatRoutes(app: FastifyInstance) {
  // ===== List encounters for a party =====
  app.get(
    '/parties/:partyId/encounters',
    async (req: FastifyRequest<{ Params: { partyId: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyMember(partyId, userId)) return reply.code(403).send({ error: 'Pas membre du groupe' });

      const gm = isPartyGM(partyId, userId);
      const db = getDb();

      let rows: any[];
      if (gm) {
        // GM sees all encounters
        rows = db.prepare(`
          SELECT e.*, (SELECT COUNT(*) FROM combatants c WHERE c.encounter_id = e.id) AS combatant_count
          FROM encounters e
          WHERE e.party_id = ?
          ORDER BY e.created_at DESC
        `).all(partyId);
      } else {
        // Players only see encounters where they have a combatant (their character is in the fight)
        rows = db.prepare(`
          SELECT e.*, (SELECT COUNT(*) FROM combatants c WHERE c.encounter_id = e.id) AS combatant_count
          FROM encounters e
          WHERE e.party_id = ?
            AND EXISTS (
              SELECT 1 FROM combatants c
              JOIN characters ch ON ch.id = c.character_id
              WHERE c.encounter_id = e.id AND ch.owner_id = ?
            )
          ORDER BY e.created_at DESC
        `).all(partyId, userId);
      }

      return reply.send({ encounters: rows.map(mapEncounterSummary) });
    },
  );

  // ===== Create encounter (GM only) =====
  app.post(
    '/parties/:partyId/encounters',
    async (
      req: FastifyRequest<{ Params: { partyId: string }; Body: CreateEncounterPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      if (!isPartyGM(partyId, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const body = req.body || ({} as CreateEncounterPayload);
      const name = (body.name || '').trim();
      if (!name) return reply.code(400).send({ error: 'Le nom est requis' });

      const db = getDb();
      const info = db.prepare(`
        INSERT INTO encounters (party_id, name) VALUES (?, ?)
      `).run(partyId, name);
      const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(info.lastInsertRowid);

      bus.emitChange({ type: 'combat:change', partyId, action: 'turn', actorUserId: userId });
      return reply.code(201).send({ encounter: mapEncounter(row) });
    },
  );

  // ===== Get full encounter detail (with sorted combatants) =====
  app.get(
    '/encounters/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const enc = await getEncounterForUser(req, reply);
      if (!enc) return;

      const userId = getUserId(req);
      const gm = isPartyGM(enc.party_id, userId!);

      const db = getDb();

      // Players can only view encounters they're part of (have a combatant in)
      if (!gm) {
        const isInEncounter = db.prepare(`
          SELECT 1 FROM combatants c
          JOIN characters ch ON ch.id = c.character_id
          WHERE c.encounter_id = ? AND ch.owner_id = ?
          LIMIT 1
        `).get(enc.id, userId);
        if (!isInEncounter) {
          return reply.code(403).send({ error: 'Vous n\'êtes pas dans cette rencontre' });
        }
      }

      const rows = db.prepare('SELECT * FROM combatants WHERE encounter_id = ?').all(enc.id);
      let combatants = sortCombatants(rows.map(mapCombatant));

      // Privacy: non-GM players can only see HP/AC for their own combatants.
      // For everyone else (monsters + other players), redact those fields.
      if (!gm) {
        // Find this user's character IDs in the party
        const myCharIds = new Set(
          (db.prepare('SELECT id FROM characters WHERE party_id = ? AND owner_id = ?')
            .all(enc.party_id, userId!) as any[]).map((r) => r.id),
        );
        combatants = combatants.map((c) => {
          if (c.characterId !== null && myCharIds.has(c.characterId)) return c; // own combatant
          return { ...c, hitPoints: null, maxHitPoints: null, armorClass: null };
        });
      }

      const detail: EncounterDetail = { ...mapEncounter(enc), combatants };
      return reply.send({ encounter: detail });
    },
  );

  // ===== Update encounter (GM only): name, status, round, turnIndex =====
  app.patch(
    '/encounters/:id',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: PatchEncounterPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];

      if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name.trim()); }
      if (body.status !== undefined) { sets.push('status = ?'); vals.push(body.status); }
      if (body.round !== undefined) { sets.push('round = ?'); vals.push(body.round); }
      if (body.turnIndex !== undefined) { sets.push('turn_index = ?'); vals.push(body.turnIndex); }

      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });
      vals.push(enc.id);
      db.prepare(`UPDATE encounters SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id);
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'turn', actorUserId: userId });
      return reply.send({ encounter: mapEncounter(row) });
    },
  );

  // ===== Delete encounter (GM only) =====
  app.delete(
    '/encounters/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      db.prepare('DELETE FROM encounters WHERE id = ?').run(enc.id);
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'turn', actorUserId: userId });
      return reply.code(204).send();
    },
  );

  // ===== Add monster combatant (GM only) =====
  app.post(
    '/encounters/:id/combatants/monster',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: AddMonsterPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const body = req.body || ({} as AddMonsterPayload);
      if (!body.monsterSlug) return reply.code(400).send({ error: 'monsterSlug requis' });

      const monster = db.prepare('SELECT * FROM monsters WHERE slug = ?').get(body.monsterSlug) as any;
      if (!monster) return reply.code(404).send({ error: 'Monstre introuvable dans le catalogue' });

      const abilities = monster.abilities_json ? JSON.parse(monster.abilities_json) : { dex: 10 };
      const dexMod = abilityModifier(abilities.dex ?? 10);
      const count = Math.max(1, Math.min(body.count ?? 1, 50));
      const name = (body.name || monster.name_fr).trim();

      // Parse CON modifier for HP rolls (hit dice + CON mod per die)
      const conMod = abilityModifier(abilities.con ?? 10);

      // Check if there's already a group of this monster type in this encounter.
      // If so, new combatants join the existing group (same initiative).
      const existingGroup = db.prepare(`
        SELECT group_id, initiative, sort_order FROM combatants
        WHERE encounter_id = ? AND monster_slug = ? AND group_id IS NOT NULL
        LIMIT 1
      `).get(enc.id, monster.slug) as any;

      // Unique group id — Date.now() alone can collide when two different
      // monster types are added within the same millisecond, which would
      // wrongly merge them into one group.
      const groupId = existingGroup?.group_id ?? Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const sortOrder = existingGroup?.sort_order ?? groupId;
      const sharedInitiative = existingGroup?.initiative ?? null;

      // Create N independent combatants sharing a group_id.
      // Each rolls its own HP from the hit dice formula for variety.
      // If joining an existing group, inherit its initiative.
      const insertStmt = db.prepare(`
        INSERT INTO combatants (encounter_id, type, monster_slug, name, count, group_id, initiative, initiative_bonus, armor_class, hit_points, max_hit_points, sort_order)
        VALUES (?, 'monster', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const createdIds: number[] = [];
      const tx = db.transaction(() => {
        for (let i = 0; i < count; i++) {
          const hp = rollHitPoints(monster.hit_dice, monster.hit_points ?? 1, conMod);
          const info = insertStmt.run(
            enc.id,
            monster.slug,
            name,
            count,
            groupId,
            sharedInitiative,
            dexMod,
            monster.armor_class ?? 10,
            hp,
            hp,
            sortOrder,
          );
          createdIds.push(Number(info.lastInsertRowid));
        }
      });
      tx();

      const rows = db.prepare(`SELECT * FROM combatants WHERE id IN (${createdIds.map(() => '?').join(',')}) ORDER BY id`).all(...createdIds);
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'add', actorUserId: userId });
      return reply.code(201).send({ combatants: rows.map(mapCombatant) });
    },
  );

  // ===== Add player combatant (GM only) =====
  app.post(
    '/encounters/:id/combatants/player',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: AddPlayerPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const body = req.body || ({} as AddPlayerPayload);
      if (!body.characterId) return reply.code(400).send({ error: 'characterId requis' });

      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(body.characterId) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      if (char.party_id !== enc.party_id) return reply.code(400).send({ error: 'Personnage pas dans ce groupe' });

      // Compute AC from equipped armor
      const invRows = db.prepare(`
        SELECT i.category AS category, i.ac_base AS ac_base, i.str_min AS str_min,
               i.name_fr AS name_fr, i.name AS name, inv.equipped AS equipped
        FROM inventory inv JOIN items i ON i.id = inv.item_id
        WHERE inv.character_id = ? AND inv.equipped = 1
      `).all(char.id) as any[];
      const dexMod = abilityModifier(char.dexterity ?? 10);
      const acResult = computeAC(
        invRows.map((r) => ({
          item: {
            category: r.category,
            acBase: r.ac_base,
            strMin: r.str_min,
            nameFr: r.name_fr,
            name: r.name,
          },
          equipped: !!r.equipped,
        })),
        dexMod,
        char.fighting_style === 'defense',
        { constitution: char.constitution, wisdom: char.wisdom, characterClass: char.character_class },
      );
      const ac = char.armor_class_override ?? acResult.ac;

      const info = db.prepare(`
        INSERT INTO combatants (encounter_id, type, character_id, name, count, initiative_bonus, armor_class, hit_points, max_hit_points, sort_order)
        VALUES (?, 'player', ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(
        enc.id,
        char.id,
        char.name,
        dexMod,
        ac,
        char.current_hp ?? 1,
        char.max_hp ?? 1,
        Date.now(),
      );

      const row = db.prepare('SELECT * FROM combatants WHERE id = ?').get(info.lastInsertRowid);
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'add', actorUserId: userId });
      return reply.code(201).send({ combatant: mapCombatant(row) });
    },
  );

  // ===== Set initiative (player for own combatant, or GM for any) =====
  app.patch(
    '/encounters/:id/combatants/:cid/initiative',
    async (
      req: FastifyRequest<{ Params: { id: string; cid: string }; Body: SetInitiativePayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyMember(enc.party_id, userId)) return reply.code(403).send({ error: 'Pas membre du groupe' });

      const combatant = db.prepare('SELECT * FROM combatants WHERE id = ?').get(Number(req.params.cid)) as any;
      if (!combatant || combatant.encounter_id !== enc.id) {
        return reply.code(404).send({ error: 'Combattant introuvable' });
      }

      // Authorization: GM can set any; player can only set their own combatant
      const gm = isPartyGM(enc.party_id, userId);
      if (!gm) {
        const char = combatant.character_id
          ? db.prepare('SELECT owner_id FROM characters WHERE id = ?').get(combatant.character_id) as any
          : null;
        if (!char || char.owner_id !== userId) {
          return reply.code(403).send({ error: 'Vous ne pouvez modifier que votre propre initiative' });
        }
      }

      const body = req.body || ({} as SetInitiativePayload);
      const initiative = Math.max(0, Math.min(40, Math.round(body.initiative)));

      // If this combatant is part of a group, set initiative for ALL members
      // (grouped monsters share initiative).
      if (combatant.group_id) {
        db.prepare('UPDATE combatants SET initiative = ? WHERE encounter_id = ? AND group_id = ?')
          .run(initiative, enc.id, combatant.group_id);
      } else {
        db.prepare('UPDATE combatants SET initiative = ? WHERE id = ?').run(initiative, combatant.id);
      }

      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'initiative', actorUserId: userId });
      return reply.send({ ok: true });
    },
  );

  // ===== Update combatant (GM only): HP, conditions, count, etc. =====
  app.patch(
    '/combatants/:cid',
    async (
      req: FastifyRequest<{ Params: { cid: string }; Body: PatchCombatantPayload }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const combatant = db.prepare('SELECT * FROM combatants WHERE id = ?').get(Number(req.params.cid)) as any;
      if (!combatant) return reply.code(404).send({ error: 'Combattant introuvable' });

      const enc = db.prepare('SELECT party_id FROM encounters WHERE id = ?').get(combatant.encounter_id) as any;
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const body = req.body || {};
      const sets: string[] = [];
      const vals: any[] = [];

      if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
      if (body.count !== undefined) { sets.push('count = ?'); vals.push(Math.max(1, body.count)); }
      if (body.initiative !== undefined) { sets.push('initiative = ?'); vals.push(body.initiative); }
      if (body.armorClass !== undefined) { sets.push('armor_class = ?'); vals.push(body.armorClass); }
      if (body.hitPoints !== undefined) { sets.push('hit_points = ?'); vals.push(Math.max(0, body.hitPoints)); }
      if (body.maxHitPoints !== undefined) { sets.push('max_hit_points = ?'); vals.push(Math.max(1, body.maxHitPoints)); }
      if (body.conditions !== undefined) { sets.push('conditions = ?'); vals.push(JSON.stringify(body.conditions)); }
      if (body.defeated !== undefined) { sets.push('defeated = ?'); vals.push(body.defeated ? 1 : 0); }
      if (body.cardColor !== undefined) { sets.push('card_color = ?'); vals.push(body.cardColor); }

      if (sets.length === 0) return reply.code(400).send({ error: 'no fields to update' });

      // Auto-set defeated when HP hits 0; auto-clear when HP goes above 0
      if (body.hitPoints !== undefined && body.defeated === undefined) {
        if (body.hitPoints <= 0) {
          sets.push('defeated = 1');
        } else {
          sets.push('defeated = 0');
        }
      }

      vals.push(combatant.id);
      db.prepare(`UPDATE combatants SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      // --- Concentration: if the GM damaged a player who is concentrating on
      // a spell, that player must roll a CON save (DC 10 or half damage).
      let concentration: ConcentrationCheck | undefined;
      if (
        body.hitPoints !== undefined &&
        combatant.type === 'player' &&
        combatant.character_id
      ) {
        const ch = db.prepare('SELECT id, name, owner_id, concentrating FROM characters WHERE id = ?')
          .get(combatant.character_id) as any;
        if (ch?.concentrating) {
          const damage = (combatant.hit_points ?? 0) - Math.max(0, body.hitPoints);
          if (damage > 0 && body.hitPoints > 0) {
            concentration = {
              characterId: ch.id,
              characterName: ch.name,
              damage,
              dc: Math.max(10, Math.floor(damage / 2)),
              ownerId: ch.owner_id,
            };
          } else if (body.hitPoints <= 0) {
            // Unconscious → concentration ends automatically on the sheet too.
            db.prepare('UPDATE characters SET concentrating = 0 WHERE id = ?').run(ch.id);
            bus.emitChange({ type: 'character:change', partyId: enc.party_id, characterId: ch.id, action: 'stats', actorUserId: userId });
          }
        }
      }

      const row = db.prepare('SELECT * FROM combatants WHERE id = ?').get(combatant.id);

      // --- HP sync: the tracker is the player's sheet HP — mirror PV/PV max
      // changes back to the character so both views stay identical.
      if (
        combatant.type === 'player' &&
        combatant.character_id &&
        (body.hitPoints !== undefined || body.maxHitPoints !== undefined)
      ) {
        const setsC: string[] = [];
        const valsC: any[] = [];
        if (body.hitPoints !== undefined) { setsC.push('current_hp = ?'); valsC.push(Math.max(0, body.hitPoints)); }
        if (body.maxHitPoints !== undefined) { setsC.push('max_hp = ?'); valsC.push(Math.max(1, body.maxHitPoints)); }
        if (setsC.length > 0) {
          valsC.push(combatant.character_id);
          db.prepare(`UPDATE characters SET ${setsC.join(', ')} WHERE id = ?`).run(...valsC);
          bus.emitChange({ type: 'character:change', partyId: enc.party_id, characterId: combatant.character_id, action: 'hp', actorUserId: userId });
        }
      }

      // --- Condition sync: tracker condition changes mirror to the sheet
      // (names only — durations stay a combat-tracker detail).
      if (body.conditions !== undefined && combatant.type === 'player' && combatant.character_id) {
        const prevNames = parseConditions(combatant.conditions).map((c) => c.name);
        const nextNames = body.conditions.map((c) => c.name);
        mirrorConditionsToCharacter(
          enc.party_id,
          combatant.character_id,
          nextNames.filter((n) => !prevNames.includes(n)),
          prevNames.filter((n) => !nextNames.includes(n)),
          userId,
        );
      }

      // --- Concentration: an incapacitating condition applied by the GM
      // (Inconscient, Paralysé, …) breaks the player's concentration.
      let concentrationBroken: string | undefined;
      if (body.conditions && combatant.type === 'player' && combatant.character_id) {
        const breaking = body.conditions.find((c) => CONCENTRATION_BREAKING_CONDITIONS_FR.includes(c.name));
        if (breaking) {
          const ch = db.prepare('SELECT id, concentrating FROM characters WHERE id = ?')
            .get(combatant.character_id) as any;
          if (ch?.concentrating) {
            db.prepare('UPDATE characters SET concentrating = 0 WHERE id = ?').run(ch.id);
            bus.emitChange({ type: 'character:change', partyId: enc.party_id, characterId: ch.id, action: 'stats', actorUserId: userId });
            concentrationBroken = breaking.name;
          }
        }
      }

      bus.emitChange({
        type: 'combat:change',
        partyId: enc.party_id,
        action: 'hp',
        actorUserId: userId,
        ...(concentration ? { concentration } : {}),
      });
      return reply.send({
        combatant: mapCombatant(row),
        ...(concentrationBroken ? { concentrationBroken } : {}),
      });
    },
  );

  // ===== Delete combatant (GM only). If grouped, deletes entire group. =====
  app.delete(
    '/combatants/:cid',
    async (req: FastifyRequest<{ Params: { cid: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const combatant = db.prepare('SELECT * FROM combatants WHERE id = ?').get(Number(req.params.cid)) as any;
      if (!combatant) return reply.code(404).send({ error: 'Combattant introuvable' });

      const enc = db.prepare('SELECT party_id FROM encounters WHERE id = ?').get(combatant.encounter_id) as any;
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      // If grouped, delete ALL members of the group (they were added together)
      if (combatant.group_id) {
        db.prepare('DELETE FROM combatants WHERE encounter_id = ? AND group_id = ?')
          .run(combatant.encounter_id, combatant.group_id);
      } else {
        db.prepare('DELETE FROM combatants WHERE id = ?').run(combatant.id);
      }
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'remove', actorUserId: userId });
      return reply.code(204).send();
    },
  );

  // ===== Next turn (GM only): advance turnIndex, handle round wrap + condition expiry =====
  app.post(
    '/encounters/:id/next-turn',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(Number(req.params.id)) as any;
      if (!enc) return reply.code(404).send({ error: 'Rencontre introuvable' });
      if (!isPartyGM(enc.party_id, userId)) return reply.code(403).send({ error: 'Réservé au MD' });

      const rows = db.prepare('SELECT * FROM combatants WHERE encounter_id = ?').all(enc.id);
      const sorted = sortCombatants(rows.map(mapCombatant));
      const active = sorted.filter((c) => !c.defeated);

      if (active.length === 0) {
        return reply.code(400).send({ error: 'Aucun combattant actif' });
      }

      // --- Starting the combat: setup → active, round 1, first combatant acts.
      // No turn is ending yet, so no condition expiry and no advancing.
      if (enc.status === 'setup') {
        const firstIdx = Math.max(0, sorted.findIndex((c) => !c.defeated));
        db.prepare('UPDATE encounters SET status = ?, round = 1, turn_index = ? WHERE id = ?')
          .run('active', firstIdx, enc.id);
        const started = db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id);
        bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'turn', actorUserId: userId });
        return reply.send({ encounter: mapEncounter(started) });
      }

      // --- Condition expiry for ALL combatants whose turn is ending ---
      // (grouped monsters share initiative, so they share a turn)
      const currentIdx = Math.min(enc.turn_index, sorted.length - 1);
      const currentCombatant = sorted[currentIdx];
      if (currentCombatant) {
        const currentInit = currentCombatant.initiative;
        const currentGroup = currentCombatant.groupId;
        // Find all combatants sharing this turn (same group, or same initiative
        // for non-grouped combatants at the same position)
        const sameTurn = sorted.filter(
          (c) => (currentGroup && c.groupId === currentGroup) || c.id === currentCombatant.id,
        );
        for (const c of sameTurn) {
          if (c.conditions.length === 0) continue;
          let changed = false;
          const expired: string[] = [];
          const updated = c.conditions
            .map((cond) => {
              if (cond.duration === null) return cond; // until dispelled
              if (cond.duration <= 1) { changed = true; expired.push(cond.name); return null; } // expired
              changed = true;
              return { ...cond, duration: cond.duration - 1 };
            })
            .filter((cond): cond is CombatantCondition => cond !== null);
          if (changed) {
            db.prepare('UPDATE combatants SET conditions = ? WHERE id = ?')
              .run(JSON.stringify(updated), c.id);
            // Expired conditions leave the character sheet too
            if (expired.length > 0 && c.type === 'player' && c.characterId) {
              mirrorConditionsToCharacter(enc.party_id, c.characterId, [], expired, userId);
            }
          }
        }
      }

      // --- Advance turn: skip past the entire current group ---
      // Grouped combatants are adjacent in sorted order. Find the next combatant
      // that is NOT in the current group (or, for non-grouped, just +1).
      let nextIndex = currentIdx + 1;
      let round = enc.round;
      const currentGroup = currentCombatant?.groupId;

      // If current is part of a group, skip past all group members
      if (currentGroup) {
        while (nextIndex < sorted.length && sorted[nextIndex]?.groupId === currentGroup) {
          nextIndex++;
        }
      }

      // If we've passed the end, wrap to start and increment round
      if (nextIndex >= sorted.length) {
        nextIndex = 0;
        round = round + 1;
        if (round === 1) {
          db.prepare('UPDATE encounters SET status = ? WHERE id = ?').run('active', enc.id);
        }
      }

      // Skip defeated combatants (and their group members)
      const refetchedRows = db.prepare('SELECT * FROM combatants WHERE encounter_id = ?').all(enc.id);
      const refetchedSorted = sortCombatants(refetchedRows.map(mapCombatant));
      let guard = 0;
      while (refetchedSorted[nextIndex]?.defeated && guard < refetchedSorted.length * 2) {
        const skipGroup = refetchedSorted[nextIndex]?.groupId;
        nextIndex++;
        // Skip remaining group members too
        if (skipGroup) {
          while (nextIndex < refetchedSorted.length && refetchedSorted[nextIndex]?.groupId === skipGroup) {
            nextIndex++;
          }
        }
        if (nextIndex >= refetchedSorted.length) {
          nextIndex = 0;
          round++;
        }
        guard++;
      }

      db.prepare('UPDATE encounters SET turn_index = ?, round = ? WHERE id = ?')
        .run(nextIndex, round, enc.id);

      const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id);
      bus.emitChange({ type: 'combat:change', partyId: enc.party_id, action: 'turn', actorUserId: userId });
      return reply.send({ encounter: mapEncounter(row) });
    },
  );
}
