/**
 * analyticsSync.ts
 *
 * Polls YouTube Analytics API (OAuth) for per-video Shorts metrics:
 *   - Viewed % (views / impressions = 1 - swipe-away rate)
 *   - Average view duration % (how much of the Short is watched)
 *   - Search vs. Feed traffic split
 *
 * Falls back to YouTube Data API v3 (API key) for basic view counts
 * if the OAuth token lacks yt-analytics.readonly scope.
 */

import { google, youtube_v3, youtubeAnalytics_v2 } from 'googleapis';
import { query } from './database';
import { getAccountCredentials } from './accountService';
import { AccountCredentials } from './types';

// ─── YouTube Analytics API client (OAuth) ─────────────────────────────────────

function getAnalyticsClient(creds: AccountCredentials) {
  const oauth2 = new google.auth.OAuth2(
    creds.googleClientId,
    creds.googleClientSecret,
    process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
      : 'http://localhost:3000/api/auth/callback/google'
  );
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.youtubeAnalytics({ version: 'v2', auth: oauth2 });
}

function getYouTubeDataClient() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set');
  return google.youtube({ version: 'v3', auth: apiKey });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ShortsMetrics = {
  youtubeId: string;
  views: number;
  impressions: number;
  viewedPct: number;       // % who watched vs swiped away (views/impressions * 100)
  avgViewDurationPct: number; // % of video watched
  trafficSearchPct: number;
  trafficFeedPct: number;
};

// ─── Query YouTube Analytics API ──────────────────────────────────────────────

/**
 * Fetches Shorts performance metrics from the YouTube Analytics API.
 * Requires OAuth token with yt-analytics.readonly scope.
 * Returns null if the token lacks scope or the API call fails.
 */
async function fetchShortsMetrics(
  creds: AccountCredentials,
  videoIds: string[],
  channelId: string,
): Promise<Map<string, ShortsMetrics> | null> {
  const analytics = getAnalyticsClient(creds);

  // Dates: last 30 days
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  // ── Primary metrics: views, impressions, avgViewPercentage ──────────────────
  let primaryResult: youtubeAnalytics_v2.Schema$QueryResponse | null = null;
  try {
    const primaryResponse = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views,impressions,averageViewPercentage',
      dimensions: 'video',
      filters: videoIds.map(id => `video==${id}`).join(';'),
      maxResults: 50,
    });
    primaryResult = primaryResponse.data;
  } catch (err: any) {
    // Likely missing yt-analytics.readonly scope — fall back to Data API
    if (err.code === 403 || err.message?.includes('insufficientPermissions')) {
      console.warn('[Analytics] OAuth token missing yt-analytics.readonly scope. Falling back to Data API only.');
      console.warn('[Analytics] Re-auth with yt-analytics.readonly scope to enable swipe rate and AVD tracking.');
    } else {
      console.warn('[Analytics] Analytics API query failed:', err.message);
    }
    return null;
  }

  if (!primaryResult?.rows?.length) return new Map();

  // Parse primary metrics
  // Column order matches metrics order: views, impressions, averageViewPercentage
  const metricsMap = new Map<string, ShortsMetrics>();
  for (const row of primaryResult.rows) {
    const videoId = row[0] as string;
    metricsMap.set(videoId, {
      youtubeId: videoId,
      views: parseInt(String(row[1]), 10) || 0,
      impressions: parseInt(String(row[2]), 10) || 0,
      viewedPct: 0, // calculated below
      avgViewDurationPct: parseFloat(String(row[3])) || 0,
      trafficSearchPct: 0,
      trafficFeedPct: 0,
    });
  }

  // Calculate viewed % (inverse of swipe-away rate)
  for (const m of metricsMap.values()) {
    m.viewedPct = m.impressions > 0
      ? Math.round((m.views / m.impressions) * 1000) / 10
      : 0;
  }

  // ── Traffic source breakdown ─────────────────────────────────────────────────
  try {
    const trafficResponse = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'video,insightTrafficSourceType',
      filters: videoIds.map(id => `video==${id}`).join(';'),
      maxResults: 200,
    });

    if (trafficResponse.data?.rows) {
      // Aggregate per-video traffic source percentages
      const trafficByVideo = new Map<string, Map<string, number>>();
      for (const row of trafficResponse.data.rows) {
        const videoId = row[0] as string;
        const sourceType = row[1] as string;
        const viewsFromSource = parseInt(String(row[2]), 10) || 0;

        if (!trafficByVideo.has(videoId)) {
          trafficByVideo.set(videoId, new Map());
        }
        trafficByVideo.get(videoId)!.set(sourceType, viewsFromSource);
      }

      for (const [videoId, sources] of trafficByVideo) {
        const metric = metricsMap.get(videoId);
        if (!metric) continue;

        const totalTrafficViews = [...sources.values()].reduce((a, b) => a + b, 0);
        if (totalTrafficViews > 0) {
          // YouTube Analytics source types: YT_SEARCH, YT_WATCH_TAB (feed), etc.
          const searchViews = sources.get('YT_SEARCH') || 0;
          const feedViews =
            (sources.get('YT_WATCH_TAB') || 0) +
            (sources.get('YT_SHORTS_AGGREGATOR') || 0);

          metric.trafficSearchPct = Math.round((searchViews / totalTrafficViews) * 1000) / 10;
          metric.trafficFeedPct = Math.round((feedViews / totalTrafficViews) * 1000) / 10;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Analytics] Traffic source query failed:', err.message);
    // Non-fatal — primary metrics are still valid
  }

  return metricsMap;
}

