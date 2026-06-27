-- Migration 003: Combinatorial Reach Matrix
-- Two-axis engine: subject × angle = targeted 60-second script
-- Each axis is scoped per (account_id, niche) for fast random lookups.

CREATE TABLE IF NOT EXISTS matrix_subjects (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  niche TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matrix_angles (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  niche TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS matrix_subjects_account_niche_idx ON matrix_subjects(account_id, niche);
CREATE INDEX IF NOT EXISTS matrix_angles_account_niche_idx ON matrix_angles(account_id, niche);
