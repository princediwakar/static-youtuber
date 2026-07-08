-- Migration 010: add content_type to slideshow_jobs
-- Distinguishes 'shorts' (portrait, 1080×1920) from 'long' (landscape, 1920×1080).
-- Existing rows default to 'shorts' — no backfill needed.

ALTER TABLE slideshow_jobs
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'shorts';

-- Index for the scheduler's 48h throttle query per account+type.
CREATE INDEX IF NOT EXISTS idx_slideshow_jobs_account_content_type
  ON slideshow_jobs (account_id, content_type, created_at DESC);
