/**
 * Wild Shape routes (Druide, SRD): eligible beast list, shape, revert.
 *
 * While shaped, the character's HP bar IS the beast's HP (wild_shape_hp);
 * damage from the sheet or the combat tracker routes there, and hitting 0
 * reverts with excess damage carried over to the normal form (SRD).
 */

import {
  abilityModifier,
  computeAC,
  MOON_ELEMENTAL_SLUGS,
  rollHitPoints,
  wildShapeCanFly,
  wildShapeCanSwim,
  wildShapeMaxCR,
} from '@dnd-inventory/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { isPartyGM, requireUser } from './helpers.ts';

interface BeastRow {
  slug: string;
  name_fr: string | null;
  challenge_rating: number;
  size: string | null;
  armor_class: number | null;
  hit_points: number | null;
  hit_dice: string | null;
  speed_json: string | null;
}

function parseSpeed(raw: string | null): { fly: boolean; swim: boolean } {
  if (!raw) return { fly: false, swim: false };
  try {
    const speed = JSON.parse(raw);
    return { fly: speed.fly != null, swim: speed.swim != null };
  } catch {
    return { fly: false, swim: false };
  }
}

/** All of the character's combatants in non-ended encounters (newest first). */
function findActiveCombatants(db: any, characterId: number): any[] {
  return db
    .prepare(`
    SELECT c.* FROM combatants c
    JOIN encounters e ON e.id = c.encounter_id
    WHERE c.character_id = ? AND c.type = 'player' AND e.status != 'ended'
    ORDER BY e.created_at DESC, c.id DESC
  `)
    .all(characterId);
}

