// lib/topicGenerator.ts
import { z } from 'zod';
import { chatCompletion, extractJson } from './deepseek';
import { query } from './database';
import { SlideshowScript } from './types';
import { validateAllCaptions } from './captionValidator';
import {
  AESTHETICS,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  QUALITY_GATE_MAX_RETRIES,
  FORMAT_TEMPLATE_WEIGHTS,
  TEMPLATE_SHOT_COUNTS,
  CAPTION_MAX_CHARS_PER_LINE,
  CAPTION_MAX_CHARS,
} from './constants';
import type { FormatTemplate } from './constants';

// Cleaned, single-source-of-truth schema
const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(30, 'Image prompt must be at least 30 characters')
    .max(600, 'Image prompt must be ≤600 chars'),
  text: z.string()
    .min(3, 'text must not be empty')
    .refine(t => !/\[.*?\]/.test(t), 'No director tags in text'),
  audio_instruction: z.enum(['[serious]', '[curious]', '[urgent]', '[measured]', '[grave]']).optional(),
  is_conclusion: z.boolean().default(false),
}).refine(data => data.text.split(' ').length <= 12, {
  message: 'Soft cap: 12 words max per shot',
}).refine(data => data.text.split(' ').length >= 3, {
  message: 'Min 3 words per shot',
}).refine(data => data.text.trim() === data.text, {
  message: 'No leading/trailing whitespace',
});

const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10),
    source: z.string().min(5),
  })).min(3),
  visual_world: z.enum(['vector', 'dossier', 'dark-cinematic', 'tactical']),
  format_template: z.enum(['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST']),
  title: z.string().min(5).max(100),
  description: z.string().min(30).max(500),
  tags: z.array(z.string()).min(5).max(12),
  shots: z.array(ShotSchema).min(12).max(25),
  thumbnailPrompt: z.string().min(30).max(500),
}).refine(data => data.shots.filter(s => s.is_conclusion).length === 1, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => data.shots[data.shots.length - 1].is_conclusion, {
  message: 'The conclusion shot must be the last shot',
});

const QualityScoreSchema = z.object({
  specificity: z.number().min(0).max(10),
  hook_strength: z.number().min(0).max(10),
  information_density: z.number().min(0).max(10),
  tone_calibration: z.number().min(0).max(10),
  pacing: z.number().min(0).max(10),
  visual_entropy: z.number().min(0).max(10),
  visual_coherence: z.number().min(0).max(10),
  caption_flow: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  issues: z.array(z.string()),
  approved: z.boolean(),
});
type QualityScore = z.infer<typeof QualityScoreSchema>;

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

export function pickFormatTemplate(niche: string): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST';
}

// ─── PASS 1: NARRATIVE GENERATION ─────────────────────────────────────────────
async function generateNarrative(topic: string, researchContext: string, toneInstruction: string): Promise<string> {
  const systemPrompt = `You are a master storyteller and investigative journalist.
Your job is to write a highly compelling, fact-dense, 150-170 word narrative script.

TONE MANDATE:
${toneInstruction}

STORYTELLING RULES:
1. Ground everything in reality. Use the exact dates, names, and numbers provided. Do not hallucinate.
2. Hook them instantly. The first sentence must present a jarring fact or cognitive dissonance.
3. Build tension. Use transition words. Let the story flow with cause and effect.
4. End with a devastating conclusion. The final sentence must recontextualize the whole story.
5. NO CTAs. No "subscribe", "like", or "thanks for watching".

CAPTION READABILITY:
- Every sentence is a visual unit. Keep them short — 8 to 14 words max. No run-ons.
- Write for the ear AND the eye. Break walls of text.
- Subject → verb → object. Clean and direct.

OUTPUT:
Output pure prose. NO JSON. NO formatting. Just the story.`;

  const userPrompt = `TOPIC: ${topic}\n\nRESEARCH CONTEXT (TREAT AS ABSOLUTE FACT):\n${researchContext}`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.7, maxTokens: 1024, responseJson: false }
  );

  if (!raw) throw new Error('Pass 1: DeepSeek returned empty narrative');
  return raw as string;
}

