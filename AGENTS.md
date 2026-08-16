# Repository Guide

**Standalone monorepo** — React 19 + Fastify 5 + better-sqlite3 character sheet, inventory manager & combat tracker for D&D 5e (French). Deployed via Docker. Repo: `github.com/WazoAkaRapace/dnd-inventory`.

### Structure
```
apps/api/      Fastify API (better-sqlite3, JWT auth, WebSocket sync)
apps/web/      React + Vite + Tailwind v4 frontend
packages/shared/  Shared TypeScript types + D&D 5e SRD rules engine
data/          Seed JSON (646 items, 490 spells, 964 monsters) + SQLite DB
scripts/       Import/translate scripts + rules test suites
biome.jsonc    Linter + formatter config (whole monorepo)
```

### Commands
```bash
npm install              # Install all workspace deps
npm run dev              # Start API (port 4000) + Web (port 5173) concurrently
docker compose up --build  # Docker: API on 4010, Web on 8080 (real user data lives here)
npm run lint             # Biome: lint + format check (CI gate, currently clean)
npm run lint:fix         # Biome: fix + format everything
npm run format           # Biome: format only
npm run import-items     # Fetch & convert SRD items (lb→kg)
npx tsx scripts/import-monsters.ts  # Import SRD bestiary (5e-drs, all sources)
npm run test-weapon-stats  # Weapon/monk/unarmed/fighting-style/sneak/extra-attack checks
npm run test-armor-stats   # AC/magic-armor/speed/wild-shape/unarmored-defense checks
```

