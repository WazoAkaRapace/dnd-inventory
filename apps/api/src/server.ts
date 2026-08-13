/**
 * Fastify server entry point.
 * Runs the dev API on http://localhost:4000
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { migrate } from './db/index.ts';
import { seedItems, seedSpells } from './db/seed.ts';
import { authRoutes } from './routes/auth.ts';
import { partyRoutes } from './routes/parties.ts';
import { characterRoutes } from './routes/characters.ts';
import { inventoryRoutes } from './routes/inventory.ts';
import { itemRoutes } from './routes/items.ts';
import { locationRoutes } from './routes/locations.ts';
import { npcRoutes } from './routes/npcs.ts';
import { spellRoutes } from './routes/spells.ts';
import { characterSpellRoutes } from './routes/character-spells.ts';
import { characterFeatureRoutes } from './routes/character-features.ts';
import { registerWsRoutes } from './sync/ws.ts';

const PORT = parseInt(process.env.PORT || '4000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me-in-production';

async function buildServer() {
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cors, {
    origin: true, // reflect origin (dev-friendly)
    credentials: true,
  });
  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '7d' },
  });
  await app.register(websocket);

  // Health check (public)
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Auth decorator
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  // Global auth guard: require JWT on all /api routes EXCEPT public ones.
  // /ws authenticates via query param token, so it's excluded here.
  app.addHook('onRequest', async (request: any, reply: any) => {
    const url = request.url.split('?')[0];
    if (
      url === '/api/health' ||
      url === '/api/auth/login' ||
      url === '/api/auth/register' ||
      url === '/api/auth/logout' ||
      url === '/ws'
    ) {
      return; // public routes
    }
    if (!url.startsWith('/api/')) return;
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(itemRoutes, { prefix: '/api' });
  await app.register(partyRoutes, { prefix: '/api' });
  await app.register(characterRoutes, { prefix: '/api' });
  await app.register(inventoryRoutes, { prefix: '/api' });
  await app.register(locationRoutes, { prefix: '/api' });
  await app.register(npcRoutes, { prefix: '/api' });
  await app.register(spellRoutes, { prefix: '/api' });
  await app.register(characterSpellRoutes, { prefix: '/api' });
  await app.register(characterFeatureRoutes, { prefix: '/api' });

  // WebSocket (real-time sync)
  await registerWsRoutes(app);

  return app;
}

async function start() {
  // Auto-migrate + seed on boot (idempotent)
  migrate();
  try {
    seedItems();
  } catch (err) {
    console.warn(`[server] seed skipped: ${(err as Error).message}`);
  }
  try {
    seedSpells();
  } catch (err) {
    console.warn(`[server] spell seed skipped: ${(err as Error).message}`);
  }

  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 API running at http://localhost:${PORT}`);
    console.log(`🔌 WebSocket at ws://localhost:${PORT}/ws`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
