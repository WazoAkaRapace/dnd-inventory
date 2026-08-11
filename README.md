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

## Quick start (Docker — pre-built images)

```bash
# Set a secure JWT secret
export JWT_SECRET="your-secret-here"

# Pull and run the pre-built images from GitHub Container Registry
docker compose -f docker-compose.prod.yml up -d
```

- Web app: http://localhost:8080
- API: http://localhost:4010

Images are published automatically on every push to `main`:
- `ghcr.io/wazoakarapace/dnd-inventory-api:main`
- `ghcr.io/wazoakarapace/dnd-inventory-web:main`

## Quick start (Docker — build from source)

```bash
docker compose up --build
```

- Web app: http://localhost:8080
- API: http://localhost:4010

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

| Tier                | Threshold (kg)      | Effect                                    |
| ------------------- | ------------------- | ----------------------------------------- |
| Encumbered          | STR × **2.27** kg   | Vitesse réduite de 3 m                    |
| Heavily encumbered  | STR × **4.54** kg   | Vitesse réduite de 6 m · Désavantage FOR/CON |
| Max carry           | STR × **6.80** kg   | Immobilisé — impossible de se déplacer    |

Coin weight is included: 50 coins = 0.45 kg (1 lb). A hoard of 5000 gold pieces weighs 45 kg.

## Item data license

Item data is from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) — MIT licensed code, OGL v1.0a content. See `data/LICENSE`.

## License

MIT (code). Item data: OGL v1.0a.
