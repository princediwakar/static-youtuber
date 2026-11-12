// Path: lib/generators/topic.ts
import { query } from '../database';
import { getRetentionByConfig } from '../analyticsSync';
import { FORMAT_TEMPLATE_WEIGHTS } from '../constants';
import type { FormatTemplate } from '../constants';
import { generateAutonomousViralTopic, isContentInteresting } from '../viralContentEngine';

export async function reserveTopic(niche: string, accountId: string): Promise<{ id: number; topic: string; research_context: string }> {
  try {
    let result = await query<{ id: number; topic: string; research_context: string }>(`
      UPDATE slideshow_topics
      SET used = TRUE, used_at = NOW()
      WHERE id = (
        SELECT id FROM slideshow_topics
        WHERE account_id = $1 AND used = FALSE
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, topic, research_context
    `, [accountId]);

    if (result.rows.length > 0) {
      const candidate = result.rows[0];
      const check = isContentInteresting(candidate.topic, candidate.research_context);
      if (check.isInteresting) {
        return candidate;
      }
      console.warn(`[TopicGenerator] Retiring uninteresting seeded topic "${candidate.topic}" (${check.reason}). Generating fresh viral topic instead.`);
    }

    // If no unused topics left or seeded topic was boring, synthesize a fresh viral topic
    const fresh = await generateAutonomousViralTopic(niche, accountId);
    
    // Save to database
    try {
      const insertRes = await query<{ id: number }>(`
        INSERT INTO slideshow_topics (topic, niche, account_id, used, used_at, research_context)
        VALUES ($1, $2, $3, TRUE, NOW(), $4)
        ON CONFLICT (topic, account_id) DO UPDATE SET used = TRUE, used_at = NOW()
        RETURNING id
      `, [fresh.topic, niche, accountId, fresh.research_context]);

      const id = insertRes.rows[0]?.id ?? Math.floor(Math.random() * 100000);
      return { id, topic: fresh.topic, research_context: fresh.research_context };
    } catch (insertErr: any) {
      console.warn(`[TopicGenerator] DB insert for fresh topic failed (${insertErr.message}), proceeding in-memory.`);
      return { id: Date.now() % 100000, topic: fresh.topic, research_context: fresh.research_context };
    }
  } catch (err: any) {
    console.warn(`[TopicGenerator] reserveTopic DB query failed (${err.message}), synthesizing emergency topic.`);
    const fallback = await generateAutonomousViralTopic(niche, accountId);
    return { id: Date.now() % 100000, topic: fallback.topic, research_context: fallback.research_context };
  }
}

export async function releaseTopic(id: number): Promise<void> {
  try {
    await query(`UPDATE slideshow_topics SET used = FALSE, used_at = NULL WHERE id = $1`, [id]);
  } catch (e: any) {
    console.warn(`[TopicGenerator] releaseTopic failed (non-fatal): ${e.message}`);
  }
}

// Epsilon-greedy bandit: exploit the best-performing (aesthetic, format) pair
// 85% of the time; explore randomly 15% of the time.
// Falls back to niche weights when there are fewer than 3 data points.
const EPSILON = 0.15;
const MIN_RETENTION_FLOOR = 30; // Kill formats averaging below 30% view duration
const KILL_AFTER_SAMPLES = 20; // Minimum samples before considering a format for termination

function pickFormatTemplateSync(niche: string, killedFormats?: Set<string>): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3, DEEP_DIVE: 0 };

  let total = 0;
  const entries: Array<{ format: FormatTemplate; weight: number }> = [];
  for (const [fmt, w] of Object.entries(weights)) {
    if (w > 0 && !killedFormats?.has(fmt)) {
      total += w;
      entries.push({ format: fmt as FormatTemplate, weight: w });
    }
  }

  if (entries.length === 0 || total === 0) {
    return 'RAPID_FIRE';
  }

  const rand = Math.random() * total;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (rand < cumulative) return entry.format;
  }

  return entries[entries.length - 1].format;
}

export async function pickFormatTemplate(niche: string, aestheticId: string): Promise<FormatTemplate> {
  let retention: Array<{ aestheticId: string; format: string; avgViewDurationPct: number; sampleSize: number }> = [];
  try {
    retention = await getRetentionByConfig(niche);
  } catch (err) {
    console.warn('[TopicGenerator] Bandit query failed, falling back to niche weights:', err);
  }

  // Kill formats that have sufficient samples but fall below the retention floor
  const killedFormats = new Set<string>();
  for (const r of retention) {
    if (r.sampleSize >= KILL_AFTER_SAMPLES && r.avgViewDurationPct < MIN_RETENTION_FLOOR) {
      killedFormats.add(r.format);
      console.warn(
        `[TopicGenerator] Killing format ${r.format} for ` +
        `${niche}/${r.aestheticId}: avg retention ${r.avgViewDurationPct}% ` +
        `< floor ${MIN_RETENTION_FLOOR}% (n=${r.sampleSize})`
      );
    }
  }

  // Explore: ignore past data and pick randomly (skip killed formats)
  if (Math.random() < EPSILON) {
    return pickFormatTemplateSync(niche, killedFormats);
  }

  // Exploit: pick the best-performing format that isn't killed
  const best = retention.find(r => r.aestheticId === aestheticId && r.sampleSize >= 3 && !killedFormats.has(r.format));
  if (best) return best.format as FormatTemplate;

  return pickFormatTemplateSync(niche, killedFormats);
}
