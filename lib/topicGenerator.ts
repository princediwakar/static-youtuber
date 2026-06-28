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
  CAPTION_MAX_CHARS,
  CAPTION_MAX_CHARS_PER_LINE,
  FORMAT_TEMPLATE_WEIGHTS,
  TEMPLATE_SHOT_COUNTS,
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
  // caption_text: strips pacing punctuation for clean on-screen display
  const spoken = data.raw_text;
  const caption = data.raw_text.replace(/[,—]/g, '').trim();
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
  shots: z.array(ShotSchema).min(12).max(18),
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
Your job is to write a highly compelling, fact-dense, 200-220 word narrative script.

TONE MANDATE:
${toneInstruction}

STORYTELLING RULES:
1. Ground everything in reality. You have been provided with specific "Research Context". Use the exact dates, names, and numbers provided. Do not hallucinate.
2. Hook them instantly. The first sentence must present a jarring fact or cognitive dissonance.
3. Build tension. Use transition words. Let the story flow with cause and effect.
4. End with a devastating conclusion. The final sentence must recontextualize the whole story.
5. NO CTAs. No "subscribe", "like", or "thanks for watching".

OUTPUT:
Output pure prose. NO JSON. NO formatting. Just the story. Write for the human ear.`;

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

AUDIO PACING & TTS MANIPULATION (raw_text):
- TTS engines read punctuation as silence.
- Include commas (,) to force 200ms pauses ONLY where naturally appropriate (e.g., separating clauses, lists, or dramatic beats). NEVER place a comma between a subject and its verb.
  - BAD: "The disciplined man, uses the rubble..."
  - GOOD: "The disciplined man uses the rubble..."
- Use em-dashes (—) to force dramatic pauses before key facts.
- The final shot (is_conclusion: true) MUST end with a period (.), exclamation (!), or question mark (?). Never an em-dash.
- The on-screen caption will be derived automatically by stripping commas and em-dashes from raw_text. You do NOT need to provide a separate caption field.

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
// If a shot's raw_text has >12 words, split it into two shots at the midpoint.
// This keeps the LLM creative while TypeScript enforces the formatting constraints
// deterministically. If splitting exceeds 18 shots, merge the shortest adjacent pair.
function healShots(raw: any): any {
  const MAX_WORDS = 12;
  const MAX_SHOTS = 18;

  let shots: any[] = raw.shots ?? [];
  if (!Array.isArray(shots)) return raw;

  // Pass 1: split oversized shots
  const healed: any[] = [];
  for (const shot of shots) {
    const words: string[] = (shot.raw_text ?? '').split(/\s+/);
    if (words.length > MAX_WORDS) {
      const mid = Math.floor(words.length / 2);
      const firstHalf = words.slice(0, mid).join(' ');
      const secondHalf = words.slice(mid).join(' ');

      healed.push({
        ...shot,
        raw_text: firstHalf,
        is_conclusion: false,
      });
      healed.push({
        ...shot,
        raw_text: secondHalf,
        is_conclusion: shot.is_conclusion === true,
      });
    } else {
      healed.push(shot);
    }
  }

  // Pass 2: if splitting blew past the max, merge shortest adjacent pair
  while (healed.length > MAX_SHOTS) {
    let minIdx = 0;
    let minTotal = Infinity;
    for (let i = 0; i < healed.length - 1; i++) {
      const a = (healed[i].raw_text ?? '').split(/\s+/).length;
      const b = (healed[i + 1].raw_text ?? '').split(/\s+/).length;
      if (a + b < minTotal) {
        minTotal = a + b;
        minIdx = i;
      }
    }
    // Merge the pair
    const mergedRaw = [healed[minIdx].raw_text, healed[minIdx + 1].raw_text].filter(Boolean).join(' ');
    const merged = {
      ...healed[minIdx],
      raw_text: mergedRaw,
      is_conclusion: healed[minIdx + 1].is_conclusion === true || healed[minIdx].is_conclusion === true,
    };
    healed.splice(minIdx, 2, merged);
  }

  // Pass 3: re-index and ensure last shot is the conclusion
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

Output JSON:
{ "specificity": 0, "hook_strength": 0, "information_density": 0, "tone_calibration": 0, "pacing": 0, "visual_entropy": 0, "visual_coherence": 0, "overall": 0, "issues": ["string"], "approved": boolean }`;

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