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


const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(30, 'Image prompt must be at least 30 characters')
    .max(600, 'Image prompt must be ≤600 chars'),
  raw_text: z.string()
    .min(3, 'raw_text must not be empty')
    .refine(t => !/\[.*?\]/.test(t), 'No director tags in raw_text'),
  audio_instruction: z.enum(['[serious]', '[curious]', '[urgent]', '[measured]', '[grave]']).optional(),
  is_conclusion: z.boolean().default(false),
}).transform((data) => {
  // spoken_text: includes commas/em-dashes for TTS pacing
  // caption_text: strips pacing punctuation for clean on-screen display.
  // Non-conclusion shots also strip sentence-ending punctuation — the
  // sentence continues into the next shot and a period would look broken.
  const spoken = data.raw_text;
  let caption = data.raw_text.replace(/[,—]/g, '').trim();
  if (!data.is_conclusion) {
    caption = caption.replace(/[.!?]$/, '').trim();
  }
  return { ...data, spoken_text: spoken, caption_text: caption };
}).refine(data => data.caption_text.split(' ').length <= 12, {
  message: 'Soft cap: 12 words max per shot',
}).refine(data => data.caption_text.split(' ').length >= 3, {
  message: 'Min 3 words per shot',
}).refine(data => data.caption_text.trim() === data.caption_text, {
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
1. Ground everything in reality. You have been provided with specific "Research Context". Use the exact dates, names, and numbers provided. Do not hallucinate.
2. Hook them instantly. The first sentence must present a jarring fact or cognitive dissonance.
3. Build tension. Use transition words. Let the story flow with cause and effect.
4. End with a devastating conclusion. The final sentence must recontextualize the whole story.
5. NO CTAs. No "subscribe", "like", or "thanks for watching".

CAPTION READABILITY (these words appear on screen):
- Every sentence is a visual unit. Keep them short — 8 to 14 words max. No run-ons.
- Write for the ear AND the eye. If a sentence looks like a wall of text on a phone screen, break it.
- Avoid parentheticals and nested clauses. Subject → verb → object. Clean and direct.

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

CAPTION READABILITY (EVERYTHING BELOW IS CRITICAL):
- Each caption is displayed on screen for 3-5 seconds. The viewer must be able to read it in that time.
- Captions MUST read as coherent thought fragments. When read in sequence shot after shot, they must flow like natural speech. A viewer should never think "that looked broken."
- Never split a caption mid-clause unless it creates a deliberate dramatic cliffhanger. Prefer splitting at natural pause points: between sentences, between clauses, or after a comma/em-dash.
- Each caption should feel like a complete micro-statement — something that makes sense on its own while clearly leading into the next one.
- BAD split (mid-clause): "The engineers discovered that" / "the safety interlock had been removed"
- GOOD split (natural boundary): "The engineers discovered something horrifying" / "the safety interlock had been completely removed"

AUDIO PACING & TTS MANIPULATION (raw_text):
- TTS engines read punctuation as silence.
- Include commas (,) to force 200ms pauses ONLY where naturally appropriate (e.g., separating clauses, lists, or dramatic beats). NEVER place a comma between a subject and its verb.
  - BAD: "The disciplined man, uses the rubble..."
  - GOOD: "The disciplined man uses the rubble..."
- Use em-dashes (—) to force dramatic pauses before key facts.
- The final shot (is_conclusion: true) MUST end with a period (.), exclamation (!), or question mark (?).
- CRITICAL: All other shots (is_conclusion: false) must NOT end with ., !, or ?. End mid-thought — the caption will be displayed as a continuation, not a finished sentence. Use a comma, em-dash, or no punctuation at the end.
- The on-screen caption will be derived automatically by stripping commas, em-dashes, and sentence-ending punctuation from raw_text. You do NOT need to provide a separate caption field.

VISUAL PROMPTS (FLUX.1):
${aestheticInstruction}
- Write a highly descriptive, cinematic paragraph using natural language. FLUX.1 uses a T5 encoder; it understands spatial relationships (e.g., "in the foreground," "on the left") and complex sentences. DO NOT use comma-separated tags.
- Describe exactly what is in the frame, where it is located, and the specific lighting.
- CRITICAL: The image will have text overlaid on it later. You must explicitly describe the environment as having NO written words, NO signs, and NO text of any kind.

JSON SCHEMA TO FOLLOW:
{
  "fact_check_and_sources": [ { "claim": "fact", "source": "context" } ], // CRITICAL: MUST CONTAIN AT LEAST 3 ITEMS.
  "visual_world": "MUST EXACTLY MATCH THE VISUAL WORLD SPECIFIED ABOVE",
  "format_template": "${formatTemplate}",
  "title": "5-100 chars, no period",
  "description": "Video description",
  "tags": ["lowercase", "hyphenated"],
  "shots": [
    {
      "id": 1,
      "visual_prompt": "cinematic paragraph describing the scene...",
      "raw_text": "Text with commas and em-dashes for TTS pacing. The on-screen caption will be derived automatically from this.",
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
// Two-dimensional mutator: slices on word count AND character count simultaneously.
// Simulates word-wrapping to count rendered caption lines (mirrors captionValidator.ts).
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

// The caption validator enforces 80 chars total / 26 chars per line (max 3 lines).
// Zod enforces 3–12 words per shot. This mutator satisfies both constraints.
function healShots(raw: any): any {
  const MAX_WORDS = 11;  // Buffer for 12-word cap
  const MIN_WORDS = 3;    // Matches Zod minimum
  const MAX_LINES = 3;    // Caption render constraint — must not wrap to 4 lines

  let shots: any[] = raw.shots ?? [];
  if (!Array.isArray(shots)) return raw;

  // --- HELPER: 2D Text Partitioner ---
  function splitTextIntoValidChunks(text: string): string[] {
    const words = text.split(/\s+/);
    if (words.length === 0) return [];

    const chunks: string[][] = [];
    let currentChunk: string[] = [];

    // Pass 1: Greedy slice on Words, Chars, or rendered caption lines
    for (const word of words) {
      const testChunk = [...currentChunk, word];
      const testText = testChunk.join(' ');

      // Break if any caption constraint would be violated
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

    // Pass 2: Heal Orphans (Chunks with < 3 words)
    // Walk backward. If a chunk is too small, merge it with the previous
    // chunk and split them evenly to balance the load.
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
  // -----------------------------------

  const healed: any[] = [];

  for (const shot of shots) {
    const text = (shot.raw_text ?? '').trim();

    // If the text naturally passes all caption constraints, keep it.
    if (text.split(/\s+/).length <= MAX_WORDS && text.length <= CAPTION_MAX_CHARS && countCaptionLines(text) <= MAX_LINES) {
      healed.push(shot);
    } else {
      // Otherwise, run it through the 2D partitioner
      const validChunks = splitTextIntoValidChunks(text);

      for (let i = 0; i < validChunks.length; i++) {
        healed.push({
          ...shot,
          raw_text: validChunks[i],
          is_conclusion: false,
        });
      }
      // Restore conclusion to the final piece
      healed[healed.length - 1].is_conclusion = shot.is_conclusion === true;
    }
  }

  // Pass 3: Under-sized Shot Forward Merge (Edge Case)
  // If the LLM natively generated a 1-word shot, merge it forward or backward
  for (let i = healed.length - 1; i >= 0; i--) {
    const words = healed[i].raw_text.split(/\s+/);
    if (words.length < MIN_WORDS) {
      if (i > 0) {
        // Merge backward
        const combinedText = `${healed[i - 1].raw_text} ${healed[i].raw_text}`;
        // Only keep the merge if it doesn't break any caption constraint
        if (combinedText.length <= CAPTION_MAX_CHARS && countCaptionLines(combinedText) <= MAX_LINES) {
          healed[i - 1].raw_text = combinedText;
          healed[i - 1].is_conclusion = healed[i].is_conclusion || healed[i - 1].is_conclusion;
          healed.splice(i, 1);
        }
      }
    }
  }

  // Final Pass: Re-index IDs and ensure exactly one conclusion at the very end
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
  shots: script.shots.map(s => ({ caption_text: s.caption_text, spoken_text: s.spoken_text, visual_prompt: s.visual_prompt }))
}, null, 2)}

SCORING RUBRIC (0-10):
- specificity (0-10): Are the exact dates, names, and numbers from the research context present?
- hook_strength (0-10): Is the first shot gripping?
- information_density (0-10): Does the story flow well without filler?
- tone_calibration (0-10): Does it match the niche tone?
- pacing (0-10): Will the TTS delivery (spoken_text) sound natural with the punctuation?
- visual_entropy (0-10): Are images varied?
- visual_coherence (0-10): Are images cohesive?
- caption_flow (0-10): If you read just the captions in sequence, do they read as natural, coherent sentences? Are there any awkward mid-clause breaks? Does each caption lead smoothly into the next?

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

  // 1. Reserve Data
  const reserved = await reserveTopic(niche, accountId);
  
  try {
    // 2. Pass 1: Write the Narrative
    console.log(`[TopicGenerator] Running Pass 1 (Narrative) for topic: ${reserved.topic}`);
    const narrative = await generateNarrative(reserved.topic, reserved.research_context, profile.toneInstruction);

    // 3. Pass 2: Chunk to JSON (with retry logic)
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

      // Self-heal: split oversized shots, merge if >18, re-index — all in TypeScript
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

      const captionValidation = validateAllCaptions(validated.shots.map(s => ({ text: s.caption_text })));
      if (!captionValidation.valid) {
        if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
        throw new Error(`Caption validation failed:\n${captionValidation.errors.join('\n')}`);
      }

      // Enforce template shot count after healing (healShots can inflate count).
      // Merge shortest adjacent shots rather than retrying — LLM produces the
      // same narrative each time so retries would just fail identically.
      let shotCount = validated.shots.length;
      const { min: tcMin, max: tcMax } = TEMPLATE_SHOT_COUNTS[formatTemplate];
      while (shotCount > tcMax) {
        // Find the shortest adjacent pair and merge them
        let bestIdx = 0;
        let bestLen = Infinity;
        for (let i = 0; i < validated.shots.length - 1; i++) {
          const combinedLen = validated.shots[i].caption_text.length + validated.shots[i + 1].caption_text.length;
          if (combinedLen < bestLen) {
            bestLen = combinedLen;
            bestIdx = i;
          }
        }
        const a = validated.shots[bestIdx];
        const b = validated.shots[bestIdx + 1];
        const mergedRaw = `${a.raw_text} ${b.raw_text}`;
        const mergedCaption = mergedRaw.replace(/[,—]/g, '').trim();
        const captionFits = mergedCaption.length <= CAPTION_MAX_CHARS && countCaptionLines(mergedCaption) <= 3;
        if (!captionFits) {
          console.warn(`[TopicGenerator] Force-merged shots ${bestIdx + 1}-${bestIdx + 2} (combined caption exceeds limits)`);
        }
        validated.shots.splice(bestIdx, 2, {
          ...a,
          raw_text: mergedRaw,
          caption_text: mergedCaption,
        });
        shotCount = validated.shots.length;
      }
      if (shotCount < tcMin) {
        // Shouldn't happen often, but if we're below min, retry with LLM
        console.warn(`[TopicGenerator] Shot count ${shotCount} below template min [${tcMin}-${tcMax}], retrying...`);
        continue;
      }

      // Re-index after possible merges and re-derive derived fields
      validated.shots.forEach((s, i) => {
        s.id = i + 1;
        s.is_conclusion = i === validated.shots.length - 1;
        s.spoken_text = s.raw_text;
        let caption = s.raw_text.replace(/[,—]/g, '').trim();
        if (!s.is_conclusion) {
          caption = caption.replace(/[.!?]$/, '').trim();
        }
        s.caption_text = caption;
      });

      const score = await scoreScript(validated, reserved.research_context, niche, profile.minQualityScore);
      if (score.approved || attempt === QUALITY_GATE_MAX_RETRIES) {
        // Derive hook_intro deterministically: first 4 words of the first caption, no punctuation
        const hookWords = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ');
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
              tts_text: shot.spoken_text,     // derived from raw_text via Zod transform
              caption_text: shot.caption_text, // raw_text minus commas/em-dashes via Zod transform
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
    throw new Error('Script generation failed after all retries');
  } catch (err) {
    await releaseTopic(reserved.id);
    throw err;
  }
}