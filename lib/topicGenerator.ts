// Path: lib/topicGenerator.ts
import { z } from 'zod';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { query } from './database';
import { SlideshowScript } from './types';
import { validateAllCaptions } from './captionValidator';
import {
  GEMINI_TEXT_MODEL,
  GEMINI_QUALITY_GATE_MODEL,
  MUSIC_ATTRIBUTION,
  AESTHETICS,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  QUALITY_GATE_MAX_RETRIES,
  CAPTION_MAX_CHARS,
  CAPTION_MAX_CHARS_PER_LINE,
} from './constants';

function getTextClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

const SlideSchema = z.object({
  text: z.string().refine(
    val => val.length <= CAPTION_MAX_CHARS && /[.!?]$/.test(val.trimEnd()),
    { message: `Slide text must be ≤${CAPTION_MAX_CHARS} chars and end with punctuation (. ! ?)` },
  ),
  image_prompt: z.string(),
  audio_tag: z.string().optional().transform(val => {
    if (!val) return '[serious]';
    const v = val.trim();
    return v.startsWith('[') && v.endsWith(']') ? v : `[${v}]`;
  }),
});

const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string(),
    source: z.string(),
  })).min(1),
  visual_world: z.string(),
  title: z.string().max(100),
  description: z.string(),
  tags: z.array(z.string()).min(5).max(12),
  slides: z.array(SlideSchema).min(6).max(6),
  thumbnailPrompt: z.string(),
});

const QualityScoreSchema = z.object({
  hook_strength: z.number().min(0).max(10),
  factual_specificity: z.number().min(0).max(10),
  pacing: z.number().min(0).max(10),
  tone_calibration: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  issues: z.array(z.string()),
  approved: z.boolean(),
});

const GeminiScriptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    fact_check_and_sources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING },
          source: { type: Type.STRING },
        },
        required: ['claim', 'source'],
      },
    },
    visual_world: { type: Type.STRING },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
          audio_tag: { type: Type.STRING },
        },
        required: ['text', 'image_prompt', 'audio_tag'],
      },
    },
    thumbnailPrompt: { type: Type.STRING },
  },
  required: ['fact_check_and_sources', 'visual_world', 'title', 'description', 'tags', 'slides', 'thumbnailPrompt'],
};

type QualityScore = z.infer<typeof QualityScoreSchema>;

