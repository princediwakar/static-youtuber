// Path: lib/topicGenerator.ts
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { query } from './database';
import { SlideshowScript } from './types';
import {
  GEMINI_TEXT_MODEL,
  GEMINI_QUALITY_GATE_MODEL,
  MUSIC_ATTRIBUTION,
  AESTHETICS,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  QUALITY_GATE_MAX_RETRIES,
} from './constants';

// ─── Gemini client ─────────────────────────────────────────────────────────────
function getTextClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

// ─── Zod schema ───────────────────────────────────────────────────────────────
const SlideSchema = z.object({
  text: z.string().max(130), // ~16 words max, keeps captions to 2–3 lines
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
  })).min(1), // structured array instead of a single string — easier to verify
  visual_world: z.string(), // new: one-sentence visual continuity anchor
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
  tone_calibration: z.number().min(0).max(10), // new: penalise melodrama
  overall: z.number().min(0).max(10),
  issues: z.array(z.string()),
  approved: z.boolean(),
});

type QualityScore = z.infer<typeof QualityScoreSchema>;

// ─── Topic deduplication ─────────────────────────────────────────────────────

export async function generateTopics(niche: string): Promise<void> {
  const client = getTextClient();

  const pastTopicsRes = await query<{ topic: string }>(
    `SELECT topic FROM slideshow_topics WHERE niche = $1 ORDER BY used_at DESC NULLS LAST LIMIT 50`,
    [niche]
  );
  const pastTopics = pastTopicsRes.rows.map(r => r.topic);

  // Removed the "top 10 GDP countries only" restriction — replaced with a
  // quality/relevance filter that doesn't artificially cap geography content.
  const prompt = `You are an expert content strategist for a YouTube Shorts channel in the "${niche}" niche.
Generate 20 completely unique, highly engaging, and viral video topics.

TOPIC QUALITY CRITERIA (use these instead of geographic restrictions):
- The story has genuine global interest — someone from any country would find it fascinating
- It can be explained clearly in 60 seconds without specialist knowledge  
- It involves a real, verifiable, surprising fact or event
- It has strong visual potential (can be shown, not just told)
- For Geography: obscure borders, bizarre territories, geographical anomalies, and small or unusual countries are EXCELLENT — don't restrict to large countries

DO NOT generate any of these previously used topics (or anything too similar):
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

// ─── Format-weighted selection ────────────────────────────────────────────────

export function pickWeightedFormat(niche: string): string {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const weights = profile.formatWeights;
  const rand = Math.random();
  if (rand < weights.facts) return 'facts';
  if (rand < weights.facts + weights.story) return 'story';
  return 'quiz';
}

// ─── System prompt factory ─────────────────────────────────────────────────────

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
   State it as a bizarre anomaly. Do NOT ask a question. Do NOT use the words "mind-blowing" or "insane".
2. EMOTIONAL ARC:
   - Wonder/Awe: Opening hook and final reveal
   - Tension: Middle slides — raise the stakes through FACTS, not adjectives
3. EXTREME SPECIFICITY: NEVER use vague words like "many" or "a long time".
   ALWAYS use exact numbers ("47 tons", "800 meters", "1962").
4. THE LOOP (facts and quiz formats only): The final sentence of Slide 6 must be a
   grammatical fragment that connects directly to the first word of Slide 1.
   For STORY format: end with a clean, satisfying payoff. NO cliffhangers. NO loop required.

VISUAL WORLD MANDATE (critical for image continuity):
Before writing any slide, define a one-sentence "visual world" that describes the unified
aesthetic, lighting, and color palette that ALL six images must share. Then write every
image_prompt as if it's a shot from inside that world. Include this in the "visual_world" field.

FACT VERIFICATION MANDATE:
Every factual claim must be verifiable. Output sources as a structured array in
"fact_check_and_sources" — each entry has a "claim" field and a "source" field.
Never present fabricated stories as real events.

AUDIO TAGS: Use these sparingly from the slide's audio_tag field:
[serious], [curious], [amazed], [whispers], [intense]
The tag sets the delivery for the entire slide. Default is [serious].
Do NOT stack multiple tags or overuse [intense] — most slides should be [serious] or [curious].

Output ONLY valid JSON. No markdown. No code fences. No trailing commas.

Schema:
{
  "fact_check_and_sources": [{"claim": "string", "source": "string"}],
  "visual_world": "string (one sentence describing the unified visual aesthetic for all 6 slides)",
  "title": "string (max 100 chars)",
  "description": "string",
  "tags": ["string"],
  "slides": [
    {
      "text": "string (narration, max 16 words)",
      "image_prompt": "string (visual scene description — no text in image, consistent with visual_world)",
      "audio_tag": "string (e.g. [serious], [curious], [amazed])"
    }
  ],
  "thumbnailPrompt": "string"
}

VIRAL PACING: Slides 1+2 combined must read aloud in under 6 seconds. Each slide reads in 3–4 seconds. Be ruthless with word count. No slide over 16 words.

IMAGE PROMPT RULES:
- Describe only the visual scene. No text in image, ever.
- Hyper-specific: exact lighting, weather, textures, camera angle.
- CONSISTENT AESTHETIC: ${aestheticInstruction}
- NEGATIVE: avoid text, watermarks, logos, cluttered compositions.
- Slide 1: Wide establishing shot of the subject.
- Slide 2: Zoom into a rare, specific historical detail or mechanism.
- Slide 6: Wide, breathtaking resolution shot.
- TAGS: include #shorts and 4 specific niche tags.`;

  let formatRules = '';

  if (format === 'quiz') {
    formatRules = `
SLIDE STRUCTURE — MCQ QUIZ (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook. No question mark. Present the anomaly.
Slide 2 — CLUE 1: An interesting, slightly obscure hint. Audio: [curious].
Slide 3 — CLUE 2: Second hint. Build quiet tension.
Slide 4 — CLUE 3: More obvious hint. Maintain calm.
Slide 5 — TENSION: One sentence that raises the stakes through facts.
Slide 6 — REVEAL + LOOP: Reveal the answer fully. One stunning context fact.
           End with a fragment that grammatically leads into the first word of Slide 1.`;

  } else if (format === 'facts') {
    formatRules = `
SLIDE STRUCTURE — TOP FACTS (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook. No question mark.
Slide 2 — FACT 3: Interesting but not the wildest. Zoom in on a specific detail. Audio: [curious].
Slide 3 — SECRET: A dark or hidden layer of Fact 3. Narrator is quiet, not dramatic.
Slide 4 — FACT 2: Weirder fact. Let the specificity do the work.
Slide 5 — FACT 1: The most surprising fact. One sentence. Let it land.
Slide 6 — PAYOFF + LOOP: Final resolution. Full payoff — no unresolved threads.
           End with a fragment that grammatically leads into the first word of Slide 1.`;

  } else {
    // story — NO mandatory loop, clean ending required
    formatRules = `
SLIDE STRUCTURE — STORY (6 slides):
Slide 1 — HOOK: Cognitive dissonance hook. Extreme curiosity gap. No question mark.
Slide 2 — SETUP: Exact stakes, numbers, dates, names. Zoom into a rare detail. Audio: [curious].
Slide 3 — TURNING POINT: The moment things go wrong or a secret is revealed.
Slide 4 — THE TRUTH: The twist happens visually and narratively.
Slide 5 — EXPLANATION: Why/how — plain, punchy English. No jargon.
Slide 6 — COMPLETE PAYOFF: The full, final, satisfying outcome of the story.
           ABSOLUTELY NO cliffhangers. The story must be 100% resolved.
           Do NOT add a loop fragment — end cleanly.`;
  }

  return base + '\n\n' + formatRules;
}

