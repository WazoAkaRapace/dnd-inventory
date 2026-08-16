/**
 * Auth routes: register, login, me, logout.
 * Passwords hashed with bcrypt. JWT issued on login/register.
 */

import type { User } from '@dnd-inventory/shared';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.ts';

const BCRYPT_ROUNDS = 10;

interface AuthBody {
  username: string;
  password: string;
  displayName?: string;
}

function sanitizeUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // ---------- Register ----------
  app.post('/register', async (req: FastifyRequest<{ Body: AuthBody }>, reply: FastifyReply) => {
    const { username, password, displayName } = req.body || {};
    if (!username || !password || !displayName) {
      return reply.code(400).send({ error: 'username, password, and displayName are required' });
    }
    if (username.length < 3) return reply.code(400).send({ error: 'username must be ≥ 3 chars' });
    if (password.length < 6) return reply.code(400).send({ error: 'password must be ≥ 6 chars' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return reply.code(409).send({ error: 'username already taken' });

    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const info = db
      .prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)')
      .run(username, hash, displayName);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const user = sanitizeUser(row);
    const token = app.jwt.sign({ sub: user.id, username: user.username });
    return reply.code(201).send({ token, user });
  });

  // ---------- Login ----------
  app.post('/login', async (req: FastifyRequest<{ Body: AuthBody }>, reply: FastifyReply) => {
    const { username, password } = req.body || {};
    if (!username || !password)
      return reply.code(400).send({ error: 'username and password required' });

    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!row) return reply.code(401).send({ error: 'invalid credentials' });

    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return reply.code(401).send({ error: 'invalid credentials' });

    const user = sanitizeUser(row);
    const token = app.jwt.sign({ sub: user.id, username: user.username });
    return reply.send({ token, user });
  });

  // ---------- Me (current user) ----------
  app.get(
    '/me',
    { onRequest: [(app as any).authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.sub;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const db = getDb();
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!row) return reply.code(404).send({ error: 'user not found' });
      return reply.send({ user: sanitizeUser(row) });
    },
  );

  // ---------- Logout ----------
  app.post('/logout', async (_req, reply) => {
    // Stateless JWT: client just discards the token. Return 204.
    return reply.code(204).send();
  });
}
