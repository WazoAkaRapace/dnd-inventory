-- D&D Inventory — SQLite schema
-- All weights stored in KILOGRAMS (weight_kg columns).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parties (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  gm_user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code      TEXT NOT NULL UNIQUE,
  encumbrance_mode TEXT NOT NULL DEFAULT 'variant'
                    CHECK (encumbrance_mode IN ('variant','standard','slots')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id  INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('gm','player')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (party_id, user_id)
);

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id    INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  strength    INTEGER NOT NULL DEFAULT 10 CHECK (strength >= 1),
  capacity_multiplier REAL NOT NULL DEFAULT 1.0 CHECK (capacity_multiplier > 0),
  notes       TEXT,
  copper      INTEGER NOT NULL DEFAULT 0,
  silver      INTEGER NOT NULL DEFAULT 0,
  electrum    INTEGER NOT NULL DEFAULT 0,
  gold        INTEGER NOT NULL DEFAULT 0,
  platinum    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source               TEXT NOT NULL DEFAULT 'srd' CHECK (source IN ('srd','custom')),
  party_id             INTEGER REFERENCES parties(id) ON DELETE CASCADE, -- NULL for global/SRD
  category             TEXT NOT NULL,
  srd_index            TEXT,                 -- original SRD index for dedup
  name                 TEXT NOT NULL,
  name_fr              TEXT,
  rarity               TEXT NOT NULL DEFAULT 'none',
  weight_kg            REAL,                  -- KILOGRAMS; NULL if unknown
  cost_qty             INTEGER,
  cost_unit            TEXT,
  description          TEXT,
  damage_dice          TEXT,
  damage_type          TEXT,
  ac_base              INTEGER,
  str_min              INTEGER,
  stealth_disadvantage INTEGER NOT NULL DEFAULT 0,
  properties_json      TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  image_path           TEXT,
  UNIQUE(srd_index)
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_party ON items(party_id);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

CREATE TABLE IF NOT EXISTS storage_locations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'carried' CHECK (type IN ('carried','mount','container')),
  strength        INTEGER DEFAULT 10,        -- for mounts: their Strength score
  multiplier      REAL NOT NULL DEFAULT 1.0, -- Beast of Burden = 2, pulling cart = 5
  capacity_kg     REAL,                      -- fixed capacity for containers (Bag of Holding = 227)
  own_weight_kg   REAL NOT NULL DEFAULT 0,   -- container's own weight on the carrier
  item_id         INTEGER REFERENCES items(id) ON DELETE SET NULL, -- link to catalog item
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_storage_locations_character ON storage_locations(character_id);

CREATE TABLE IF NOT EXISTS inventory (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id              INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity             INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  equipped             INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  storage_location_id  INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,
  added_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(character_id, item_id, storage_location_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_character ON inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(storage_location_id);

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id      INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  character_id  INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  item_id       INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_name     TEXT NOT NULL,           -- snapshot in case item is deleted
  delta_qty     INTEGER NOT NULL,
  reason        TEXT NOT NULL DEFAULT 'adjust',
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions(party_id);
