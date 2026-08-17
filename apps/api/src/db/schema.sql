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

-- GM bans: the door is locked against the invite code for these users.
CREATE TABLE IF NOT EXISTS party_bans (
  party_id  INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (party_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_party_bans_user ON party_bans(user_id);

CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id    INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  strength    INTEGER NOT NULL DEFAULT 10 CHECK (strength >= 1),
  capacity_multiplier REAL NOT NULL DEFAULT 1.0 CHECK (capacity_multiplier > 0),
  exhaustion  INTEGER NOT NULL DEFAULT 0 CHECK (exhaustion >= 0 AND exhaustion <= 6),
  conditions  TEXT NOT NULL DEFAULT '[]',
  food_days   INTEGER NOT NULL DEFAULT 0,
  water_days  INTEGER NOT NULL DEFAULT 0,
  max_hp      INTEGER NOT NULL DEFAULT 1 CHECK (max_hp >= 1),
  current_hp  INTEGER NOT NULL DEFAULT 1,
  temp_hp     INTEGER NOT NULL DEFAULT 0,
  -- Character sheet: ability scores, class/race/level, skills, spells
  level               INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 20),
  dexterity           INTEGER NOT NULL DEFAULT 10,
  constitution        INTEGER NOT NULL DEFAULT 10,
  intelligence        INTEGER NOT NULL DEFAULT 10,
  wisdom              INTEGER NOT NULL DEFAULT 10,
  charisma            INTEGER NOT NULL DEFAULT 10,
  character_class     TEXT,
  race                TEXT,
  background          TEXT,
  speed               INTEGER NOT NULL DEFAULT 9,  -- meters (9m = 30ft)
  skill_proficiencies         TEXT NOT NULL DEFAULT '[]',  -- JSON array of skill keys
  saving_throw_proficiencies  TEXT NOT NULL DEFAULT '[]',  -- JSON array of ability keys
  spell_slots_used            TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0]',  -- JSON: used per level 1-9
  -- Description / personality
  alignment           TEXT,   -- "Loyal Bon"
  sex                 TEXT,   -- "M" / "F"
  height              TEXT,   -- "1,80 m" (freeform, metric)
  weight              TEXT,   -- "80 kg" (freeform, metric)
  age                 TEXT,   -- "125 ans"
  skin                TEXT,
  eyes                TEXT,
  hair                TEXT,
  portrait_url        TEXT,   -- base64 data URL
  personality_traits  TEXT,
  ideals              TEXT,
  bonds               TEXT,
  flaws               TEXT,
  appearance          TEXT,
  armor_class_override INTEGER,  -- null = computed from equipped armor, number = manual
  death_save_successes INTEGER NOT NULL DEFAULT 0,  -- 0-3
  death_save_failures  INTEGER NOT NULL DEFAULT 0,  -- 0-3
  inspiration INTEGER NOT NULL DEFAULT 0,  -- 0 or 1
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
  survival_tags        TEXT NOT NULL DEFAULT '[]',  -- JSON: ["food"] / ["water"] / ["food","water"]
  aliases              TEXT,                        -- JSON array of alternative search names
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

CREATE TABLE IF NOT EXISTS npcs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id      INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  location      TEXT,
  faction       TEXT,
  disposition   TEXT NOT NULL DEFAULT 'neutral',
  status        TEXT NOT NULL DEFAULT 'alive',
  description   TEXT,
  secret        TEXT,
  is_shared     INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_npcs_party ON npcs(party_id);
CREATE INDEX IF NOT EXISTS idx_npcs_shared ON npcs(party_id, is_shared);

-- ---------- SRD Spell catalog (reference data, seeded) ----------

