-- ai-slideshow schema
-- Run against the existing Neon DB (accounts table already exists)

-- Job state tracker for each video generation run
CREATE TABLE IF NOT EXISTS slideshow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'psychology',
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | generating | images_done | tts_done | assembled | uploaded | failed
  inngest_run_id TEXT,
  script JSONB,             -- Full DeepSeek SlideshowScript output
  slide_image_urls JSONB,   -- Array of Cloudinary URLs for slide images
  slide_audio_urls JSONB,   -- Array of Cloudinary URLs for TTS WAV clips
  video_url TEXT,           -- Cloudinary URL for assembled MP4
  thumbnail_url TEXT,       -- Cloudinary URL for YouTube thumbnail
  youtube_video_id TEXT,    -- Set after successful YouTube upload
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS slideshow_jobs_status_idx ON slideshow_jobs(status);
CREATE INDEX IF NOT EXISTS slideshow_jobs_account_idx ON slideshow_jobs(account_id);
CREATE INDEX IF NOT EXISTS slideshow_jobs_created_idx ON slideshow_jobs(created_at DESC);

-- Topic pool with atomic deduplication
CREATE TABLE IF NOT EXISTS slideshow_topics (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  niche TEXT NOT NULL DEFAULT 'psychology',
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS slideshow_topics_niche_used_idx ON slideshow_topics(niche, used);

-- YouTube upload records
CREATE TABLE IF NOT EXISTS slideshow_uploads (
  id SERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES slideshow_jobs(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  tags JSONB,
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
