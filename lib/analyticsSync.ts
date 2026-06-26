/**
 * analyticsSync.ts
 *
 * The feedback loop that was previously missing from the pipeline.
 *
 * Polls YouTube Analytics (via the Data API v3) for published videos,
 * stores performance metrics in the database, and exposes helper functions
 * that other parts of the pipeline can use to make data-driven decisions:
 * - Which aesthetics perform best per niche
 * - Which formats (story/facts/quiz) retain viewers longest
 * - Which topics underperformed (so we can deprioritise similar ones)
 *
 * Run this as a cron job (e.g. daily) separately from the generation pipeline.
 *
 * DB schema assumed (add migration for these columns):
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS youtube_id TEXT;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS avg_view_duration_pct FLOAT DEFAULT 0;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS ctr FLOAT DEFAULT 0;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS aesthetic_id TEXT;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS format TEXT;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 0;
 *   ALTER TABLE slideshow_topics ADD COLUMN IF NOT EXISTS analytics_synced_at TIMESTAMPTZ;
 */

import { google, youtube_v3 } from 'googleapis';
import { query } from './database';

// ─── YouTube API client ───────────────────────────────────────────────────────
// Requires YOUTUBE_API_KEY or OAuth credentials in env
function getYouTubeClient() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set');
  return google.youtube({ version: 'v3', auth: apiKey });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoMetrics = {
  youtubeId: string;
  views: number;
  avgViewDurationPct: number; // 0–100, from YouTube Analytics
  ctr: number;                // click-through rate from impressions
};

// ─── Sync published videos ────────────────────────────────────────────────────

/**
 * Fetches metrics for all published videos that have a youtube_id stored
 * but haven't been synced in the last 24 hours.
 */
export async function syncAnalytics(): Promise<void> {
  const yt = getYouTubeClient();

  // Get all videos that need syncing
  const toSync = await query<{ topic_id: number; youtube_id: string }>(`
    SELECT id AS topic_id, youtube_id
    FROM slideshow_topics
    WHERE youtube_id IS NOT NULL
      AND (analytics_synced_at IS NULL OR analytics_synced_at < NOW() - INTERVAL '24 hours')
    ORDER BY used_at DESC
    LIMIT 50
  `);

  if (toSync.rows.length === 0) {
    console.log('[Analytics] Nothing to sync');
    return;
  }

  const videoIds = toSync.rows.map(r => r.youtube_id);
  console.log(`[Analytics] Syncing ${videoIds.length} videos...`);

  // Batch fetch statistics from YouTube Data API
  const statsResponse = await yt.videos.list({
    part: ['statistics', 'contentDetails'],
    id: videoIds,
    maxResults: 50,
  });

  const statsMap = new Map<string, youtube_v3.Schema$Video>();
  for (const item of statsResponse.data.items ?? []) {
    if (item.id) statsMap.set(item.id, item);
  }

  // Update each video's metrics
  for (const row of toSync.rows) {
    const stats = statsMap.get(row.youtube_id);
    if (!stats) {
      console.warn(`[Analytics] No stats found for ${row.youtube_id}`);
      continue;
    }

    const views = parseInt(stats.statistics?.viewCount ?? '0', 10);

    // YouTube Data API v3 doesn't expose avg_view_duration or CTR directly —
    // those require the YouTube Analytics API (OAuth).
    // For now we store views from Data API; CTR/retention require OAuth setup.
    // Set avg_view_duration_pct = 0 as placeholder until OAuth is configured.
    const avgViewDurationPct = 0;
    const ctr = 0;

    await query(`
      UPDATE slideshow_topics
      SET
        views = $1,
        avg_view_duration_pct = $2,
        ctr = $3,
        analytics_synced_at = NOW()
      WHERE id = $4
    `, [views, avgViewDurationPct, ctr, row.topic_id]);

    console.log(`[Analytics] ${row.youtube_id}: ${views} views`);
  }

  console.log('[Analytics] Sync complete');
}

// ─── Performance reporting ─────────────────────────────────────────────────────

type NichePerformanceReport = {
  niche: string;
  totalVideos: number;
  avgViews: number;
  bestAesthetic: string | null;
  bestFormat: string | null;
  topTopics: Array<{ topic: string; views: number }>;
  worstTopics: Array<{ topic: string; views: number }>;
};

/**
 * Returns a performance summary for a niche.
 * Use this to inform topic generation (e.g. generate more topics like the top performers).
 */
export async function getNichePerformance(niche: string): Promise<NichePerformanceReport> {
  const [totals, byAesthetic, byFormat, top, worst] = await Promise.all([
    query<{ count: string; avg_views: string }>(`
      SELECT COUNT(*) AS count, AVG(views) AS avg_views
      FROM slideshow_topics
      WHERE niche = $1 AND youtube_id IS NOT NULL AND views > 0
    `, [niche]),

    query<{ aesthetic_id: string; avg_views: string }>(`
      SELECT aesthetic_id, AVG(views) AS avg_views
      FROM slideshow_topics
      WHERE niche = $1 AND aesthetic_id IS NOT NULL AND views > 0
      GROUP BY aesthetic_id
      ORDER BY avg_views DESC
      LIMIT 1
    `, [niche]),

    query<{ format: string; avg_views: string }>(`
      SELECT format, AVG(views) AS avg_views
      FROM slideshow_topics
      WHERE niche = $1 AND format IS NOT NULL AND views > 0
      GROUP BY format
      ORDER BY avg_views DESC
      LIMIT 1
    `, [niche]),

    query<{ topic: string; views: number }>(`
      SELECT topic, views
      FROM slideshow_topics
      WHERE niche = $1 AND views > 0
      ORDER BY views DESC
      LIMIT 5
    `, [niche]),

    query<{ topic: string; views: number }>(`
      SELECT topic, views
      FROM slideshow_topics
      WHERE niche = $1 AND views > 0
      ORDER BY views ASC
      LIMIT 5
    `, [niche]),
  ]);

  return {
    niche,
    totalVideos: parseInt(totals.rows[0]?.count ?? '0', 10),
    avgViews: parseFloat(totals.rows[0]?.avg_views ?? '0'),
    bestAesthetic: byAesthetic.rows[0]?.aesthetic_id ?? null,
    bestFormat: byFormat.rows[0]?.format ?? null,
    topTopics: top.rows,
    worstTopics: worst.rows,
  };
}

/**
 * Stores youtube_id, aesthetic_id, format, and quality_score at publish time.
 * Call this from your publish step so analytics can be attributed correctly.
 */
export async function recordPublishedVideo(params: {
  topicId: number;
  youtubeId: string;
  aestheticId: string;
  format: string;
  qualityScore: number;
}): Promise<void> {
  await query(`
    UPDATE slideshow_topics
    SET
      youtube_id = $1,
      aesthetic_id = $2,
      format = $3,
      quality_score = $4
    WHERE id = $5
  `, [params.youtubeId, params.aestheticId, params.format, params.qualityScore, params.topicId]);

  console.log(`[Analytics] Recorded publish: ${params.youtubeId} (${params.format}, ${params.aestheticId})`);
}