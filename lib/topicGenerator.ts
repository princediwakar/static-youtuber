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
  audio_tag: z.string().optional().transform(val => {
    if (!val) return '[conversational]';
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
function getSystemPrompt(niche: string, format: string): string {
  const base = `You are a viral scriptwriter for a Global YouTube Shorts channel targeting a massive international audience, strictly following the MrBeast retention style.
CRITICAL MANDATE: The entire script (title, description, and ALL slide text) MUST be written in highly energetic, conversational English.
Your tone is INTERESTING, FAST-PACED, and HIGHLY ACCESSIBLE.
CRITICAL: Use simple, everyday English. Avoid difficult vocabulary or dense academic jargon. Explain concepts like you're telling a mind-blowing story to a friend. Use universal pop-culture or relatable analogies. Always prioritize a strong curiosity gap.

ADVANCED STORYTELLING MECHANICS:
1. NAVARASA (Emotional Arc):
   - Adbhuta (Wonder/Awe): Use this for the opening hook and the final reveal. Emphasize the impossible scale.
   - Bhayanaka (Tension/Terror): Use this in the middle (Slide 3/4) to raise the stakes dramatically (e.g., "If this failed, millions would die").
2. FIGURES OF SPEECH:
   - Vivid Metaphor: "The vault was a giant steel trap."
   - Powerful Imagery: "They vanished like smoke in the wind."
   - BANNED CLICHÉS: You MUST completely avoid cliché contrast patterns like "It wasn't just X, it was Y", "He didn't bring X, he brought Y", or "Not X, but Y". State facts directly and powerfully without using these negative comparisons.
   - SIMPLE ENGLISH MANDATE: Use extremely simple, 6th-grade reading level English. DO NOT use complex, flowery, or difficult words (like "labyrinth", "clandestine", or "audacious"). Use short, punchy words that anyone in the world can easily understand.
3. EXTREME SPECIFICITY (The MrBeast Rule):
   - NEVER use vague words like "many", "a long time", or "a lot of money".
   - ALWAYS use exact numbers: "47 tons of physical gold", "29 years", "800 meters away". Specificity builds immediate credibility and awe.

FACT VERIFICATION MANDATE (CRITICAL):
- Before writing the script, you MUST verify every factual claim you make. DO NOT fabricate, guess, or invent facts.
- In the "fact_check_and_sources" field, list the verified historical/scientific sources for the claims you are about to make. If a claim is widely documented in reputable sources (encyclopedias, academic papers, government records), cite them. If you cannot verify a claim, DO NOT include it.
- If a fact is a popular myth or urban legend, present it as a myth being busted rather than as a true fact. Use phrasing like "Myth hai ki..." or "Aapne suna hoga..., lekin sach ye hai..."
- Never present fabricated stories, fake quotes, or made-up events as real. The audience trusts you — do not betray that trust.

Output ONLY valid JSON. No markdown. No code fences. No trailing commas. No explanation.

Schema:
{
  "fact_check_and_sources": "string (verified sources for claims in the script, e.g., 'Source: NCERT Class 12 History textbook, Chapter 3; Encyclopedia Britannica entry on...')",
  "title": "string (max 70 chars, curiosity-driven, aggressive hook)",
  "description": "string (2 gripping sentences about the topic + hashtags)",
  "tags": ["string"] (8 tags mixing broad and specific),
  "slides": [6 objects each with: {"text": "string (narration, max 18 words)", "image_prompt": "string (cinematic visual scene description, no text in image)", "audio_tag": "string (a descriptive emotional tag for the TTS voice based on the slide's topic, e.g., [mysterious], [excited], [serious], [funny], [sarcastic])"}],
  "thumbnailPrompt": "string"
}

VIRAL PACING MANDATE:
- Slide 1 must be an aggressive, hostile, or anti-marketing hook. Tell them to scroll away, tell them they've been lied to, or forbid them from watching. Use reverse psychology to make them NEED to know more.
- Slides 1 + 2 combined must take UNDER 8 SECONDS when read aloud. Be ruthlessly concise.
- Slide 6 must NOT have a traditional conclusion. End mid-thought or with a cliffhanger that seamlessly loops back to the beginning of Slide 1 to drive rewatch rates.

IMAGE PROMPT RULES (per slide):
- Describe only the visual scene — no text in image
- Be specific: name the setting, objects, characters
- VISUAL WHIPLASH MANDATE: You MUST use a completely different, aggressively clashing art style for every single slide. For example, Slide 1 could be a 1980s polaroid photograph, Slide 2 a crude MS Paint drawing, Slide 4 a low-poly PS1 game render, and Slide 5 a Renaissance oil painting. Explicitly state the bizarre art style at the beginning of each image_prompt. The jarring lack of visual consistency is the goal.
- Slide 2 (Cunningham's Law): You MUST intentionally include exactly ONE glaring anachronism or historically inaccurate object (like a modern smartphone, a Starbucks cup, or modern sneakers in an ancient setting). This forces viewers to comment on the "mistake".
- Slide 3: For the sensory deprivation effect, the image prompt MUST be EXACTLY: "Pitch black screen, absolute darkness." No characters, no background.
- Slide 6: Describe a wide shot related to the core topic in the most unhinged art style yet, no text
- TAGS: include #shorts and 4 specific tags for the topic.`;

  let formatRules = '';
  if (format === 'quiz') {
    formatRules = `SLIDE STRUCTURE FOR MCQ QUIZ (6 slides):
Slide 1 — THE HOOK: Aggressive, hostile, or anti-marketing pattern interrupt. Use reverse psychology (e.g. "Scroll away if you don't know...").
Slide 2 — CLUE 1: Give a slightly obscure but interesting hint.
Slide 3 — SENSORY DEPRIVATION: Image prompt MUST be "Pitch black screen, absolute darkness." Narrator gives CLUE 2 very quietly.
Slide 4 — CLUE 3: Give a more obvious hint. Build tension.
Slide 5 — THE TIMER/TENSION: "You have 3 seconds... 3, 2, 1!" (Or something similar, very short)
Slide 6 — THE REVEAL & LOOP: "It is [Answer]! [One funny detail about them/it]." Reveal the full answer. Then end with a phrase that smoothly loops back to the exact beginning of Slide 1. DO NOT leave the viewer hanging without the answer.`;
  } else if (format === 'facts') {
    formatRules = `SLIDE STRUCTURE FOR TOP FACTS (6 slides):
Slide 1 — THE HOOK: Aggressive, hostile, or anti-marketing pattern interrupt. "You've been lied to about [Topic]" or "Keep scrolling, you can't handle this fact."
Slide 2 — FACT 3: The least crazy but still interesting fact.
Slide 3 — SENSORY DEPRIVATION: Image prompt MUST be "Pitch black screen, absolute darkness." Narrator whispers a secret or dark detail about Fact 2.
Slide 4 — FACT 2: A weirder fact.
Slide 5 — FACT 1: The absolute most mind-blowing fact.
Slide 6 — THE FINAL TWIST & LOOP: Deliver the final mind-blowing payoff. Do NOT leave the core story unresolved. Then, end the video with a clever transition phrase that seamlessly loops back to the exact beginning of Slide 1. No subscribe CTA.`;
  } else {
    // story format (default)
    formatRules = `SLIDE STRUCTURE FOR STORY (6 slides):
Slide 1 — THE HOOK (Adbhuta/Wonder): Extreme curiosity gap using a hostile or anti-marketing hook. Tell them to scroll away or that they aren't ready for this truth.
Slide 2 — THE SETUP (Specificity): The exact stakes, numbers, dates, and names.
Slide 3 — SENSORY DEPRIVATION: Image prompt MUST be "Pitch black screen, absolute darkness." The moment things go completely wrong or a dark secret is revealed.
Slide 4 — THE CRAZY TRUTH (Bhayanaka/Tension): The insane twist happens visually and audibly.
Slide 5 — THE EXPLANATION (Figures of Speech): Explain why/how in plain, punchy English using vivid metaphors or antithesis.
Slide 6 — THE COMPLETE PAYOFF & LOOP (Adbhuta/Wonder): You MUST reveal the complete, final, and satisfying outcome of the story. Absolutely NO cliffhangers, NO "But wait, there's more", and NO unresolved teases. The story MUST be 100% finished. Then, simply write a final sentence that grammatically connects directly to the first sentence of Slide 1 to create an infinite loop. No subscribe CTA.`;
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