### Key conventions
- **All weights in kilograms** (French SRD metric values from 5e-drs.fr/AideDD.org)
- **Everything in French** — UI text, item/spell/monster names, descriptions
- **Import paths use `.ts` extensions** (tsx runtime, `moduleResolution: Bundler`); the API runs via tsx in Docker (no build step)
- **npm workspaces**: `-w` flags take package NAMES (`@dnd-inventory/api`, `@dnd-inventory/web`), not directory paths
- **TypeScript is v7 (native/Go port)** — `tsc -b` typechecking works, but there is NO classic JS API (`ts.createSourceFile` etc.); AST-based codemods need a standalone `typescript@5` install. Known baselines: web `tsc -b` always reports the same 11 errors (pre-existing — compare against that signature, don't chase them); the API shows TS5097 `.ts`-extension noise everywhere (expected under Bundler resolution)
- **Lint/format = Biome 2.5** — config MUST be `biome.jsonc` (comments in `biome.json` make it unparseable and Biome silently falls back to defaults: tabs + double quotes — has bitten us once). House style: 2 spaces, single quotes, semicolons, trailing commas, LF, width 100, sorted imports. `css.parser.tailwindDirectives: true` for Tailwind v4 at-rules. Excluded: `data/**`, `package-lock.json`, screenshots. Deliberate rule exceptions (documented in config): `noExplicitAny` (SQLite `as any` row-mapping convention), `noNonNullAssertion`, `noAutofocus` (modals focus their input), `useKeyWithClickEvents`/`noStaticElementInteractions` (mobile tap-outside overlays, div click zones)
- **Code style enforced by lint**: every `<button>` gets an explicit `type` (forms' submit buttons are `type="submit"`, everything else `type="button"`); form labels associate via `htmlFor`/`id`; intentional rule violations use `// biome-ignore lint/<group>/<rule>: <why>` — the suppression comment must sit on the line directly above the diagnostic (the formatter re-wraps long JSX tags, so prefer value-based keys or restructuring over suppressions anchored to attribute lines)
- **Shared rules engine** (`packages/shared/src/index.ts`): abilities, proficiency, encumbrance, spell slots, `computeAC`, `computeWeaponStats`, `computeUnarmedStats`, `computeSpeed`, wild shape, sneak attack, extra attacks, always-prepared spell tables (cleric domains, druid terrains, paladin oaths), hit-dice rolling. Web pages AND the combat API both call these — keep rules in shared, never duplicate
- **DB migrations**: new columns go in `COLUMN_MIGRATIONS` in `apps/api/src/db/index.ts` (ALTER TABLE pattern, idempotent, auto-run on boot)
- **better-sqlite3@13 ships prebuilds** — no node-gyp build needed; npm `allowScripts` warnings about its install script are benign
- **WebSocket sync**: events fan out per party via `apps/api/src/sync/`. Echo suppression is SERVER-SIDE (`ws.ts` skips the acting user's connections — they already have their API response), with `combat:change` and `character:change` EXEMPT (a user can be GM in one tab and player in another). Client `markLocalMutation()` is a kept-for-compat no-op. Defensive pattern: after own combat mutations (e.g. initiative PATCH), the client bumps a local `combatRefresh` counter so the combat hub refetches even if the event never arrives. Client debounce coalesces per event kind (type + character + party); one-shot `concentration` payloads bypass the debounce entirely
- **HP is synced both ways**: PATCHing a player combatant (tracker) mirrors to the character sheet and vice versa, including the wild-shape shape bar and auto-revert at 0 with excess carry-over
- **Tailwind v4**: theme defined in `@theme` CSS block (not JS config). Custom colors: parchment, blood, ink, gold
- **Bottom sheets must be portaled** (`createPortal(document.body)`): `.card`'s `backdrop-blur` creates a containing block that breaks `position: fixed` inside it
- **Hooks must run before render guards** in CharacterInventoryPage (and anywhere with early returns): conditional hook counts crash React (#310 — has happened). The combat-indicator hooks sit above the guards with a comment saying so
- **Spell data**: 319 SRD + 171 expansion (Xanathar/Tasha/Fizban) from AideDD.org. Monster data: 5e-drs (all sources) + 60 adventure-module stat blocks + AideDD supplement — french-only `name_fr` column (no English `name` on monsters; spells have both)
- **OCR quirks in seed data**: catalog stores `'Crusader s mantle'`, `'Acid Arrow'` (Flèche acide de Melf) — check `WHERE name = ?` before adding name-keyed tables

### Rate limiting (`apps/api/src/rateLimit.ts`)
**Scoped to ERRORS ONLY by design** — a whole table shares one IP behind nginx, so counting successful requests would block the entire party. Counts only responses with status ≥ 400 (excluding 429 itself). Buckets (60 s window): auth-fail routes (`/api/auth/login`, `/api/auth/register`, `/api/parties/join`) 5/min; everything else 40/min. Client key: `x-real-ip` → first `x-forwarded-for` → `req.ip`. Tunables: `RATE_LIMIT_ERROR_MAX`, `RATE_LIMIT_AUTH_FAIL_MAX`, `RATE_LIMIT_WINDOW_MS`. **Gotcha**: register it by calling `errorRateLimit(app)` directly in `server.ts` — wrapping it in `app.register(...)` creates an encapsulated plugin scope where its onRequest/onResponse hooks never fire (silent no-op).

### Combat tracker UI
- **Desktop (lg+)**: `CombatWidget` is a left-edge mini drawer — collapsed = vertical tab pinned mid-left; expanded = `w-72` drawer with `drawer-enter` slide-in. The centering `translate-y-1/2` lives on an OUTER wrapper; the animated card is INNER, so the slide animation never fights the transform
- **Mobile**: combat status is an always-visible card docked above the floating dock pill. On "your turn", the FULL dock pill gets `combat-turn-glow` (pulsing red box-shadow) — not just the hub button
- **Turn slash**: shared `components/TurnSlash.tsx` — `useTurnSlash(isMyTurn)` returns a boolean that goes true for ~1.4 s ONLY on the transition into your turn (never replays on collapse/expand); `<TurnSlash active />` renders the overlay. The `combat-slash-double` keyframe plays forehand AND backhand in one 1.15 s pass (not alternating per round); reduced-motion gets a static ring
- **Navigation**: combat tracker header has a "Ma fiche" action (via `useHeaderOverride`'s 3rd arg — memoize the action object, it's in the effect deps); combatant names link to character sheets when the combatant maps to a party character (view permission = party membership); `/party/:id/combat?enc=ID` deep-links straight into an encounter; the widget's "Voir le combat" uses that link
- **Multi-add**: `POST /api/encounters/:id/combatants/player` accepts `characterIds[]` (legacy single `characterId` still works), batch-inserted in one transaction; `AddPlayerModal` multi-selects with "Tout sélectionner"

### Rules engine coverage (SRD 5e, all in shared)
- AC: armor table with true light/medium/heavy types, DEX caps, shields, magic armor base resolution (`Armure (…)` description headers), class unarmored defense (Barbare 10+DEX+CON shield-ok, Moine 10+DEX+SAG shieldless), Défense fighting style
- Attacks: finesse/thrown/ranged/monk-DEX ability pick, weapon proficiency by class (editable `weapon_proficiencies`, null = class default), magic weapon base resolution + bonus, versatile 2h dice, martial arts die on monk weapons & unarmed (d4→d10), fighting styles (Archérie, Duel, Défense), sneak attack (Roublard), extra attacks (×2/3/4), non-proficient ⚠
- Speed: Moine unarmored movement (3→9 m), Barbare fast movement, heavy-armor STR-min penalty (−3 m), encumbrance
- Spells: slot tables (full/half/pact/artificier), cantrips/rituals/upcasting with scaled damage preview, concentration (single instance, CON save DD 10/½ dmg on damage, broken by incapacitating conditions & 0 PV), always-prepared domain/circle/oath spells (cleric `divine_domain`, druid `land_circle` under cercle Terre, paladin `sacred_oath`)
- Wild shape: CR gates by level (Lune: lvl/3 min 1), fly/swim gates, seen-beast list, 2 uses/short rest, rolled shape HP, elementals for Lune 10, combat-tracker integration
- Survival: variant encumbrance, food/water deprivation, exhaustion 1–6, death saves, 16 conditions (synced sheet↔tracker with durations), hit dice counter, inspiration

### API routes (`apps/api/src/routes/`)
auth, characters (incl. HP/concentration/condition sync side-effects), inventory, items, spells (incl. `/light`), monsters, character-spells, character-features, character-notes, locations, npcs, parties, combat (encounters, combatants, multi-add players, initiative, next-turn with condition expiry), domain-spells, wildshape. Shared helpers in `helpers.ts` (mappers, party checks, condition/HP mirrors). Rate limiting is a global hook in `rateLimit.ts`, not per-route config.

### Web character sheet (9 tabs, class-aware)
- Mobile: **floating dock** (Survie · Caract. — hub — Sorts/… adaptive per class: non-casters get Traits in the dock, Sorts in the hub) with sliding pill indicator + expanding hub grid + docked combat status card; desktop ≥lg keeps the top bar + left-edge combat drawer
- Tabs: Inventaire, Survie (attacks, HP, hit dice, forme sauvage, inspiration/concentration, exhaustion, conditions), Caractéristiques (subclasses: cercle druidique + terrain, domaine divin, serment sacré, style de combat, maîtrise d'armes), Compétences (2-col), Sorts (slot tracker, cast sheet with upcast damage preview + 🌀 concentration flow, ◆ always-prepared rows merged in, swipe-to-reveal oublier), Traits, Description, PNJ, Notes
- Player combat widget (own sheet only, live initiative prompt), ConcentrationAlert banner, GmDashboard, full CombatPage for the MD
- Weapon/armor rows show computed chips (🎯 attack breakdown tooltip, ⚔ damage, ✨ magic, ×N extra attacks, ⚠ non qualifié)

### Testing workflow
- Unit-ish: `npm run test-weapon-stats` / `test-armor-stats` (tsx, exit non-zero on failure) — extend these when adding rules
- **Typecheck/build gates**: web `tsc -b` has an 11-error known baseline (compare the error signature before/after changes); `vite build` in `apps/web` is the real build gate; API smoke test = `PORT=4597 npx tsx src/server.ts` + curl `/api/health`
- **E2E with state changes → isolated stack**: `API_PORT=4099 WEB_PORT=8099 docker compose -p dnd-e2e up -d --build` (own DB volume, tear down after). The MAIN stack on 8080/4010 holds the user's real campaign data — treat it read-only unless explicitly told otherwise
- Read-only E2E on the main instance: navigation/screenshot verification; login `wfix3`/`test123` works on the Docker DB (the dev-server DB differs)
- GUI testing: browser-use skills (bootstrap via `ZCODE_PLUGIN_ROOT` → `browser-client.mjs`), screenshots land in `gui-test-screenshots/` (gitignored); verify via screenshot + DOM cross-check, not DOM alone
- CI (GitHub Actions) builds & pushes `ghcr.io/wazoakarapace/dnd-inventory-{api,web}:latest` on main; prod runs `docker-compose.prod.yml` — remind the user to `pull && up -d` after pushes that touch the tablet-facing build (the PWA caches: changes need a force-refresh / app restart; manifest is `orientation: any`)
- Commits: the user asks for "commit and push" at milestones; mixed-file changes can be split with hunk-level staging (python `git diff` split + `git apply --cached`)

### Agent-environment gotchas (this machine)
- zsh does NOT word-split unquoted variables — `$FILES` passes as ONE argument (ENAMETOOLONG). Use `find … -exec cmd {} +` or explicit lists
- The shell cwd resets between tool calls — always `cd` first; the repo sits inside a space-containing parent folder (the campaign workspace), while the project folder itself is plain `dnd-inventory`, and this AGENTS.md is committed at the repo root
- `typescript@7` has no JS API (see above); throwaway AST tooling should install `typescript@5` standalone (e.g. `/tmp/ts5`) and require it by absolute path