// ─── PASS 2: EDITOR / CHUNKING ────────────────────────────────────────────────
async function chunkScriptToJSON(
  narrative: string, 
  topic: string,
  researchContext: string,
  niche: string, 
  aestheticInstruction: string, 
  formatTemplate: FormatTemplate
): Promise<unknown> {
  const shotCounts = TEMPLATE_SHOT_COUNTS[formatTemplate];
  
  const systemPrompt = `You are a precision video editor and audio engineer.
Your job is to take a completed narrative script and slice it into exactly ${shotCounts.min}-${shotCounts.max} shots, formatted as strict JSON.

FORMAT: ${formatTemplate}
VISUAL WORLD: ${niche === 'Financial Forensics' ? 'dossier' : niche === 'Stoic Philosophy' ? 'dark-cinematic' : niche === 'Urban Survival' ? 'tactical' : 'vector'}

VOICEOVER & PACING (CRITICAL):
- You are writing a script for a professional voice actor.
- Write naturally for the ear. Use commas (,) and em-dashes (—) exactly where a human would naturally pause for breath or dramatic effect.
- Do not over-punctuate. If a sentence flows quickly, leave it bare. 
- TTS engines interpret punctuation as silence. Use this to your advantage to build tension before key facts.
- The on-screen captions will be generated directly from this text. Ensure each shot contains a complete, coherent micro-thought that makes sense visually on its own.
- The final shot (is_conclusion: true) MUST end with terminal punctuation (., !, or ?).
- Mid-sequence shots (is_conclusion: false) should ideally end at natural breath points (commas or mid-sentence flow) to pull the viewer into the next shot. Do not force periods at the end of every shot if the thought continues.

VISUAL PROMPTS (FLUX.1):
${aestheticInstruction}
- Write a highly descriptive, cinematic paragraph using natural language.
- Describe exactly what is in the frame, where it is located, and the specific lighting.
- CRITICAL: The image will have text overlaid on it later. You must explicitly describe the environment as having NO written words, NO signs, and NO text of any kind.

JSON SCHEMA TO FOLLOW:
{
  "fact_check_and_sources": [ { "claim": "fact", "source": "context" } ],
  "visual_world": "MUST EXACTLY MATCH THE VISUAL WORLD SPECIFIED ABOVE",
  "format_template": "${formatTemplate}",
  "title": "5-100 chars, no period",
  "description": "Video description",
  "tags": ["lowercase", "hyphenated"],
  "shots": [
    {
      "id": 1,
      "visual_prompt": "cinematic paragraph describing the scene...",
      "text": "The perfectly paced voiceover line. Use commas naturally.",
      "is_conclusion": false
    }
  ],
  "thumbnailPrompt": "30-500 char thumbnail desc"
}
Only the LAST shot must have is_conclusion: true.`;

  const userPrompt = `TOPIC: ${topic}
RESEARCH CONTEXT: ${researchContext}

NARRATIVE TO CHUNK:
${narrative}

Slice this narrative into the exact JSON schema.`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.2, maxTokens: 4096, responseJson: true }
  );

  return extractJson(raw);
}

// ─── SELF-HEALING SHOT MUTATOR ──────────────────────────────────────────────────
function countCaptionLines(text: string): number {
  const words = text.split(/\s+/);
  let lines = 0;
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > CAPTION_MAX_CHARS_PER_LINE) {
      if (current) lines++;
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines++;
  return lines;
}

function healShots(raw: any): any {
  const MAX_WORDS = 11;
  const MIN_WORDS = 3;
  const MAX_LINES = 3;

  let shots: any[] = raw.shots ?? [];
  if (!Array.isArray(shots)) return raw;

  function splitTextIntoValidChunks(text: string): string[] {
    const words = text.split(/\s+/);
    if (words.length === 0) return [];

    const chunks: string[][] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      const testChunk = [...currentChunk, word];
      const testText = testChunk.join(' ');

      const tooManyWords = testChunk.length > MAX_WORDS;
      const tooManyChars = testText.length > CAPTION_MAX_CHARS;
      const tooManyLines = countCaptionLines(testText) > MAX_LINES;

      if (tooManyWords || tooManyChars || tooManyLines) {
        if (currentChunk.length > 0) chunks.push(currentChunk);
        currentChunk = [word];
      } else {
        currentChunk = testChunk;
      }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    for (let i = chunks.length - 1; i > 0; i--) {
      if (chunks[i].length < MIN_WORDS) {
        const combined = [...chunks[i - 1], ...chunks[i]];
        const mid = Math.floor(combined.length / 2);

        chunks[i - 1] = combined.slice(0, mid);
        chunks[i] = combined.slice(mid);
      }
    }

    return chunks.map(c => c.join(' '));
  }

  const healed: any[] = [];

  for (const shot of shots) {
    const text = (shot.text ?? '').trim();

    if (text.split(/\s+/).length <= MAX_WORDS && text.length <= CAPTION_MAX_CHARS && countCaptionLines(text) <= MAX_LINES) {
      healed.push(shot);
    } else {
      const validChunks = splitTextIntoValidChunks(text);

      for (let i = 0; i < validChunks.length; i++) {
        healed.push({
          ...shot,
          text: validChunks[i],
          is_conclusion: false,
        });
      }
      healed[healed.length - 1].is_conclusion = shot.is_conclusion === true;
    }
  }

  for (let i = healed.length - 1; i >= 0; i--) {
    const words = healed[i].text.split(/\s+/);
    if (words.length < MIN_WORDS) {
      if (i > 0) {
        const combinedText = `${healed[i - 1].text} ${healed[i].text}`;
        if (combinedText.length <= CAPTION_MAX_CHARS && countCaptionLines(combinedText) <= MAX_LINES) {
          healed[i - 1].text = combinedText;
          healed[i - 1].is_conclusion = healed[i].is_conclusion || healed[i - 1].is_conclusion;
          healed.splice(i, 1);
        }
      }
    }
  }

  healed.forEach((s, i) => {
    s.id = i + 1;
    s.is_conclusion = i === healed.length - 1;
  });

  return { ...raw, shots: healed };
}

