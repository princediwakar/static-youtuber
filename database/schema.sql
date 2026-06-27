-- ai-slideshow schema
-- Run against the existing Neon DB (accounts table already exists)

-- Job state tracker for each video generation run
CREATE TABLE IF NOT EXISTS slideshow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'psychology',
  format_template VARCHAR(20),   -- RAPID_FIRE | SLOW_BURN | THE_LIST
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | generating | images_done | tts_done | assembled | uploaded | failed
  inngest_run_id TEXT,
  "imageBatchName" TEXT,
  "audioBatchName" TEXT,
  script JSONB,             -- Full SlideshowScript output
  shot_image_urls JSONB,    -- Array of Cloudinary URLs for shot images
  shot_audio_urls JSONB,    -- Array of Cloudinary URLs for TTS clips
  video_url TEXT,           -- Cloudinary URL for assembled MP4
  thumbnail_url TEXT,       -- Cloudinary URL for YouTube thumbnail
  youtube_video_id TEXT,    -- Set after successful YouTube upload
  error_message TEXT,
  variant VARCHAR(10),       -- A/B testing tag: e.g. 'A', 'B', 'control'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS slideshow_jobs_status_idx ON slideshow_jobs(status);
CREATE INDEX IF NOT EXISTS slideshow_jobs_account_idx ON slideshow_jobs(account_id);
CREATE INDEX IF NOT EXISTS slideshow_jobs_created_idx ON slideshow_jobs(created_at DESC);

-- Topic pool with atomic deduplication, scoped per account
CREATE TABLE IF NOT EXISTS slideshow_topics (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'psychology',
  account_id TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  youtube_id TEXT,
  aesthetic_id TEXT,
  format TEXT,
  quality_score FLOAT DEFAULT 0,
  views INTEGER DEFAULT 0,
  avg_view_duration_pct FLOAT DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  traffic_search_pct FLOAT DEFAULT 0,
  traffic_feed_pct FLOAT DEFAULT 0,
  analytics_synced_at TIMESTAMPTZ,
  UNIQUE(topic, account_id)
);

CREATE INDEX IF NOT EXISTS slideshow_topics_account_niche_used_idx ON slideshow_topics(account_id, niche, used);
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_niche_views ON slideshow_topics (niche, views DESC) WHERE youtube_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_sync ON slideshow_topics (analytics_synced_at) WHERE youtube_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slideshow_topics_impressions ON slideshow_topics (impressions DESC) WHERE youtube_id IS NOT NULL AND impressions > 0;

-- YouTube upload records
CREATE TABLE IF NOT EXISTS slideshow_uploads (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES slideshow_jobs(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  tags JSONB,
  variant VARCHAR(10),       -- A/B testing tag for analytics
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Auto-update updated_at on slideshow_jobs
CREATE OR REPLACE FUNCTION update_slideshow_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_slideshow_jobs_updated_at ON slideshow_jobs;
CREATE TRIGGER set_slideshow_jobs_updated_at
  BEFORE UPDATE ON slideshow_jobs
  FOR EACH ROW EXECUTE FUNCTION update_slideshow_jobs_updated_at();
