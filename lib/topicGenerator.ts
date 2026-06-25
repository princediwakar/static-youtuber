// Path: lib/topicGenerator.ts
import { z } from 'zod';
import { query } from './database';
import { SlideshowScript } from './types';
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  IMAGE_STYLE_PREFIX,
  THUMBNAIL_STYLE_PREFIX,
  MUSIC_ATTRIBUTION,
} from './constants';
// ─── Zod schema ───────────────────────────────────────────────────────────────
const SlideSchema = z.object({
  text: z.string().max(200),
  image_prompt: z.string(),
  audio_tag: z.enum(['[engaged]', '[curious]', '[encouraging]', '[conversational]']),
});

const SlideshowScriptSchema = z.object({
  title: z.string().max(100),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(12),
  slides: z.array(SlideSchema).min(5).max(5),
  thumbnailPrompt: z.string(),
});

// ─── Topic deduplication ─────────────────────────────────────────────────────

export async function generateTopics(niche: string): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const pastTopicsRes = await query<{ topic: string }>(
    `SELECT topic FROM slideshow_topics WHERE niche = $1 ORDER BY used_at DESC NULLS LAST LIMIT 50`,
    [niche]
  );
  const pastTopics = pastTopicsRes.rows.map(r => r.topic);

  const prompt = `You are an expert content strategist for a YouTube Shorts channel in the "${niche}" niche.
Generate 20 completely unique, highly engaging, and viral video topics.
DO NOT generate any of these previously used topics (or anything too similar):
${pastTopics.length > 0 ? pastTopics.join('\n') : 'No past topics yet.'}

Output ONLY valid JSON in this format:
{ "topics": ["topic 1", "topic 2", ...] }`;

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await response.json();
  const raw = data.choices[0]?.message?.content;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch(e) {
    throw new Error('Failed to parse topic generation response');
  }

  for (const topic of parsed.topics || []) {
    await query(`INSERT INTO slideshow_topics (topic, niche) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [topic, niche]);
  }
}

export async function pickUnusedTopic(niche: string): Promise<string> {
  let result = await query<{ topic: string }>(`
    UPDATE slideshow_topics
    SET used = TRUE, used_at = NOW()
    WHERE id = (
      SELECT id FROM slideshow_topics
      WHERE niche = $1 AND used = FALSE
      ORDER BY RANDOM()
      LIMIT 1
    )
    RETURNING topic
  `, [niche]);

  if (result.rows.length === 0) {
    console.log(`[TopicGenerator] No unused topics for ${niche}, generating more...`);
    await generateTopics(niche);
    
    result = await query<{ topic: string }>(`
      UPDATE slideshow_topics
      SET used = TRUE, used_at = NOW()
      WHERE id = (
        SELECT id FROM slideshow_topics
        WHERE niche = $1 AND used = FALSE
        ORDER BY RANDOM()
        LIMIT 1
      )
      RETURNING topic
    `, [niche]);
    
    if (result.rows.length === 0) throw new Error(`Failed to generate new topics for ${niche}`);
  }

  return result.rows[0].topic;
}

// ─── System prompt factory ─────────────────────────────────────────────────────
function getSystemPrompt(niche: string, format: string): string {
  const base = `You are a viral scriptwriter for an Indian YouTube Shorts channel targeting a young Indian audience.
CRITICAL MANDATE: The entire script (title, description, and ALL slide text) MUST be written in conversational, engaging Hindi (written in Devanagari script).
Your tone is INTERESTING, HUMOROUS, and HIGHLY ACCESSIBLE. 
CRITICAL: Use simple, everyday Hindi. Avoid difficult vocabulary or dense academic jargon (shuddh hindi). Explain concepts like you're telling a funny, mind-blowing story to a friend. Use modern Indian pop-culture or everyday analogies if it helps.

Output ONLY valid JSON. No markdown. No code fences. No trailing commas. No explanation.

Schema:
{
  "title": "string (max 70 chars, curiosity-driven)",
  "description": "string (2 gripping sentences about the topic + hashtags)",
  "tags": ["string"] (8 tags mixing broad and specific),
  "slides": [5 objects each with: {"text": "string (narration, max 18 words)", "image_prompt": "string (cinematic visual scene description, no text in image)", "audio_tag": "string (one of: [engaged], [curious], [encouraging], [conversational])"}],
  "thumbnailPrompt": "string"
}

PACING MANDATE: Slides 1 + 2 combined must take UNDER 8 SECONDS when read aloud. Be ruthlessly concise.

IMAGE PROMPT RULES (per slide):
- Describe only the visual scene — no text in image
- Be specific: name the setting, objects, characters
- Style: minimal cartoonish illustration, expressive characters, funny situations, simple vector style
- Slide 5: Describe a funny, minimal cartoonish wide shot related to the core topic, no text
- TAGS: include #shorts and 4 specific tags for the topic.`;

  let formatRules = '';
  if (format === 'quiz') {
    formatRules = `SLIDE STRUCTURE FOR MCQ QUIZ (5 slides):
Slide 1 — THE HOOK: "Can you guess this ${niche} fact/person?" (Make it engaging)
Slide 2 — CLUE 1: Give a slightly obscure but interesting hint.
Slide 3 — CLUE 2: Give a more obvious hint. Build tension.
Slide 4 — THE TIMER/TENSION: "You have 3 seconds... 3, 2, 1!" (Or something similar, very short)
Slide 5 — THE REVEAL: "It is [Answer]! [One funny detail about them/it]."`;
  } else if (format === 'facts') {
    formatRules = `SLIDE STRUCTURE FOR TOP FACTS (5 slides):
Slide 1 — THE HOOK: "Top 3 craziest facts about [Topic] that will blow your mind!"
Slide 2 — FACT 3: The least crazy but still interesting fact.
Slide 3 — FACT 2: A weirder fact.
Slide 4 — FACT 1: The absolute most mind-blowing fact.
Slide 5 — THE CONCLUSION: A quick funny wrap-up. No subscribe CTA.`;
  } else {
    // story format (default)
    formatRules = `SLIDE STRUCTURE FOR STORY (5 slides):
Slide 1 — THE HOOK (Curiosity + Humor): Irresistible open loop.
Slide 2 — THE SETUP (Punchy Context): Who, where, when.
Slide 3 — THE CRAZY TRUTH (The Twist): The dopamine hit, most surprising fact.
Slide 4 — THE EXPLANATION (How/Why): Explain why/how in plain Hindi.
Slide 5 — THE PAYOFF (Conclusion): Quick funny conclusion. No subscribe CTA.`;
  }

  return base + '\n\n' + formatRules;
}

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

export async function generateScript(topic: string, format: string, niche: string): Promise<SlideshowScript> {
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
        { role: 'system', content: getSystemPrompt(niche, format) },
        { role: 'user', content: `Write a viral YouTube Shorts script about this ${niche} topic: ${topic}` },
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
    format,
    description: `${validated.description}\n\n${MUSIC_ATTRIBUTION}`,
    slides: validated.slides.map((slide, i) => ({
      ...slide,
      image_prompt: `${IMAGE_STYLE_PREFIX} ${slide.image_prompt}`,
    })),
    thumbnailPrompt: `${THUMBNAIL_STYLE_PREFIX} ${validated.thumbnailPrompt}`,
  };

}