// ─── QUALITY GATE ────────────────────────────────────────────────────────────
async function scoreScript(
  script: z.infer<typeof SlideshowScriptSchema>,
  researchContext: string,
  niche: string,
  minScore: number,
): Promise<QualityScore> {
  const prompt = `You are the final quality controller for a ${niche} YouTube Shorts channel. 
Evaluate this script against the provided raw research data.

RESEARCH CONTEXT (TRUTH):
${researchContext}

SCRIPT TO EVALUATE:
${JSON.stringify({
  shots: script.shots.map(s => ({ text: s.text, visual_prompt: s.visual_prompt }))
}, null, 2)}

SCORING RUBRIC (0-10):
- specificity (0-10): Are the exact dates, names, and numbers from the research context present?
- hook_strength (0-10): Is the first shot gripping?
- information_density (0-10): Does the story flow well without filler?
- tone_calibration (0-10): Does it match the niche tone?
- pacing (0-10): Will the natural punctuation flow well?
- visual_entropy (0-10): Are images varied?
- visual_coherence (0-10): Are images cohesive?
- caption_flow (0-10): If you read just the text in sequence, does it read smoothly?

Output JSON:
{ "specificity": 0, "hook_strength": 0, "information_density": 0, "tone_calibration": 0, "pacing": 0, "visual_entropy": 0, "visual_coherence": 0, "caption_flow": 0, "overall": 0, "issues": ["string"], "approved": boolean }`;

  const raw = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { temperature: 0.1, maxTokens: 2048, responseJson: true },
  );

  if (!raw) throw new Error('Quality gate returned empty response');
  return QualityScoreSchema.parse(extractJson(raw));
}

// ─── MAIN GENERATION PIPELINE ────────────────────────────────────────────────
export async function generateScript(
  niche: string,
  accountId: string,
): Promise<{ script: SlideshowScript; topic: string }> {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];
  const formatTemplate = pickFormatTemplate(niche);

  const reserved = await reserveTopic(niche, accountId);
  
  try {
    console.log(`[TopicGenerator] Running Pass 1 (Narrative) for topic: ${reserved.topic}`);
    const narrative = await generateNarrative(reserved.topic, reserved.research_context, profile.toneInstruction);

    let lastScore: QualityScore | null = null;
    
    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      console.log(`[TopicGenerator] Running Pass 2 (Chunking), attempt ${attempt + 1}`);
      
      const parsed = await chunkScriptToJSON(
        narrative,
        reserved.topic,
        reserved.research_context,
        niche,
        aesthetic.instruction,
        formatTemplate
      );

      const healed = healShots(parsed);

      let validated: z.infer<typeof SlideshowScriptSchema>;
      try {
        validated = SlideshowScriptSchema.parse(healed);
      } catch (zodErr) {
        if (zodErr instanceof z.ZodError) {
          if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
          throw new Error(`Script validation failed:\n${zodErr.issues.map(i => i.message).join('\n')}`);
        }
        throw zodErr;
      }

      const captionValidation = validateAllCaptions(validated.shots.map(s => ({ text: s.text })));
      if (!captionValidation.valid) {
        if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
        throw new Error(`Caption validation failed:\n${captionValidation.errors.join('\n')}`);
      }

      // NOTE: Removed the force-merge loop that destroyed caption boundaries. 
      // The viewer's ability to read the text overrides an arbitrary shot count.

      const score = await scoreScript(validated, reserved.research_context, niche, profile.minQualityScore);
      if (score.approved || attempt === QUALITY_GATE_MAX_RETRIES) {
        const hookWords = validated.shots[0].text.split(/\s+/).slice(0, 4).join(' ');
        const hook_intro = hookWords.replace(/[.!?:;,]/g, '');
        return {
          script: {
            title: validated.title,
            description: `${validated.description}\n\n[Aesthetic: ${aesthetic.id}]`,
            visual_world: validated.visual_world,
            format_template: validated.format_template,
            fact_check_and_sources: validated.fact_check_and_sources.map(f => `${f.claim} → ${f.source}`).join('\n'),
            tags: validated.tags,
            shots: validated.shots.map(shot => ({
              id: shot.id,
              visual_prompt: `${aesthetic.imagePrefix}${shot.visual_prompt} | Avoid: ${aesthetic.imageNegative}`,
              tts_text: shot.text,       // Passed to TTS engine
              caption_text: shot.text,   // Passed to Render engine (which strips punctuation dynamically)
              audio_instruction: shot.audio_instruction,
              is_conclusion: shot.is_conclusion,
            })),
            thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt} | Avoid: ${aesthetic.imageNegative}`,
            hook_intro,
          },
          topic: reserved.topic,
        };
      }
      lastScore = score;
    }
    // Now surfaces the exact LLM issues instead of failing silently.
    if (lastScore && !lastScore.approved) {
      throw new Error(`Script generation failed after all retries. Final LLM critique: ${lastScore.issues.join(' | ')}`);
    }
    throw new Error('Script generation failed after all retries (No score generated)');
  } catch (err) {
    await releaseTopic(reserved.id);
    throw err;
  }
}