/** Recompute the character's normal AC from equipped armor. */
function normalAC(db: any, char: any): number | null {
  const rows = db
    .prepare(`
    SELECT i.category AS category, i.ac_base AS ac_base, i.str_min AS str_min,
           i.name_fr AS name_fr, i.name AS name, inv.equipped AS equipped
    FROM inventory inv JOIN items i ON i.id = inv.item_id
    WHERE inv.character_id = ? AND inv.equipped = 1
  `)
    .all(char.id) as any[];
  const dexMod = abilityModifier(char.dexterity ?? 10);
  const acResult = computeAC(
    rows.map((r) => ({
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
    char,
  );
  return char.armor_class_override ?? acResult.ac;
}

export async function wildShapeRoutes(app: FastifyInstance) {
  // ===== Eligible beast list for this druid =====
  app.get(
    '/characters/:id/wild-shape/forms',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      const gm = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !gm) {
        return reply.code(403).send({ error: 'Réservé au propriétaire ou au MD' });
      }

      const level = char.level ?? 1;
      const circle = char.druid_circle ?? null;
      const isMoon = circle === 'lune';
      const maxCR = wildShapeMaxCR(level, circle);
      const canSwim = wildShapeCanSwim(level);
      const canFly = wildShapeCanFly(level);
      // Circle of the Moon, level 10: Elemental Wild Shape
      const includeElementals = isMoon && level >= 10;

      const rows = db
        .prepare(`
        SELECT slug, name_fr, challenge_rating, size, armor_class, hit_points, hit_dice, speed_json
        FROM monsters WHERE type = 'Bête'
          ${includeElementals ? "OR slug IN ('elementaire-de-l-air','elementaire-de-l-eau','elementaire-de-la-terre','elementaire-du-feu')" : ''}
        ORDER BY challenge_rating, name_fr COLLATE NOCASE
      `)
        .all() as BeastRow[];

      // SRD: only beasts the druid has seen before
      let seen: string[] = [];
      try {
        const parsed = JSON.parse(char.wild_shape_seen_json ?? '[]');
        if (Array.isArray(parsed)) seen = parsed;
      } catch {
        /* default empty */
      }

      const forms = rows
        .map((r) => ({ row: r, speed: parseSpeed(r.speed_json) }))
        // Moon elementals are their own rule (CR 5), not gated by maxCR
        .filter(
          ({ row, speed }) =>
            (includeElementals && (MOON_ELEMENTAL_SLUGS as readonly string[]).includes(row.slug)) ||
            (row.challenge_rating <= maxCR && (!speed.fly || canFly) && (!speed.swim || canSwim)),
        )
        .map(({ row, speed }) => ({
          slug: row.slug,
          nameFr: row.name_fr,
          name: row.name_fr ?? row.slug,
          challengeRating: row.challenge_rating,
          size: row.size,
          armorClass: row.armor_class,
          hitPoints: row.hit_points,
          hitDice: row.hit_dice,
          fly: speed.fly,
          swim: speed.swim,
          seen: seen.includes(row.slug),
        }));

      return reply.send({
        forms,
        uses: char.wild_shape_uses ?? 2,
        unlimited: (char.level ?? 1) >= 20, // Archidruide (niveau 20)
        shaped: char.wild_shape_slug ?? null,
        maxCR,
        canSwim,
        canFly,
        circle: isMoon ? 'lune' : null,
        bonusActionShape: isMoon,
        elementals: includeElementals,
      });
    },
  );

  // ===== Enter Wild Shape =====
  app.post(
    '/characters/:id/wild-shape',
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: { slug?: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      const gm = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !gm) {
        return reply.code(403).send({ error: 'Réservé au propriétaire ou au MD' });
      }
      if (char.wild_shape_slug) {
        return reply.code(400).send({ error: 'Déjà sous forme animale' });
      }
      // Archidruide (niveau 20) : forme sauvage illimitée
      if ((char.wild_shape_uses ?? 2) <= 0 && (char.level ?? 1) < 20) {
        return reply.code(400).send({ error: "Plus d'utilisations — repos court requis" });
      }

      const beast = db
        .prepare('SELECT * FROM monsters WHERE slug = ?')
        .get(req.body?.slug ?? '') as any;
      // monsters are French-only in the catalog
      if (!beast) return reply.code(404).send({ error: 'Forme introuvable dans le bestiaire' });

      // SRD: the druid must have seen the beast before
      let seenList: string[] = [];
      try {
        const parsed = JSON.parse(char.wild_shape_seen_json ?? '[]');
        if (Array.isArray(parsed)) seenList = parsed;
      } catch {
        /* default empty */
      }
      if (!seenList.includes(beast.slug)) {
        return reply.code(400).send({ error: "Vous n'avez jamais vu cette bête" });
      }

      const level = char.level ?? 1;
      const circle = char.druid_circle ?? null;
      const maxCR = wildShapeMaxCR(level, circle);
      const speed = parseSpeed(beast.speed_json);
      const isMoonElemental =
        (MOON_ELEMENTAL_SLUGS as readonly string[]).includes(beast.slug) &&
        circle === 'lune' &&
        level >= 10;
      const eligible =
        isMoonElemental ||
        (beast.type === 'Bête' &&
          beast.challenge_rating <= maxCR &&
          (!speed.fly || wildShapeCanFly(level)) &&
          (!speed.swim || wildShapeCanSwim(level)));
      if (!eligible) {
        return reply.code(400).send({ error: 'Forme non autorisée à ce niveau' });
      }

      // Roll the beast's HP from its hit dice
      const hp = rollHitPoints(beast.hit_dice, beast.hit_points ?? 1, 0);

      const tx = db.transaction(() => {
        // Niveau 20 (Archidruide) : pas de décrément
        const usesExpr = (char.level ?? 1) >= 20 ? 'wild_shape_uses' : 'wild_shape_uses - 1';
        db.prepare(`
          UPDATE characters
          SET wild_shape_slug = ?, wild_shape_hp = ?, wild_shape_max_hp = ?, wild_shape_uses = ${usesExpr}
          WHERE id = ?
        `).run(beast.slug, hp, hp, char.id);

        // The combat tracker combatants become the beast
        for (const combatant of findActiveCombatants(db, char.id)) {
          db.prepare(`
            UPDATE combatants
            SET name = ?, hit_points = ?, max_hit_points = ?, armor_class = ?, defeated = 0
            WHERE id = ?
          `).run(
            `${char.name} (${beast.name_fr ?? beast.slug})`,
            hp,
            hp,
            beast.armor_class ?? 10,
            combatant.id,
          );
        }
      });
      tx();

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      bus.emitChange({
        type: 'combat:change',
        partyId: char.party_id,
        action: 'hp',
        actorUserId: userId,
      });
      return reply.code(201).send({
        shape: {
          slug: beast.slug,
          nameFr: beast.name_fr ?? beast.slug,
          hp,
          maxHp: hp,
          armorClass: beast.armor_class ?? 10,
        },
      });
    },
  );

  // ===== Revert to normal form =====
  app.post(
    '/characters/:id/wild-shape/revert',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const char = db
        .prepare('SELECT * FROM characters WHERE id = ?')
        .get(Number(req.params.id)) as any;
      if (!char) return reply.code(404).send({ error: 'Personnage introuvable' });
      const gm = isPartyGM(char.party_id, userId);
      if (char.owner_id !== userId && !gm) {
        return reply.code(403).send({ error: 'Réservé au propriétaire ou au MD' });
      }
      if (!char.wild_shape_slug) {
        return reply.code(400).send({ error: 'Pas sous forme animale' });
      }

      // SRD: return to the pre-shape HP; excess damage when dropped to 0 carries over
      const shapeHp = char.wild_shape_hp ?? 0;
      let newHp = char.current_hp ?? 1;
      let carried = 0;
      if (shapeHp < 0) {
        carried = -shapeHp;
        newHp = Math.max(0, newHp - carried);
      }

      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE characters
          SET wild_shape_slug = NULL, wild_shape_hp = NULL, wild_shape_max_hp = NULL, current_hp = ?
          WHERE id = ?
        `).run(newHp, char.id);

        // Combatants go back to the normal form
        for (const combatant of findActiveCombatants(db, char.id)) {
          const ac = normalAC(db, char);
          db.prepare(`
            UPDATE combatants SET name = ?, hit_points = ?, max_hit_points = ?, armor_class = ?, defeated = ?
            WHERE id = ?
          `).run(char.name, newHp, char.max_hp ?? 1, ac ?? 10, newHp <= 0 ? 1 : 0, combatant.id);
        }
      });
      tx();

      bus.emitChange({
        type: 'character:change',
        partyId: char.party_id,
        characterId: char.id,
        action: 'stats',
        actorUserId: userId,
      });
      bus.emitChange({
        type: 'combat:change',
        partyId: char.party_id,
        action: 'hp',
        actorUserId: userId,
      });
      return reply.send({ hp: newHp, excessDamage: carried });
    },
  );
}