export async function generateTopics(niche: string): Promise<void> {
  const client = getTextClient();

  const pastTopicsRes = await query<{ topic: string }>(
    `SELECT topic FROM slideshow_topics WHERE niche = $1 ORDER BY used_at DESC NULLS LAST LIMIT 50`,
    [niche]
  );
  const pastTopics = pastTopicsRes.rows.map(r => r.topic);

  const prompt = `You are an expert content strategist for a YouTube Shorts channel in the "${niche}" niche.
Generate 20 completely unique, highly engaging, and viral video topics.

TOPIC QUALITY CRITERIA:
- The story has genuine global interest — someone from any country would find it fascinating
- It can be explained clearly in 60 seconds without specialist knowledge  
- It involves a real, verifiable, surprising fact or event
- It has strong visual potential (can be shown, not just told)
- For Geography: obscure borders, bizarre territories, geographical anomalies, and small or unusual countries are EXCELLENT.

DO NOT generate any of these previously used topics:
${pastTopics.length > 0 ? pastTopics.join('\n') : 'No past topics yet.'}

Output ONLY valid JSON in this format, no markdown:
{ "topics": ["topic 1", "topic 2", ...] }`;

  const response = await client.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.9,
    },
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini returned empty content for topic generation');

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse topic generation response');
  }

  for (const topic of parsed.topics || []) {
    await query(
      `INSERT INTO slideshow_topics (topic, niche) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [topic, niche]
    );
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

export function pickWeightedFormat(niche: string): string {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const weights = profile.formatWeights;
  const rand = Math.random();
  if (rand < weights.facts) return 'facts';
  if (rand < weights.facts + weights.story) return 'story';
  return 'quiz';
}

function getSystemPrompt(
  niche: string,
  format: string,
  aestheticInstruction: string,
  toneInstruction: string,
): string {
  const base = `You are a viral scriptwriter for a YouTube Shorts channel in the "${niche}" niche.

TONE MANDATE (critical — this overrides everything else about delivery):
${toneInstruction}

STORYTELLING MECHANICS:
1. COGNITIVE DISSONANCE HOOK: Slide 1 must present two facts that cannot logically coexist but do.
2. EMOTIONAL ARC: Tension built through exact FACTS, not adjectives.
3. EXTREME SPECIFICITY: NEVER use vague words like "many". Use exact numbers.
4. CLEAN ENDING: Every slide 6 must end with a complete, satisfying sentence. No fragments.

VISUAL WORLD MANDATE:
Before writing any slide, define a one-sentence "visual world" that describes the unified
aesthetic, lighting, and color palette that ALL six images must share.

FACT VERIFICATION MANDATE:
Every factual claim must be verifiable. Output sources as a structured array in "fact_check_and_sources".

CAPTION CONSTRAINT (HARD LIMIT):
Each slide's text MUST fit inside 3 rendering lines. You have a maximum of ${CAPTION_MAX_CHARS} characters TOTAL per slide. Do not exceed 10 words per slide. Be ruthless with word count. Slides 1+2 combined must read aloud in under 6 seconds.

IMAGE PROMPT RULES:
- Describe only the visual scene. No text in image, ever.
- Hyper-specific: exact lighting, weather, textures, camera angle.
- CONSISTENT AESTHETIC: ${aestheticInstruction}

Output ONLY valid JSON. No markdown. No code fences.`;

  let formatRules = '';

  if (format === 'quiz') {
    formatRules = `
SLIDE STRUCTURE — MCQ QUIZ (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook. No question mark.
Slide 2 — CLUE 1: An interesting hint. Audio: [curious].
Slide 3 — CLUE 2: Second hint. Build quiet tension.
Slide 4 — CLUE 3: More obvious hint.
Slide 5 — TENSION: One sentence raising stakes.
Slide 6 — REVEAL: Final answer and stunning context fact.`;

  } else if (format === 'facts') {
    formatRules = `
SLIDE STRUCTURE — TOP FACTS (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook.
Slide 2 — FACT 3: Zoom in on specific detail. Audio: [curious].
Slide 3 — SECRET: A hidden layer.
Slide 4 — FACT 2: Weirder fact.
Slide 5 — FACT 1: The most surprising fact.
Slide 6 — PAYOFF: Final resolution. No unresolved threads.`;

  } else {
    formatRules = `
SLIDE STRUCTURE — STORY (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook.
Slide 2 — SETUP: Exact stakes, numbers, dates. Audio: [curious].
Slide 3 — TURNING POINT: Secret revealed.
Slide 4 — THE TRUTH: Twist happens visually and narratively.
Slide 5 — EXPLANATION: Why/how — punchy English. No jargon.
Slide 6 — COMPLETE PAYOFF: Resolve story. The last word must end with a full stop.`;
  }

  return base + '\n\n' + formatRules;
}

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

async function scoreScript(
  script: z.infer<typeof SlideshowScriptSchema>,
  niche: string,
  minScore: number,
): Promise<QualityScore> {
  const client = getTextClient();

  const prompt = `You are a quality controller for a ${niche} YouTube Shorts channel.
Score this script on 4 dimensions (0–10 each) and decide if it should be approved.

SCRIPT TO EVALUATE:
${JSON.stringify({ title: script.title, slides: script.slides.map(s => s.text) }, null, 2)}

SCORING RUBRIC:
- hook_strength (0-10): Does Slide 1 create genuine cognitive dissonance without being melodramatic?
- factual_specificity (0-10): Exact numbers, dates, names?
- pacing (0-10): Do slides flow fast and naturally?
- tone_calibration (0-10): Calm and authoritative (10) or theatrical/sensationalist (0)?

Output ONLY valid JSON, no markdown:
{
  "hook_strength": number,
  "factual_specificity": number,
  "pacing": number,
  "tone_calibration": number,
  "overall": number,
  "issues": ["string"],
  "approved": boolean
}`;

  const response = await client.models.generateContent({
    model: GEMINI_QUALITY_GATE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  const raw = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Quality gate returned empty response');

  const parsed = JSON.parse(raw);
  return QualityScoreSchema.parse(parsed);
}

export async function generateScript(
  topic: string,
  format: string,
  niche: string,
): Promise<SlideshowScript> {
  const client = getTextClient();

  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];
  const toneInstruction = profile.toneInstruction;
  const minQualityScore = profile.minQualityScore;

  const systemPrompt = getSystemPrompt(niche, format, aesthetic.instruction, toneInstruction);

  let lastScore: QualityScore | null = null;

  for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
    const userContent = attempt === 0
      ? `Write a viral YouTube Shorts script about this ${niche} topic: ${topic}`
      : `Write a viral YouTube Shorts script about this ${niche} topic: ${topic}\n\nCRITICAL — Fix these issues from the previous attempt:\n${lastScore!.issues.map(i => `- ${i}`).join('\n')}`;

    const response = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: GeminiScriptSchema,
        temperature: attempt === 0 ? 0.85 : 0.75,
      },
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Gemini returned empty content for script');

    let parsed: unknown;
    try {
      let cleanRaw = raw.trim();
      if (cleanRaw.startsWith('```')) {
        cleanRaw = cleanRaw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      const bracketMatch = cleanRaw.match(/\{[\s\S]*\}/);
      if (bracketMatch) cleanRaw = bracketMatch[0];
      parsed = JSON.parse(cleanRaw);
    } catch (err: any) {
      throw new Error(`Parse Error: ${err.message}.`);
    }

    parsed = normalizeFieldNames(parsed);

    let validated: z.infer<typeof SlideshowScriptSchema>;
    try {
      validated = SlideshowScriptSchema.parse(parsed);
    } catch (zodErr) {
      if (zodErr instanceof z.ZodError) {
        const issues = zodErr.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        if (attempt < QUALITY_GATE_MAX_RETRIES) {
          lastScore = { issues, approved: false } as QualityScore;
          continue;
        }
        throw new Error(`Script validation failed:\n${issues.join('\n')}`);
      }
      throw zodErr;
    }

    // --- NEW: In-loop Caption Validation ---
    const captionValidation = validateAllCaptions(validated.slides);
    if (!captionValidation.valid) {
      if (attempt < QUALITY_GATE_MAX_RETRIES) {
        console.warn(`[TopicGenerator] Caption validation failed (attempt ${attempt + 1}), forcing rewrite. Issues:`, captionValidation.errors);
        lastScore = { issues: captionValidation.errors, approved: false } as QualityScore;
        continue;
      }
      throw new Error(`Caption validation failed after all retries:\n${captionValidation.errors.join('\n')}`);
    }

    try {
      const score = await scoreScript(validated, niche, minQualityScore);
      if (score.approved || attempt === QUALITY_GATE_MAX_RETRIES) {
        return {
          ...validated,
          fact_check_and_sources: validated.fact_check_and_sources
            .map(f => `${f.claim} → ${f.source}`)
            .join('\n'),
          format,
          description: `${validated.description}\n\n[Aesthetic: ${aesthetic.id}]\n\n${MUSIC_ATTRIBUTION}`,
          slides: validated.slides.map(slide => ({
            ...slide,
            image_prompt: `${aesthetic.imagePrefix}${slide.image_prompt} | Visual world: ${validated.visual_world} | Avoid: ${aesthetic.imageNegative}`,
          })),
          thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt} | Avoid: ${aesthetic.imageNegative}`,
        };
      }
      lastScore = score;
    } catch (gateErr) {
      break;
    }
  }
  throw new Error('Script generation failed after all retries');
}