CREATE TABLE IF NOT EXISTS spells (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  srd_index       TEXT NOT NULL UNIQUE,   -- "acid-arrow", "fireball"
  name            TEXT NOT NULL,           -- English name
  name_fr         TEXT,                    -- French name from AideDD
  level           INTEGER NOT NULL,        -- 0-9 (0 = cantrip / tour de magie)
  school          TEXT NOT NULL,           -- lowercase: abjuration, conjuration, etc.
  casting_time    TEXT,
  range_text      TEXT,
  components      TEXT NOT NULL DEFAULT '[]',  -- JSON: ["V","S","M"]
  material        TEXT,
  duration        TEXT,
  concentration   INTEGER NOT NULL DEFAULT 0,
  ritual          INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  description_fr  TEXT,                    -- French description from AideDD
  higher_level    TEXT,
  higher_level_fr TEXT,
  attack_type     TEXT,                     -- "ranged"/"melee" or NULL
  damage_json     TEXT,                     -- JSON: {type, atSlotLevel:{...}}
  dc_json         TEXT,                     -- JSON: {type, success: "half"/"none"}
  classes_json    TEXT NOT NULL DEFAULT '[]', -- JSON: ["Magicien","Ensorceleur"] (French class names)
  sort_order      INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_spells_level ON spells(level);
CREATE INDEX IF NOT EXISTS idx_spells_name ON spells(name);
CREATE INDEX IF NOT EXISTS idx_spells_name_fr ON spells(name_fr);

-- ---------- Character ↔ Spell (known/prepared spells) ----------

CREATE TABLE IF NOT EXISTS character_spells (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spell_id      INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
  prepared      INTEGER NOT NULL DEFAULT 0,  -- 1 = prepared/ready, 0 = known but not prepared
  sort_order    INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(character_id, spell_id)
);
CREATE INDEX IF NOT EXISTS idx_character_spells_char ON character_spells(character_id);
CREATE INDEX IF NOT EXISTS idx_character_spells_spell ON character_spells(spell_id);

-- ---------- Character features (free-form traits, class/racial/background/feat) ----------

CREATE TABLE IF NOT EXISTS character_features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'custom',  -- class/racial/background/feat/custom
  description   TEXT,                             -- template text with {{variables}}
  counter_max      INTEGER,                       -- null/0 = no counter; positive = max charges
  counter_current  INTEGER,                       -- current charge count
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_character_features_char ON character_features(character_id);

-- ---------- Character notes (free-form with simple formatting) ----------

CREATE TABLE IF NOT EXISTS character_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT,                -- Markdown-like plain text
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_character_notes_char ON character_notes(character_id);

-- ---------- SRD Monster catalog (reference data, seeded from 5e-drs.fr) ----------

CREATE TABLE IF NOT EXISTS monsters (
  slug              TEXT PRIMARY KEY,
  name_fr           TEXT NOT NULL,
  type              TEXT,
  subtype           TEXT,
  size              TEXT,
  alignment         TEXT,
  armor_class       INTEGER,
  armor_desc        TEXT,
  hit_points        INTEGER,
  hit_dice          TEXT,
  speed_json        TEXT,             -- JSON: {"walk":9,"fly":18}
  abilities_json    TEXT,             -- JSON: {"for":8,"dex":14,...}
  saving_throws_json TEXT,            -- JSON: ["con","int"]
  skills_json       TEXT,             -- JSON: [{"name":"discretion","isExpert":true}]
  languages_json    TEXT,             -- JSON: ["commun","gobelin"]
  challenge_rating  REAL,
  xp                INTEGER,
  senses            TEXT,
  telepathy         INTEGER,
  damage_resistances_json TEXT,
  damage_immunities_json TEXT,
  condition_immunities_json TEXT,
  traits_json       TEXT,             -- JSON: [{name,desc,...}]
  actions_json      TEXT,             -- JSON: [{name,desc,attackBonus?,damageDice?,...}]
  legendary_actions_json TEXT,
  source            TEXT
);
CREATE INDEX IF NOT EXISTS idx_monsters_name_fr ON monsters(name_fr);
CREATE INDEX IF NOT EXISTS idx_monsters_type ON monsters(type);
CREATE INDEX IF NOT EXISTS idx_monsters_cr ON monsters(challenge_rating);

-- ---------- Combat encounters (initiative tracker, party-scoped) ----------

CREATE TABLE IF NOT EXISTS encounters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id   INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  round      INTEGER NOT NULL DEFAULT 0,        -- 0 = setup, >=1 = in combat
  turn_index INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','ended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_encounters_party ON encounters(party_id);

CREATE TABLE IF NOT EXISTS combatants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id    INTEGER NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('player','monster')),
  character_id    INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  monster_slug    TEXT,
  name            TEXT NOT NULL,
  count           INTEGER NOT NULL DEFAULT 1,
  group_id        INTEGER,                       -- shared by grouped monsters (same initiative)
  initiative      INTEGER,                       -- NULL = not yet rolled
  initiative_bonus INTEGER NOT NULL DEFAULT 0,   -- dex mod cached at add time
  armor_class     INTEGER NOT NULL DEFAULT 10,
  hit_points      INTEGER NOT NULL DEFAULT 1,
  max_hit_points  INTEGER NOT NULL DEFAULT 1,
  conditions      TEXT NOT NULL DEFAULT '[]',    -- JSON: [{name,duration}]
  sort_order      INTEGER NOT NULL DEFAULT 0,
  defeated        INTEGER NOT NULL DEFAULT 0,
  card_color      TEXT,                           -- hex color for card background, NULL = default
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_combatants_encounter ON combatants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_combatants_character ON combatants(character_id);
