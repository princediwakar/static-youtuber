-- Migration: add analytics and attribution columns to slideshow_topics
-- Run once: psql $DATABASE_URL -f migrations/001_add_analytics_columns.sql

ALTER TABLE slideshow_topics
  ADD COLUMN IF NOT EXISTS youtube_id        TEXT,
  ADD COLUMN IF NOT EXISTS views             INTEGER    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_view_duration_pct FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr               FLOAT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aesthetic_id      TEXT,
  ADD COLUMN IF NOT EXISTS format            TEXT,
  ADD COLUMN IF NOT EXISTS quality_score     FLOAT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analytics_synced_at TIMESTAMPTZ;

-- Index for efficient analytics queries per niche
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_niche_views
  ON slideshow_topics (niche, views DESC)
  WHERE youtube_id IS NOT NULL;

-- Index for finding unsynced videos
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_sync
  ON slideshow_topics (analytics_synced_at)
  WHERE youtube_id IS NOT NULL;
