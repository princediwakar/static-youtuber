import { query } from '../database';
import { getRetentionByConfig } from '../analyticsSync';
import { FORMAT_TEMPLATE_WEIGHTS } from '../constants';
import type { FormatTemplate } from '../constants';

export async function reserveTopic(niche: string, accountId: string): Promise<{ id: number; topic: string; research_context: string }> {
  let result = await query<{ id: number; topic: string; research_context: string }>(`
    UPDATE slideshow_topics
    SET used = TRUE, used_at = NOW()
    WHERE id = (
      SELECT id FROM slideshow_topics
      WHERE niche = $1 AND account_id = $2 AND used = FALSE
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, topic, research_context
  `, [niche, accountId]);

  if (result.rows.length === 0) {
    throw new Error(`[TopicGenerator] No unused topics left in DB for ${niche}/${accountId}. Please add more to the seed file.`);
  }
  return result.rows[0];
}

export async function releaseTopic(id: number): Promise<void> {
  await query(`UPDATE slideshow_topics SET used = FALSE, used_at = NULL WHERE id = $1`, [id]);
}

// Epsilon-greedy bandit: exploit the best-performing (aesthetic, format) pair
// 85% of the time; explore randomly 15% of the time.
// Falls back to niche weights when there are fewer than 3 data points.
const EPSILON = 0.15;

function pickFormatTemplateSync(niche: string): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3, DEEP_DIVE: 0 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST'; // DEEP_DIVE has weight=0 in all shorts niches — never reaches here
}

export async function pickFormatTemplate(niche: string, aestheticId: string): Promise<FormatTemplate> {
  // Explore: ignore past data and pick randomly
  if (Math.random() < EPSILON) {
    return pickFormatTemplateSync(niche);
  }

  // Exploit: pick the format with the highest avg retention for this aesthetic
  try {
    const retention = await getRetentionByConfig(niche);
    const best = retention.find(r => r.aestheticId === aestheticId && r.sampleSize >= 3);
    if (best) return best.format as FormatTemplate;
  } catch (err) {
    console.warn('[TopicGenerator] Bandit query failed, falling back to niche weights:', err);
  }

  return pickFormatTemplateSync(niche);
}
