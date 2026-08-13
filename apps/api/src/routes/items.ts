/**
 * Item catalog routes: search SRD + custom items, GM creates custom items.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';
import { bus } from '../sync/bus.ts';
import { requireUser, mapItem } from './helpers.ts';
import type { ItemCategory, Rarity, CreateCustomItem } from '@dnd-inventory/shared';

interface ItemQuery {
  search?: string;
  category?: string;
  rarity?: string;
  limit?: string;
  offset?: string;
  partyId?: string;
}

export async function itemRoutes(app: FastifyInstance) {
  // ---------- Search catalog ----------
  app.get('/items', { onRequest: [(app as any).authenticate] }, async (req: FastifyRequest<{ Querystring: ItemQuery }>, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;

    const { search, category, rarity, limit, offset, source, partyId: partyIdFilter } = req.query as any || {};
    const lim = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const off = Math.max(parseInt(offset || '0', 10) || 0, 0);

    const db = getDb();
    const where: string[] = [];
    const params: any[] = [];

    // If filtering by a specific party (e.g. GM dashboard custom items),
    // return only that party's items — no SRD items.
    if (partyIdFilter) {
      where.push('party_id = ?');
      params.push(Number(partyIdFilter));
    } else {
      // Default: show global SRD items + custom items from the user's parties
      const userPartyIds = (db.prepare('SELECT party_id FROM party_members WHERE user_id = ?').all(userId) as any[])
        .map((r) => r.party_id);
      if (userPartyIds.length > 0) {
        const placeholders = userPartyIds.map(() => '?').join(',');
        where.push(`(party_id IS NULL OR party_id IN (${placeholders}))`);
        params.push(...userPartyIds);
      } else {
        where.push('(party_id IS NULL)');
      }
    }

    if (search) {
      // Accent-insensitive search using a custom SQLite function registered in server.ts.
      // normalize() strips diacritics (é→e, è→e) and lowercases.
      const norm = search.replace(/-/g, ' ');
      where.push(`(
        name LIKE ? ESCAPE '\\' OR
        name_fr LIKE ? ESCAPE '\\' OR
        srd_index LIKE ? ESCAPE '\\' OR
        normalize(name) LIKE normalize(?) OR
        normalize(name_fr) LIKE normalize(?) OR
        normalize(REPLACE(name, '-', ' ')) LIKE normalize(?) OR
        normalize(COALESCE(aliases, '')) LIKE normalize(?)
      )`);
      params.push(
        `%${search}%`, `%${search}%`, `%${search}%`,
        `%${norm}%`, `%${norm}%`, `%${norm}%`,
        `%${norm}%`,
      );
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (rarity && rarity !== 'none') {
      where.push('rarity = ?');
      params.push(rarity);
    }
    if (source) {
      where.push('source = ?');
      params.push(source);
    }

    const sql = `
      SELECT * FROM items
      WHERE ${where.join(' AND ')}
      ORDER BY name COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(sql).all(...params, lim, off);
    const total = (
      db.prepare(`SELECT COUNT(*) as n FROM items WHERE ${where.join(' AND ')}`).get(...params) as any
    ).n;

    return reply.send({
      items: rows.map(mapItem),
      total,
      limit: lim,
      offset: off,
    });
  });

  // ---------- Get single item ----------
  app.get('/items/:id', { onRequest: [(app as any).authenticate] }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = requireUser(req, reply);
    if (userId === null) return;
    const db = getDb();
    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'item not found' });
    return reply.send({ item: mapItem(row) });
  });

  // ---------- GM: create custom item for a party ----------
  app.post(
    '/parties/:partyId/items',
    { onRequest: [(app as any).authenticate] },
    async (
      req: FastifyRequest<{ Params: { partyId: string }; Body: CreateCustomItem }>,
      reply: FastifyReply,
    ) => {
      const userId = requireUser(req, reply);
      if (userId === null) return;
      const partyId = Number(req.params.partyId);
      const body = req.body || ({} as CreateCustomItem);

      if (!body.name || !body.name.trim()) {
        return reply.code(400).send({ error: 'name is required' });
      }

      const info = getDb().prepare(`
        INSERT INTO items (
          source, party_id, category, name, name_fr, rarity,
          weight_kg, cost_qty, cost_unit, description
        ) VALUES ('custom', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        partyId,
        body.category || 'custom',
        body.name.trim(),
        body.nameFr || null,
        body.rarity || 'none',
        body.weightKg ?? null,
        body.costQty ?? null,
        body.costUnit ?? null,
        body.description || null,
      );

      const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
      bus.emitChange({ type: 'party:change', partyId, action: 'custom-item', actorUserId: userId });
      return reply.code(201).send({ item: mapItem(row) });
    },
  );
}
