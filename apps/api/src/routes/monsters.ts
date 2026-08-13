/**
 * Monster catalog routes: search the French SRD bestiary, get a full stat block.
 * Monsters are global reference data (no party scoping), like spells.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { requireUser } from './helpers.ts';
import type { Monster, MonsterSummary } from '@dnd-inventory/shared';

interface MonsterQuery {
  search?: string;
  limit?: string;
}

/** Map a raw DB row to a full Monster stat block (parses JSON columns). */
function mapMonster(row: any): Monster {
  return {
    slug: row.slug,
    nameFr: row.name_fr,
    type: row.type ?? '',
    subtype: row.subtype ?? null,
    size: row.size ?? 'M',
    alignment: row.alignment ?? null,
    armorClass: row.armor_class ?? 10,
    armorDesc: row.armor_desc ?? null,
    hitPoints: row.hit_points ?? 10,
    hitDice: row.hit_dice ?? null,
    speed: parseJson(row.speed_json, {}),
    abilities: parseJson(row.abilities_json, { for: 10, dex: 10, con: 10, int: 10, sag: 10, cha: 10 }),
    savingThrows: parseJson(row.saving_throws_json, []),
    skills: parseJson(row.skills_json, []),
    languages: parseJson(row.languages_json, []),
    challengeRating: row.challenge_rating ?? 0,
    xp: row.xp ?? 0,
    senses: row.senses ?? null,
    telepathy: row.telepathy ?? null,
    damageResistances: parseJsonOrNull(row.damage_resistances_json),
    damageImmunities: parseJsonOrNull(row.damage_immunities_json),
    conditionImmunities: parseJsonOrNull(row.condition_immunities_json),
    traits: parseJson(row.traits_json, []),
    actions: parseJson(row.actions_json, []),
    legendaryActions: parseJson(row.legendary_actions_json, []),
  };
}

/** Map a raw DB row to a light MonsterSummary (no prose). */
function mapMonsterSummary(row: any): MonsterSummary {
  return {
    slug: row.slug,
    nameFr: row.name_fr,
    type: row.type ?? '',
    size: row.size ?? 'M',
    challengeRating: row.challenge_rating ?? 0,
    armorClass: row.armor_class ?? 10,
    hitPoints: row.hit_points ?? 10,
  };
}

function parseJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    const parsed = JSON.parse(raw);
    return (parsed === null ? fallback : parsed) as T;
  } catch {
    return fallback;
  }
}

function parseJsonOrNull(raw: any): any[] | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function monsterRoutes(app: FastifyInstance) {
  // ---------- Search monsters (DB-filtered, accent-insensitive) ----------
  app.get(
    '/monsters',
    async (req: FastifyRequest<{ Querystring: MonsterQuery }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;

      const { search } = req.query || {};
      const lim = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);

      const where: string[] = [];
      const params: any[] = [];

      if (search) {
        where.push(`(
          normalize(name_fr) LIKE normalize(?) OR
          normalize(type) LIKE normalize(?)
        )`);
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const db = getDb();
      const rows = db.prepare(`
        SELECT slug, name_fr, type, size, challenge_rating, armor_class, hit_points
        FROM monsters
        ${whereSql}
        ORDER BY challenge_rating ASC, name_fr COLLATE NOCASE ASC
        LIMIT ?
      `).all(...params, lim);

      return reply.send({ monsters: rows.map(mapMonsterSummary) });
    },
  );

  // ---------- Get a full monster stat block ----------
  app.get(
    '/monsters/:slug',
    async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;

      const db = getDb();
      const row = db.prepare('SELECT * FROM monsters WHERE slug = ?').get(req.params.slug);
      if (!row) return reply.code(404).send({ error: 'Monstre introuvable' });

      return reply.send({ monster: mapMonster(row) });
    },
  );
}
