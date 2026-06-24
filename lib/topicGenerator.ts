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
} from './constants';

// ─── Zod schema for DeepSeek output validation ───────────────────────────────
const SlideSchema = z.object({
  text: z.string().max(150),
  image_prompt: z.string(),
});

const SlideshowScriptSchema = z.object({
  title: z.string().max(100),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(12),
  slides: z.array(SlideSchema).min(7).max(9),
  thumbnailPrompt: z.string(),
});

// ─── Topic deduplication ─────────────────────────────────────────────────────
export async function pickUnusedTopic(): Promise<string> {
  // Atomically pick and mark a topic as used
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
    // All topics used — reset and start again
    await query('UPDATE slideshow_topics SET used = FALSE, used_at = NULL WHERE niche = $1', [NICHE]);
    const resetResult = await query<{ topic: string }>(
      "UPDATE slideshow_topics SET used = TRUE, used_at = NOW() WHERE id = (SELECT id FROM slideshow_topics WHERE niche = $1 ORDER BY RANDOM() LIMIT 1) RETURNING topic",
      [NICHE]
    );
    if (resetResult.rows.length === 0) throw new Error('No topics found in the pool');
    return resetResult.rows[0].topic;
  }

  return result.rows[0].topic;
}

// ─── Script generation ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a scriptwriter for a calm, educational YouTube Shorts channel about psychology.
Output ONLY valid JSON. No markdown. No explanation. No code fences. No trailing commas.

Schema:
{
  "title": "string (max 60 chars, punchy, curiosity-driven — starts with number, question, or Why/How)",
  "description": "string (2 engaging sentences + 6 hashtags)",
  "tags": ["string"] (8 relevant tags mixing broad and specific),
  "slides": [{ "text": "string", "image_prompt": "string" }] (exactly 8 slides),
  "thumbnailPrompt": "string"
}

Slide rules:
- text: ≤ 18 words, factual, conversational, reads naturally when spoken aloud
- First slide: immediate curiosity hook — do NOT start with "Did you know"
- image_prompt: describe only the visual scene, no text in image, suitable for flat illustration style
- thumbnailPrompt: single dramatic scene that represents the video topic

Tags: mix broad (#psychology #mindset) and specific (#cognitivebias #brainfacts)`;

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
        { role: 'user', content: `Topic: ${topic}` },
      ],
      temperature: 0.8,
      max_tokens: 2000,
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

  const validated = SlideshowScriptSchema.parse(parsed);

  // Prepend style prefix to each image_prompt for consistency
  return {
    ...validated,
    slides: validated.slides.map(slide => ({
      ...slide,
      image_prompt: `${IMAGE_STYLE_PREFIX} ${slide.image_prompt}`,
    })),
    thumbnailPrompt: `${THUMBNAIL_STYLE_PREFIX} ${validated.thumbnailPrompt}`,
  };
}
