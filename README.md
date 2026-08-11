# D&D Inventory

A mobile-first inventory management app for D&D 5e parties. Track items, weight (in **kg / SI**), encumbrance, and coins across the whole party. GMs can monitor and modify every player's inventory in real time.

Sibling project to the *Tomb of Annihilation* DM dashboard — exposes a dev API so the ToA site can integrate against it.

## Stack

| Layer    | Tech                                            |
| -------- | ----------------------------------------------- |
| Frontend | React 18 + Vite + Tailwind CSS (mobile-first)   |
| Backend  | Fastify 4 + better-sqlite3 (Node 20)            |
| Auth     | Username/password (bcrypt + JWT)                |
| Data     | 5e SRD items (5e-bits/5e-database, MIT + OGL)   |
| Deploy   | Docker Compose (2 services)                     |

All weights are stored and displayed in **kilograms**. SRD source data (in lb) is converted at import time.

## Quick start (dev)

```bash
# 1. Install dependencies (all workspaces)
npm install

# 2. Import the SRD item catalog (lb → kg) into data/items-seed.json
npm run import-items

# 3. Run DB migration + seed items
npm run migrate
npm run seed

# 4. Start both API and web in dev mode
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:4000  (health check: `/api/health`)

## Quick start (Docker)

```bash
docker compose up --build
```

- Web app: http://localhost:8080
- API: http://localhost:4000

## Dev API (for ToA integration)

The API runs on port 4000 with CORS enabled. Key endpoints:

```
GET  /api/health
POST /api/auth/register    { username, password, display_name } → { token }
POST /api/auth/login       { username, password } → { token }
GET  /api/me               (Bearer token) → user
GET  /api/items            ?search=&category=&rarity= → paginated catalog
GET  /api/characters/:id/inventory   → items + computed weight (kg) + encumbrance
```

See `docs/API.md` (generated from Fastify OpenAPI) once the server is running.

## Encumbrance

DMG variant encumbrance, converted to kg (1 lb = 0.4536 kg):

| Tier                | Threshold (kg)      | Effect                          |
| ------------------- | ------------------- | ------------------------------- |
| Encumbered          | STR × **2.27** kg   | Speed −10 ft                    |
| Heavily encumbered  | STR × **4.54** kg   | Speed −20 ft, disadvantage      |
| Max carry           | STR × **6.80** kg   | Cannot move / lift more         |

## Item data license

Item data is from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) — MIT licensed code, OGL v1.0a content. See `data/LICENSE`.

## License

MIT (code). Item data: OGL v1.0a.
