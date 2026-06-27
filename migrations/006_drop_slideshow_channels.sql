-- Migration 006: Drop slideshow_channels table
-- Redundant — niche is derived from ACCOUNT_NICHE in code, enabled status from accounts.status

DROP TABLE IF EXISTS slideshow_channels;
