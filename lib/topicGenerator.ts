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
  slides: z.array(SlideSchema).min(5).max(5),
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
const SYSTEM_PROMPT = `You are a viral scriptwriter for an Indian history YouTube Shorts channel targeting a young Indian audience.
Your tone is INTERESTING, HUMOROUS, and HIGHLY ACCESSIBLE. 
CRITICAL: Use simple, everyday language. Avoid difficult vocabulary, academic jargon, or dense historical terms. Explain concepts like you're telling a funny, mind-blowing story to a friend. Use modern Indian pop-culture or everyday analogies if it helps.

Output ONLY valid JSON. No markdown. No code fences. No trailing commas. No explanation.

Schema:
{
  "title": "string (max 70 chars, curiosity-driven — pattern: 'The time [person] did [crazy thing]', 'Why [Historical Event] is actually hilarious')",
  "description": "string (2 gripping sentences about the topic + 6 hashtags: #history #historyfacts #shorts #facts + 2 specific)",
  "tags": ["string"] (8 tags mixing broad and specific),
  "slides": [5 objects each with: {"text": "string (narration, max 18 words)", "image_prompt": "string (cinematic visual scene description, no text in image)"}],
  "thumbnailPrompt": "string"
}

PACING MANDATE: Slides 1 + 2 combined must take UNDER 8 SECONDS when read aloud. Be ruthlessly concise — every extra word costs viewers.

SLIDE STRUCTURE — follow this EXACTLY, 5 slides, each role is mandatory:

Slide 1 — THE HOOK (Curiosity + Humor):
  Create an irresistible open loop. Make it funny or absurd right away.
  Example: "A Viking warlord once did something so ridiculous that historians still laugh about it."
  Max 15 words. Keep the language incredibly simple. Do NOT start with "Did you know".

Slide 2 — THE SETUP (Punchy Context):
  Who, where, when — in ONE punchy line. No filler, no academic words.
  Example: "It was 1066, and apparently, nobody knew how to lock a gate."
  Max 14 words. This slide must be FAST.

Slide 3 — THE CRAZY TRUTH (The Twist):
  THIS IS THE DOPAMINE HIT. Deliver the most surprising, mind-blowing fact NOW.
  Treat it like the punchline of a joke or a crazy plot twist.
  Max 18 words.

Slide 4 — THE EXPLANATION (How/Why):
  Now that you've hooked them, explain WHY or HOW it happened in plain English.
  Use simple modern analogies if needed (e.g., "basically the ancient version of getting left on read").
  Max 18 words.

Slide 5 — CTA (The Payoff & Call to Action):
  MUST follow this exact format: "[Quick funny payoff]. Comment '[KEYWORD]' if you'd survive that, and subscribe for more crazy history." where [KEYWORD] is a relevant word.
  Max 20 words.

IMAGE PROMPT RULES (per slide):
- Describe only the visual scene — no text in image
- Be specific: name the civilization, setting, time period, objects
- Style: minimal cartoonish illustration, expressive characters, funny situations, simple vector style
- Slide 5: Describe a funny, minimal cartoonish wide shot related to the core topic, no text

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
      max_tokens: 8000,
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
    let cleanRaw = raw.trim();
    if (cleanRaw.startsWith('```json')) {
      cleanRaw = cleanRaw.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanRaw.startsWith('```')) {
      cleanRaw = cleanRaw.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(cleanRaw);
  } catch (err: any) {
    throw new Error(`DeepSeek output is not valid JSON. Parse Error: ${err.message}. Raw: ${raw.substring(0, 200)}`);
  }

  // Normalize camelCase → snake_case in slide objects (DeepSeek may use either)
  parsed = normalizeFieldNames(parsed);

  const validated = SlideshowScriptSchema.parse(parsed);

  return {
    ...validated,
    description: `${validated.description}\n\n${MUSIC_ATTRIBUTION}`,
    slides: validated.slides.map((slide, i) => ({
      ...slide,
      image_prompt: `${IMAGE_STYLE_PREFIX} ${slide.image_prompt}`,
    })),
    thumbnailPrompt: `${THUMBNAIL_STYLE_PREFIX} ${validated.thumbnailPrompt}`,
  };

}