// ─── Normalise LLM field names ─────────────────────────────────────────────────

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

// ─── Script quality gate ──────────────────────────────────────────────────────

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
- factual_specificity (0-10): Are exact numbers, dates, and names used? Zero vague words like "many"?
- pacing (0-10): Do slides 1+2 feel fast? Does each slide flow naturally to the next?
- tone_calibration (0-10): Is the language calm and authoritative (10) or theatrical/sensationalist (0)?
  Penalise: "mind-blowing", "insane", "you won't believe", excessive drama, cliffhanger on story format.

- overall: average of the four scores (calculated by you)
- issues: list specific problems as strings (empty array if none)
- approved: true if overall >= ${minScore}, false otherwise

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

// ─── Script generation (with quality gate + retry) ────────────────────────────

export async function generateScript(
  topic: string,
  format: string,
  niche: string,
): Promise<SlideshowScript> {
  const client = getTextClient();

  // Resolve niche profile → locked aesthetic + tone + quality threshold
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];
  const toneInstruction = profile.toneInstruction;
  const minQualityScore = profile.minQualityScore;

  console.log(`[TopicGenerator] Niche: "${niche}" → Aesthetic: ${aesthetic.id}`);

  const systemPrompt = getSystemPrompt(niche, format, aesthetic.instruction, toneInstruction);

  let lastScore: QualityScore | null = null;

  for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[TopicGenerator] Retry ${attempt}/${QUALITY_GATE_MAX_RETRIES} — issues: ${lastScore?.issues.join(', ')}`);
    }

    // Build user prompt — on retries, include the issues from the last attempt
    const userContent = attempt === 0
      ? `Write a viral YouTube Shorts script about this ${niche} topic: ${topic}`
      : `Write a viral YouTube Shorts script about this ${niche} topic: ${topic}

