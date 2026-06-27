-- Migration 005: format_template and shot columns
-- Replaces the old 'format' column with format_template.
-- Renames slide_*_urls to shot_*_urls for consistency with Shot schema.

-- Add format_template column
ALTER TABLE slideshow_jobs ADD COLUMN IF NOT EXISTS format_template VARCHAR(20);

-- Rename slide_image_urls → shot_image_urls
ALTER TABLE slideshow_jobs RENAME COLUMN slide_image_urls TO shot_image_urls;

-- Rename slide_audio_urls → shot_audio_urls
ALTER TABLE slideshow_jobs RENAME COLUMN slide_audio_urls TO shot_audio_urls;

-- Drop old format column (if it exists and is no longer needed)
-- Kept commented — run manually after verifying no consumers read it:
-- ALTER TABLE slideshow_jobs DROP COLUMN IF EXISTS format;
