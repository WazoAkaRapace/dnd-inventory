/**
 * Spell catalog routes: list SRD spells with filters, get a single spell.
 * Spells are global SRD reference data (no party scoping), but still
 * require authentication (enforced by the global guard in server.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { mapSpell, requireUser } from './helpers.ts';

interface SpellQuery {
  class?: string;
  level?: string;
  school?: string;
  search?: string;
  limit?: string;
  offset?: string;
}

export async function spellRoutes(app: FastifyInstance) {
  // ---------- List spells (paginated, filterable) ----------
  app.get(
    '/spells',
    async (req: FastifyRequest<{ Querystring: SpellQuery }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;

      const { class: klass, level, school, search } = req.query || {};
      const lim = Math.min(parseInt(req.query.limit || '30', 10) || 30, 200);
      const off = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

      const where: string[] = [];
      const params: any[] = [];

      // Class filter: classes_json LIKE (French class names, case-insensitive).
      // classes_json is stored as '["Magicien","Ensorceleur"]' so we match
      // against the quoted value. We wrap both sides in normalize() so accents
      // (é in "Magicien" is fine, but future-proof for accented names) match.
      if (klass) {
        // Multiclassage : le filtre accepte plusieurs classes (séparées par
        // des virgules) — UNION des listes de sorts.
        const classNames = String(klass)
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (classNames.length > 0) {
          const likes = classNames
            .map(() => `normalize(classes_json) LIKE normalize(?)`)
            .join(' OR ');
          where.push(`(${likes})`);
          for (const name of classNames) params.push(`%"${name}"%`);
        }
      }

      // Level filter: exact match (0-9). 0 = cantrip.
      if (level !== undefined && level !== '') {
        const lv = parseInt(level, 10);
        if (!Number.isNaN(lv) && lv >= 0 && lv <= 9) {
          where.push('level = ?');
          params.push(lv);
        }
      }

      // School filter: exact match (lowercase school key).
      if (school) {
        where.push('school = ?');
        params.push(school.toLowerCase());
      }

      // Search: accent-insensitive match on name OR name_fr.
      if (search) {
        where.push(`(
          normalize(name) LIKE normalize(?) OR
          normalize(name_fr) LIKE normalize(?)
        )`);
        params.push(`%${search}%`, `%${search}%`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const db = getDb();
      const rows = db
        .prepare(`
        SELECT * FROM spells
        ${whereSql}
        ORDER BY level ASC, COALESCE(name_fr, name) COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
      `)
        .all(...params, lim, off);

      const total = (
        db.prepare(`SELECT COUNT(*) as n FROM spells ${whereSql}`).get(...params) as any
      ).n;

      return reply.send({
        spells: rows.map(mapSpell),
        total,
        limit: lim,
        offset: off,
      });
    },
  );

  // ---------- Light catalog: id + French name + level for all spells ----------
  // Used for matching spell names in monster spellcasting entries. Small payload.
  app.get('/spells/light', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const rows = db
      .prepare(`
      SELECT id, name_fr, level FROM spells WHERE name_fr IS NOT NULL
      ORDER BY level ASC, name_fr COLLATE NOCASE ASC
    `)
      .all();
    return reply.send({
      spells: rows.map((r: any) => ({ id: r.id, nameFr: r.name_fr, level: r.level })),
    });
  });

  // ---------- Get single spell ----------
  app.get(
    '/spells/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const db = getDb();
      const row = db.prepare('SELECT * FROM spells WHERE id = ?').get(Number(req.params.id));
      if (!row) return reply.code(404).send({ error: 'spell not found' });
      return reply.send({ spell: mapSpell(row) });
    },
  );
}
