// Path: lib/topicGenerator.ts
import { z } from 'zod';
import { query } from './database';
import { SlideshowScript } from './types';
import {
  DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  MUSIC_ATTRIBUTION,
  AESTHETICS,
} from './constants';

// ─── Zod schema ───────────────────────────────────────────────────────────────
const SlideSchema = z.object({
  text: z.string().max(200),
  image_prompt: z.string(),
  audio_tag: z.string().optional().transform(val => {
    if (!val) return '[serious]';
    const v = val.trim();
    return v.startsWith('[') && v.endsWith(']') ? v : `[${v}]`;
  }),
});

const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.string(),
  title: z.string().max(100),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(12),
  slides: z.array(SlideSchema).min(6).max(6),
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
CRITICAL MANDATE: Only generate stories from the top 10 GDP countries: USA, China, Japan, Germany, India, UK, France, Canada, Russia, Spain. DO NOT generate stories from any other countries.
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
function getSystemPrompt(niche: string, format: string, aestheticInstruction: string): string {
  const base = `You are a viral scriptwriter for a Global YouTube Shorts channel targeting a massive international audience, creating premium micro-documentaries.
CRITICAL MANDATE: The entire script (title, description, and ALL slide text) MUST be written in highly energetic, conversational English.
Your tone is OMINOUS, INTENSE, and HIGHLY ACCESSIBLE. Speak like you are declassifying a secret.
CRITICAL: Use simple, everyday English. Avoid dense academic jargon. 

ADVANCED STORYTELLING MECHANICS:
1. COGNITIVE DISSONANCE HOOK: Slide 1 must break the viewer's brain by presenting two facts that cannot logically exist together, but do. State it as a bizarre anomaly. Do not ask a question.
2. NAVARASA (Emotional Arc):
   - Adbhuta (Wonder/Awe): Use this for the opening hook and the final reveal. Emphasize the impossible scale.
   - Bhayanaka (Tension/Terror): Raise the stakes dramatically in the middle.
3. EXTREME SPECIFICITY:
   - NEVER use vague words like "many" or "a long time". ALWAYS use exact numbers ("47 tons", "800 meters").
4. THE SEAMLESS LOOP:
   - The final spoken sentence of Slide 6 MUST be a fragmented clause that acts as a grammatical bridge, leading perfectly into the first word of Slide 1.

FACT VERIFICATION MANDATE (CRITICAL):
- You MUST verify every factual claim you make. Do not guess. In the "fact_check_and_sources" field, list the verified sources.
- Never present fabricated stories as real.

Output ONLY valid JSON. No markdown. No code fences. No trailing commas. No explanation.

Schema:
{
  "fact_check_and_sources": "string",
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "slides": [6 objects each with: {"text": "string (narration, max 18 words)", "image_prompt": "string (visual scene description, no text in image)", "audio_tag": "string (e.g., [serious], [mysterious], [intense])"}],
  "thumbnailPrompt": "string"
}

VIRAL PACING MANDATE:
- Slides 1 + 2 combined must take UNDER 8 SECONDS when read aloud. Be ruthlessly concise.

IMAGE PROMPT RULES (per slide):
- Describe only the visual scene — no text in image.
- Be hyper-specific: name the exact lighting, weather, textures, and details.
- CONSISTENT AESTHETIC MANDATE: ${aestheticInstruction}
- Slide 1: A wide, recognizable macro-shot establishing the subject.
- Slide 2 (Escalating Visual Proof): Zoom in on a specific, rarely seen historical detail, document, or mechanism.
- Slide 6: A wide, breathtaking shot that resolves the visual story.
- TAGS: include #shorts and 4 specific tags.`;

  let formatRules = '';
  if (format === 'quiz') {
    formatRules = `SLIDE STRUCTURE FOR MCQ QUIZ (6 slides):
Slide 1 — THE HOOK: Cognitive Dissonance hook. Drop cheap parlor tricks.
Slide 2 — CLUE 1: Give a slightly obscure but interesting hint. Focus visually on an intense detail.
Slide 3 — CLUE 2: Give a second hint. Narrator speaks quietly to build tension.
Slide 4 — CLUE 3: Give a more obvious hint. Escalate visual tension.
Slide 5 — THE TENSION: Build tension through script pacing and visual escalation.
Slide 6 — THE REVEAL & LOOP: Reveal the full answer immediately. Give one mind-blowing context clue. Then, write a transitional half-sentence that grammatically connects directly to the first word of Slide 1 to create an infinite loop.`;
  } else if (format === 'facts') {
    formatRules = `SLIDE STRUCTURE FOR TOP FACTS (6 slides):
Slide 1 — THE HOOK: Cognitive Dissonance hook. Start directly with friction.
Slide 2 — FACT 3: The least crazy but still interesting fact. Focus visually on an intense detail.
Slide 3 — THE SECRET: Narrator whispers a dark or hidden detail about Fact 3.
Slide 4 — FACT 2: A weirder fact.
Slide 5 — FACT 1: The absolute most mind-blowing fact. Escalate the tension naturally.
Slide 6 — THE FINAL TWIST & LOOP: Deliver the final payoff. Do NOT leave the core story unresolved. Then, append a fragmented clause that forces the sentence to finish by wrapping back to the first word of Slide 1.`;
  } else {
    formatRules = `SLIDE STRUCTURE FOR STORY (6 slides):
Slide 1 — THE HOOK: Cognitive Dissonance hook. Extreme curiosity gap. Never tell them to scroll away.
Slide 2 — THE SETUP (Escalating Proof): The exact stakes, numbers, dates, and names. Visual must zoom into a rare detail.
Slide 3 — THE TURNING POINT: The moment things go completely wrong or a secret is revealed.
Slide 4 — THE CRAZY TRUTH: The insane twist happens visually and audibly.
Slide 5 — THE EXPLANATION: Explain why/how in plain, punchy English.
Slide 6 — THE COMPLETE PAYOFF & LOOP: You MUST reveal the complete, final, and satisfying outcome of the story. Absolutely NO cliffhangers. The story MUST be 100% finished. Then, end with a fragmented sentence that acts as a grammatical bridge, leading perfectly into the first word of Slide 1.`;
  }

  return base + '\n\n' + formatRules;
}

// ─── Script generation ────────────────────────────────────────────────────────

function normalizeFieldNames(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(normalizeFieldNames);
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const normalizedKey =
        key === 'imagePrompt' ? 'image_prompt' :
        key === 'thumbnailPrompt' ? 'thumbnailPrompt' : 
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

  // Randomly select one of the aesthetics for this generation
  const aesthetic = AESTHETICS[Math.floor(Math.random() * AESTHETICS.length)];
  console.log(`[TopicGenerator] Selected Aesthetic for "${topic}": ${aesthetic.id}`);

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: getSystemPrompt(niche, format, aesthetic.instruction) },
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

  parsed = normalizeFieldNames(parsed);

  const validated = SlideshowScriptSchema.parse(parsed);

  return {
    ...validated,
    format,
    description: `${validated.description}\n\n[Aesthetic: ${aesthetic.id}]\n\n${MUSIC_ATTRIBUTION}`,
    slides: validated.slides.map((slide) => ({
      ...slide,
      image_prompt: `${aesthetic.imagePrefix}${slide.image_prompt}`,
    })),
    thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt}`,
  };
}