CRITICAL — Fix these issues from the previous attempt:
${lastScore!.issues.map(i => `- ${i}`).join('\n')}`;

    const response = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: attempt === 0 ? 0.85 : 0.75, // slightly lower temp on retries
      },
    });

    if (!response.candidates?.[0]) throw new Error('Gemini returned no candidates');

    const raw = response.candidates[0].content?.parts?.[0]?.text;
    if (!raw) throw new Error('Gemini returned empty content for script');

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
      throw new Error(`Gemini output is not valid JSON. Parse Error: ${err.message}. Raw: ${raw.substring(0, 200)}`);
    }

    parsed = normalizeFieldNames(parsed);
    const validated = SlideshowScriptSchema.parse(parsed);

    // ── Quality gate ──────────────────────────────────────────────────────────
    try {
      const score = await scoreScript(validated, niche, minQualityScore);
      console.log(`[QualityGate] Attempt ${attempt + 1}: overall=${score.overall.toFixed(1)}, approved=${score.approved}`);

      if (score.approved || attempt === QUALITY_GATE_MAX_RETRIES) {
        if (!score.approved) {
          console.warn(`[QualityGate] Max retries reached — publishing best effort (score: ${score.overall.toFixed(1)})`);
        }

        // ── Assemble final script ─────────────────────────────────────────────
        return {
          ...validated,
          // Flatten fact_check_and_sources back to a readable string for storage
          fact_check_and_sources: validated.fact_check_and_sources
            .map(f => `${f.claim} → ${f.source}`)
            .join('\n'),
          format,
          description: `${validated.description}\n\n[Aesthetic: ${aesthetic.id}]\n\n${MUSIC_ATTRIBUTION}`,
          slides: validated.slides.map(slide => ({
            ...slide,
            // Visual world prefix anchors continuity; aesthetic prefix sets style
            image_prompt: `${aesthetic.imagePrefix}${slide.image_prompt} | Visual world: ${validated.visual_world} | Avoid: ${aesthetic.imageNegative}`,
          })),
          thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt} | Avoid: ${aesthetic.imageNegative}`,
        };
      }

      lastScore = score;
    } catch (gateErr) {
      // If the quality gate itself fails, don't block publishing
      console.warn(`[QualityGate] Scoring failed (attempt ${attempt + 1}):`, gateErr);
      break;
    }
  }

  throw new Error('Script generation failed after all retries');
}