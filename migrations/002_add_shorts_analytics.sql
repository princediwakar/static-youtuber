-- Migration 003: Add Shorts-specific analytics columns for swipe rate and search traffic
-- Run once: psql $DATABASE_URL -f migrations/003_add_shorts_analytics.sql

ALTER TABLE slideshow_topics
  ADD COLUMN IF NOT EXISTS impressions         INTEGER    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS traffic_search_pct  FLOAT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS traffic_feed_pct    FLOAT      DEFAULT 0;

-- Index for finding videos with good swipe-rate (high viewed %) for optimization insights
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_impressions
  ON slideshow_topics (impressions DESC)
  WHERE youtube_id IS NOT NULL AND impressions > 0;
