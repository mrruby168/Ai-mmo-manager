import type { DatabaseSync } from 'node:sqlite'

const SCHEMA_V1 = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('event_mmo','airdrop')),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  domain_key TEXT,
  website TEXT,
  socials_json TEXT NOT NULL DEFAULT '{}',
  task_summary TEXT NOT NULL DEFAULT '',
  how_to_join TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  cost_type TEXT NOT NULL DEFAULT 'unverified' CHECK(cost_type IN ('free','paid','unverified')),
  cost_amount_usd REAL,
  status TEXT NOT NULL DEFAULT 'not_joined' CHECK(status IN ('not_joined','in_progress','completed')),
  verification TEXT NOT NULL DEFAULT 'unverified' CHECK(verification IN ('verified','unverified')),
  sources_json TEXT NOT NULL DEFAULT '[]',
  logo_path TEXT,
  notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL CHECK(origin IN ('manual','scan','chat','import')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(category, name_key)
);

CREATE INDEX idx_projects_category_status ON projects(category, status);
CREATE INDEX idx_projects_category_end ON projects(category, end_date);
CREATE INDEX idx_projects_domain ON projects(domain_key);

CREATE TABLE revenue_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_name_snapshot TEXT NOT NULL,
  reward_kind TEXT NOT NULL CHECK(reward_kind IN ('cash','token','points')),
  reward_symbol TEXT NOT NULL,
  estimated_amount REAL,
  estimated_usd REAL,
  received_amount REAL,
  received_usd REAL,
  received_at TEXT,
  claim_status TEXT NOT NULL DEFAULT 'pending' CHECK(claim_status IN ('pending','claimable','claimed')),
  participation_cost_usd REAL NOT NULL DEFAULT 0,
  tx_fee_usd REAL NOT NULL DEFAULT 0,
  tx_hash TEXT,
  evidence_note TEXT,
  evidence_file TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_revenue_project ON revenue_entries(project_id);

CREATE TABLE news_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('important','todo')),
  summary TEXT NOT NULL,
  verification TEXT NOT NULL CHECK(verification IN ('verified','unverified')),
  source_url TEXT NOT NULL,
  source_name TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  todo_deadline TEXT,
  is_done INTEGER NOT NULL DEFAULT 0,
  dedupe_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_news_project_kind ON news_items(project_id, kind);

CREATE TABLE scan_latest (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`

export function runMigrations(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get()
  const currentVersion = row ? Number(row.user_version) : 0
  if (currentVersion >= 1) {
    return
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(SCHEMA_V1)
    database.exec('PRAGMA user_version = 1')
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