// ─── Get channel ID ───────────────────────────────────────────────────────────

async function getChannelId(creds: AccountCredentials): Promise<string | null> {
  const oauth2 = new google.auth.OAuth2(
    creds.googleClientId,
    creds.googleClientSecret,
    process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
      : 'http://localhost:3000/api/auth/callback/google'
  );
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });

  try {
    const res = await yt.channels.list({ mine: true, part: ['id'] });
    return res.data.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Sync published videos ────────────────────────────────────────────────────

/**
 * Syncs analytics for all published videos that haven't been synced in 24 hours.
 * Uses YouTube Analytics API (OAuth) for full metrics when available;
 * falls back to Data API v3 (API key) for basic view counts.
 */
export async function syncAnalytics(accountId?: string): Promise<void> {
  // ── Phase 1: Data API fallback for all accounts (always works) ──────────────
  const yt = getYouTubeDataClient();

  let toSyncQuery = `
    SELECT id AS topic_id, youtube_id, account_id
    FROM slideshow_topics
    WHERE youtube_id IS NOT NULL
      AND (analytics_synced_at IS NULL OR analytics_synced_at < NOW() - INTERVAL '24 hours')
    ORDER BY used_at DESC
    LIMIT 50
  `;
  let toSyncParams: any[] = [];

  if (accountId) {
    toSyncQuery = `
      SELECT id AS topic_id, youtube_id, account_id
      FROM slideshow_topics
      WHERE youtube_id IS NOT NULL AND account_id = $1
        AND (analytics_synced_at IS NULL OR analytics_synced_at < NOW() - INTERVAL '24 hours')
      ORDER BY used_at DESC
      LIMIT 50
    `;
    toSyncParams = [accountId];
  }

  const toSync = await query<{ topic_id: number; youtube_id: string; account_id: string }>(toSyncQuery, toSyncParams);

  if (toSync.rows.length === 0) {
    console.log('[Analytics] Nothing to sync');
    return;
  }

  const videoIds = toSync.rows.map(r => r.youtube_id);
  console.log(`[Analytics] Syncing ${videoIds.length} videos...`);

  // ── Phase 2: Try Analytics API for enriched metrics ──────────────────────────
  // Use the first account's credentials — multi-account analytics needs per-account tokens
  const accountIds = [...new Set(toSync.rows.map(r => r.account_id))];
  let analyticsMetrics: Map<string, ShortsMetrics> = new Map();

  for (const aid of accountIds) {
    try {
      const creds = await getAccountCredentials(aid);
      const channelId = await getChannelId(creds);

      if (channelId) {
        const accountVideoIds = toSync.rows
          .filter(r => r.account_id === aid)
          .map(r => r.youtube_id);

        const metrics = await fetchShortsMetrics(creds, accountVideoIds, channelId);
        if (metrics) {
          for (const [vid, m] of metrics) {
            analyticsMetrics.set(vid, m);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Analytics] Skipping Analytics API for ${aid}: ${err.message}`);
    }
  }

  // ── Phase 3: Data API fallback for basic view counts ────────────────────────
  const statsResponse = await yt.videos.list({
    part: ['statistics'],
    id: videoIds,
    maxResults: 50,
  });

  const statsMap = new Map<string, youtube_v3.Schema$Video>();
  for (const item of statsResponse.data.items ?? []) {
    if (item.id) statsMap.set(item.id, item);
  }

  // ── Phase 4: Write to DB ────────────────────────────────────────────────────
  for (const row of toSync.rows) {
    const analytics = analyticsMetrics.get(row.youtube_id);
    const dataApiView = parseInt(
      statsMap.get(row.youtube_id)?.statistics?.viewCount ?? '0',
      10
    );

    // Prefer Analytics API data, fall back to Data API
    const views = analytics?.views ?? dataApiView;
    const impressions = analytics?.impressions ?? 0;
    const avgViewDurationPct = analytics?.avgViewDurationPct ?? 0;
    const trafficSearchPct = analytics?.trafficSearchPct ?? 0;
    const trafficFeedPct = analytics?.trafficFeedPct ?? 0;

    await query(`
      UPDATE slideshow_topics
      SET
        views = $1,
        avg_view_duration_pct = $2,
        impressions = $3,
        traffic_search_pct = $4,
        traffic_feed_pct = $5,
        analytics_synced_at = NOW()
      WHERE id = $6
    `, [views, avgViewDurationPct, impressions, trafficSearchPct, trafficFeedPct, row.topic_id]);

    const viewedStr = impressions > 0 ? ` (${Math.round((views / impressions) * 100)}% viewed)` : '';
    console.log(`[Analytics] ${row.youtube_id}: ${views} views${viewedStr}`);
  }

  console.log('[Analytics] Sync complete');
}

// ─── Performance reporting ─────────────────────────────────────────────────────

type NichePerformanceReport = {
  niche: string;
  totalVideos: number;
  avgViews: number;
  avgViewedPct: number;
  avgDurationPct: number;
  avgSearchPct: number;
  bestAesthetic: string | null;
  bestFormat: string | null;
  topTopics: Array<{ topic: string; views: number; viewedPct: number }>;
  worstTopics: Array<{ topic: string; views: number; viewedPct: number }>;
};

/**
 * Returns a performance summary for a niche including swipe rate and search traffic.
 */
export async function getNichePerformance(niche: string): Promise<NichePerformanceReport> {
  const [totals, byAesthetic, byFormat, top, worst] = await Promise.all([
    query<{ count: string; avg_views: string; avg_viewed: string; avg_duration: string; avg_search: string }>(`
      SELECT
        COUNT(*) AS count,
        AVG(views) AS avg_views,
        AVG(CASE WHEN impressions > 0 THEN views::float / impressions ELSE NULL END) AS avg_viewed,
        AVG(avg_view_duration_pct) AS avg_duration,
        AVG(traffic_search_pct) AS avg_search
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

    query<{ topic: string; views: number; impressions: number }>(`
      SELECT topic, views, impressions
      FROM slideshow_topics
      WHERE niche = $1 AND views > 0
      ORDER BY views DESC
      LIMIT 5
    `, [niche]),

    query<{ topic: string; views: number; impressions: number }>(`
      SELECT topic, views, impressions
      FROM slideshow_topics
      WHERE niche = $1 AND views > 0
      ORDER BY views ASC
      LIMIT 5
    `, [niche]),
  ]);

  const t = totals.rows[0];

  return {
    niche,
    totalVideos: parseInt(t?.count ?? '0', 10),
    avgViews: Math.round(parseFloat(t?.avg_views ?? '0')),
    avgViewedPct: Math.round(parseFloat(t?.avg_viewed ?? '0') * 1000) / 10,
    avgDurationPct: Math.round(parseFloat(t?.avg_duration ?? '0') * 10) / 10,
    avgSearchPct: Math.round(parseFloat(t?.avg_search ?? '0') * 10) / 10,
    bestAesthetic: byAesthetic.rows[0]?.aesthetic_id ?? null,
    bestFormat: byFormat.rows[0]?.format ?? null,
    topTopics: top.rows.map(r => ({
      topic: r.topic,
      views: r.views,
      viewedPct: r.impressions > 0 ? Math.round((r.views / r.impressions) * 1000) / 10 : 0,
    })),
    worstTopics: worst.rows.map(r => ({
      topic: r.topic,
      views: r.views,
      viewedPct: r.impressions > 0 ? Math.round((r.views / r.impressions) * 1000) / 10 : 0,
    })),
  };
}

/**
 * Stores youtube_id, aesthetic_id, format, and quality_score at publish time.
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
