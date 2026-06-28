-- Migration 008: Add research_context to topics table
-- Required by the two-pass script generation engine (Pass 1: Narrative uses this as ground truth)
ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS research_context TEXT;
