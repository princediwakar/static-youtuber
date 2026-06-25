// Path: lib/topicGenerator.ts
import { z } from 'zod';
import { query } from './database';
import { SlideshowScript } from './types';
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  IMAGE_STYLE_PREFIX,
  THUMBNAIL_STYLE_PREFIX,
  NICHE,
  MUSIC_ATTRIBUTION,
} from './constants';


// ─── Zod schema ───────────────────────────────────────────────────────────────
const SlideSchema = z.object({
  text: z.string().max(200),
  image_prompt: z.string(),
});

const SlideshowScriptSchema = z.object({
  title: z.string().max(100),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(12),
  slides: z.array(SlideSchema).min(9).max(9),
  thumbnailPrompt: z.string(),
});

// ─── Topic deduplication ─────────────────────────────────────────────────────
export async function pickUnusedTopic(): Promise<string> {
  const result = await query<{ topic: string }>(`
    UPDATE slideshow_topics
    SET used = TRUE, used_at = NOW()
    WHERE id = (
      SELECT id FROM slideshow_topics
      WHERE niche = $1 AND used = FALSE
      ORDER BY RANDOM()
      LIMIT 1
    )
    RETURNING topic
  `, [NICHE]);

  if (result.rows.length === 0) {
    // All topics used — reset pool
    await query('UPDATE slideshow_topics SET used = FALSE, used_at = NULL WHERE niche = $1', [NICHE]);
    const reset = await query<{ topic: string }>(
      `UPDATE slideshow_topics SET used = TRUE, used_at = NOW()
       WHERE id = (SELECT id FROM slideshow_topics WHERE niche = $1 ORDER BY RANDOM() LIMIT 1)
       RETURNING topic`,
      [NICHE]
    );
    if (reset.rows.length === 0) throw new Error('No topics in pool');
    return reset.rows[0].topic;
  }

  return result.rows[0].topic;
}

// ─── System prompt (Hook-Loop-Payoff for history) ─────────────────────────────
const SYSTEM_PROMPT = `You are a viral scriptwriter for a cinematic history YouTube Shorts channel targeting a global English-speaking audience aged 18–40.

Output ONLY valid JSON. No markdown. No code fences. No trailing commas. No explanation.

Schema:
{
  "title": "string (max 70 chars, curiosity-driven — pattern: 'The [superlative] [thing] in Human History', 'The [Event] That Changed Everything', or 'Why [historical figure] Was Not Who You Think')",
  "description": "string (2 gripping sentences about the topic + 6 hashtags: #history #ancienthistory #historyfacts #shorts #facts + 1 specific)",
  "tags": ["string"] (8 tags mixing broad and specific),
  "slides": [9 objects each with: {"text": "string (narration, max 18 words)", "image_prompt": "string (cinematic visual scene description, no text in image)"}],
  "thumbnailPrompt": "string"
}

PACING MANDATE: Slides 1 + 2 combined must take UNDER 8 SECONDS when read aloud. Be ruthlessly concise — every extra word costs viewers.

SLIDE STRUCTURE — follow this EXACTLY, 9 slides, each role is mandatory:

Slide 1 — SCROLL-STOPPER HOOK (role: open_loop):
  Create an irresistible open loop. State a shocking consequence or mystery BEFORE the explanation.
  Use one of these formats:
  - "A [Roman emperor / Aztec priest / Viking warlord] once did something so [shocking adjective] that historians still debate whether it actually happened."
  - "For [X years], the most powerful [empire/civilization] on Earth had a secret that no one was supposed to know."
  - "The day [historical event] happened, nobody knew it would [world-changing consequence]."
  Max 18 words. Do NOT start with "Did you know".

Slide 2 — COMPRESSED SETUP (role: setup_compressed):
  Who, where, when — in ONE punchy line. No filler. No scene-setting poetry.
  Example: "Çatalhöyük, Turkey, 7500 BC — 8,000 people, zero streets, zero doors."
  Max 14 words. This slide must be FAST.

Slide 3 — THE TWIST (role: twist):
  THIS IS THE DOPAMINE HIT. Violate the viewer's expectation immediately after the compressed setup.
  Deliver the most surprising fact NOW — do not build to it slowly.
  This must land by second 8–10 of the video. The viewer is deciding whether to stay RIGHT NOW.
  Max 18 words.

Slide 4 — EXPLAIN THE TWIST (role: depth):
  Now that you've hooked them with the twist, explain WHY or HOW.
  Add a specific fact, number, or mechanism that makes the twist feel real and credible.
  Max 18 words.

Slide 5 — EVIDENCE (role: evidence):
  Concrete proof. A specific archaeological finding, a named historian, a measurement, a date.
  This slide builds trust — the viewer now believes the twist wasn't clickbait.
  Max 18 words.

Slide 6 — ESCALATION (role: escalation):
  Add another surprising dimension — a consequence, a parallel civilization, or a hidden detail.
  The viewer should think "wait, it gets even crazier?"
  Max 18 words.

Slide 7 — THE PAYOFF (role: payoff):
  Close the loop opened in slide 1. This is the most satisfying slide.
  Directly answer the mystery/question from the hook.
  Max 18 words.

Slide 8 — MODERN CONNECTION (role: modern_parallel):
  Connect the historical fact to something modern. Why does this matter TODAY?
  Make the viewer see their own world differently.
  Max 18 words.

Slide 9 — CTA (role: call_to_action):
  MUST follow this exact format: "Comment '[KEYWORD]' if this changed how you see history — and follow for more forgotten stories." where [KEYWORD] is a single relevant word (e.g., ROME, AZTEC, EGYPT).
  Max 20 words.

IMAGE PROMPT RULES (per slide):
- Describe only the visual scene — no text in image
- Be specific: name the civilization, setting, time period, objects
- Style: cinematic historical illustration, dramatic lighting, period-accurate
- Slide 9: always "dramatic wide shot of an ancient city at golden hour, silhouette of a lone scholar reading, epic scale, no text"

TAGS: include #history #ancienthistory #historyfacts #shorts and 4 specific tags for the topic.`;

// ─── Script generation ────────────────────────────────────────────────────────

function normalizeFieldNames(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(normalizeFieldNames);
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Map common camelCase variants to snake_case
      const normalizedKey =
        key === 'imagePrompt' ? 'image_prompt' :
        key === 'thumbnailPrompt' ? 'thumbnailPrompt' : // already camelCase in schema
        key;
      out[normalizedKey] = normalizeFieldNames(value);
    }
    return out;
  }
  return obj;
}

export async function generateScript(topic: string): Promise<SlideshowScript> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Write a viral YouTube Shorts script about this history topic: ${topic}` },
      ],
      temperature: 0.85,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.choices[0]?.message?.content;
  if (!raw) throw new Error('DeepSeek returned empty content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`DeepSeek output is not valid JSON: ${raw.substring(0, 200)}`);
  }

  // Normalize camelCase → snake_case in slide objects (DeepSeek may use either)
  parsed = normalizeFieldNames(parsed);

  const validated = SlideshowScriptSchema.parse(parsed);

  return {
    ...validated,
    description: `${validated.description}\n\n${MUSIC_ATTRIBUTION}`,
    slides: validated.slides.map((slide, i) => ({
      ...slide,
      // Slide 9 (index 8) gets the fixed CTA image prompt
      image_prompt: i === 8
        ? `${IMAGE_STYLE_PREFIX} dramatic wide shot of an ancient city at golden hour, silhouette of a lone scholar reading a scroll, epic scale, no text`
        : `${IMAGE_STYLE_PREFIX} ${slide.image_prompt}`,
    })),
    thumbnailPrompt: `${THUMBNAIL_STYLE_PREFIX} ${validated.thumbnailPrompt}`,
  };

}
