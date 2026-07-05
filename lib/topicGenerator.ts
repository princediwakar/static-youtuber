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
} from './constants';
import type { FormatTemplate } from './constants';

const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(30, 'Image prompt must be at least 30 characters')
    .max(600, 'Image prompt must be ≤600 chars'),
  caption_text: z.string()
    .refine(t => t.trim().split(/\s+/).length >= 1, 'Min 1 word')
    .refine(t => t.trim().split(/\s+/).length <= 18, 'Max 18 words')
    .refine(t => !/\[.*?\]/.test(t), 'No director tags in text'),
  spoken_text: z.string()
    .min(1, 'Must contain spoken phonetic text for TTS'),
  is_conclusion: z.boolean().default(false),
});

const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10),
    source: z.string().min(5),
  })).min(3),
  visual_world: z.enum(['tech-minimalist', 'finance-editorial', 'stoic-zen', 'survival-technical']),
  format_template: z.enum(['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST']),
  title: z.string().min(5).max(100),
  description: z.string().min(30).max(500),
  tags: z.array(z.string()).min(5).max(12),
  voiceName: z.string().min(1),
  shots: z.array(ShotSchema).min(12).max(25),
  thumbnailPrompt: z.string().min(30).max(500),
}).refine(data => data.shots.filter(s => s.is_conclusion).length === 1, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => data.shots[data.shots.length - 1].is_conclusion, {
  message: 'The conclusion shot must be the last shot',
}).refine(data => /[.!?]$/.test(data.shots[data.shots.length - 1].spoken_text.trim()), {
  message: 'The final shot must end with terminal punctuation (. ! ?)',
});;

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
Your job is to write a highly compelling, fact-dense narrative script for a YouTube Short.

LENGTH MANDATE (CRITICAL):
- ABSOLUTE MAXIMUM OF 125 WORDS.
- If you write 126 words, the video will exceed 60 seconds and fail completely. Cut the filler.

CONTENT POLICY (STRICT):
- Do NOT describe graphic violence, gore, exposed internal anatomy, or visceral bodily trauma. 
- You must build tension psychologically. Focus on the situation, the ticking clock, and the stakes, NOT the physical blood.

TONE MANDATE:
${toneInstruction}

STORYTELLING RULES:
1. Ground everything in reality. Use the exact dates, names, and numbers provided.
2. Hook them instantly. The first sentence must present a jarring fact or cognitive dissonance.
3. Build tension. Use transition words. Let the story flow with cause and effect.
4. End with a devastating conclusion. The final sentence must recontextualize the whole story.
5. NO CTAs. No "subscribe", "like", or "thanks for watching".

PACING & SYNTAX (CRITICAL):
- Write strictly in short, punchy sentences.
- NO sentence may exceed 15 words.
- Avoid compound sentences with multiple clauses. Use periods heavily.

FORMATTING:
- Use digits, symbols, and abbreviations for numbers (e.g., "$1.4B" instead of "one point four billion dollars", "26", "100%") to keep the text visually concise.

CAPTION READABILITY:
- Write for the ear AND the eye. Subject → verb → object. Clean and direct.

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
  formatTemplate: FormatTemplate,
  validationFeedback?: string,
): Promise<unknown> {
  const shotCounts = TEMPLATE_SHOT_COUNTS[formatTemplate];
  
  const systemPrompt = `You are a precision video editor and audio engineer.
Your job is to take a completed narrative script and slice it into exactly ${shotCounts.min}-${shotCounts.max} shots, formatted as strict JSON.

FORMAT: ${formatTemplate}
VISUAL WORLD: ${niche === 'Financial Forensics' ? 'finance-editorial' : niche === 'Stoic Philosophy' ? 'stoic-zen' : niche === 'Urban Survival' ? 'survival-technical' : 'tech-minimalist'}

DUAL-TEXT MANDATE (CRITICAL):
Each shot has TWO text fields for different modalities:

1. "caption_text" — The visually punchy, abbreviated text burned onto the screen via FFMPEG.
   - VERBATIM SLICING ONLY: Do NOT rewrite, paraphrase, summarize, or alter the formatting of the narrative.
   - WORD LIMIT: No shot may contain more than 12 words.
   - If a sentence is long, SPLIT it across multiple consecutive shots. Do NOT summarize it to fit.
   - Keep symbols and abbreviations as-is from the narrative (e.g., "$1.4B", "26%", "CEO").
   - This is what the viewer reads on screen — short, scannable, punchy.

2. "spoken_text" — The phonetically expanded version of the caption, fed to F5-TTS for voiceover and to Whisper for timestamp alignment.
   - Expand ALL abbreviations, symbols, and shorthand into full phonetic words.
   - "$1.4B" → "one point four billion dollars"
   - "26%" → "twenty six percent"
   - "reCAPTCHA" → "re captcha"
   - "CEO" → "C E O"
   - "Duolingo" → "duo lingo"
   - "$6.5 billion" → "six point five billion dollars"
   - "500M" → "five hundred million"
   - "Luis von Ahn" → "lweece von ahn" (keep as proper name)
   - If the caption text is already phonetic, spoken_text equals caption_text.
   - spoken_text is what TTS will say and Whisper will hear — it MUST phonetically match the audio exactly.

VOICE SELECTION — Choose the voiceName that best matches the niche's tone:
- morgan-freeman-your-inner-voice: Deep, warm, gravelly, authoritative narration. Wise, calm, memorable. Rich bass tones, highly storytelling-oriented.
- mallory-handford-american-female: Bright, conversational, friendly girl-next-door American female. Compelling, versatile, modern.
- melissa-harlow-american-female: Conversational, natural, energetic American female. Warm, relatable, good for narration and explainers.
- jon-british-male: Professional, clear, experienced British male. Polished, versatile narration.
- kylie-hinze-american-female: Friendly, upbeat, energetic girl-next-door American female. Cheerful, youthful, positive.
- kelli-winkler-american-female: Professional American female with radio/broadcasting background. Warm, clear, conversational.
- phil-freeman-american-male: Deep, rich, authoritative, dramatic, versatile American male. Strong bass tones, great for corporate, gritty, storytelling.
- dee-smith-american-male: Dynamic, energetic, professional African American male. Versatile, conversational, commercial-friendly.

VISUAL AESTHETIC (FLUX.1):
You must write a scene description that fits this visual world: ${aestheticInstruction}
- Write a highly descriptive paragraph using natural language describing the specific scene.
- KINETIC ENERGY MANDATE: You MUST change the visual prompt for EVERY SINGLE SHOT. Change angles, lighting, or focus. 
- NEVER COPY-PASTE VISUAL PROMPTS BETWEEN SHOTS. 
- CRITICAL: The environment must have NO written words, NO signs, and NO text of any kind.

CENSORSHIP & NSFW GUARDRAILS (ZERO TOLERANCE):
- FORBIDDEN WORDS: blood, bloody, wound, severed, arterial, flesh, visceral, raw, bare chest, corpse, dead, murder.
- Focus on the gear, the environment, and the urgency. Keep anatomy out of frame or completely obscured in darkness.

JSON SCHEMA TO FOLLOW:
{
  "fact_check_and_sources": [
    { "claim": "Exact fact 1", "source": "Source context 1" }
  ],
  "visual_world": "MUST EXACTLY MATCH THE VISUAL WORLD SPECIFIED ABOVE",
  "format_template": "${formatTemplate}",
  "voiceName": "pick the best match from the voice catalog above",
  "title": "5-100 chars, no period",
  "description": "Video description",
  "tags": ["lowercase", "hyphenated"],
  "shots": [
    {
      "id": 1,
      "visual_prompt": "cinematic paragraph describing the scene... NO GORE. NO TEXT.",
      "caption_text": "The visually punchy, abbreviated text for the screen (e.g., '$6.5B').",
      "spoken_text": "The exact phonetic spelling for the voiceover and Whisper alignment (e.g., 'six point five billion dollars').",
      "is_conclusion": false
    }
  ],
  "thumbnailPrompt": "30-500 char thumbnail desc. STRICTLY PG-13. NO GORE."
}
Only the LAST shot must have is_conclusion: true.`;

  let userPrompt = `TOPIC: ${topic}
RESEARCH CONTEXT: ${researchContext}

NARRATIVE TO CHUNK:
${narrative}

Slice this narrative into the exact JSON schema.`;

  if (validationFeedback) {
    userPrompt += `\n\nPREVIOUS ATTEMPT VALIDATION ERRORS:\n${validationFeedback}\n\nCRITICAL FIX INSTRUCTIONS:\nTo fix character/word limit errors, DO NOT paraphrase, summarize, or delete words. Instead, SPLIT the long text across multiple consecutive shots. Maintain 100% verbatim text from the narrative.`;
  }

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.2, maxTokens: 4096, responseJson: true }
  );

  return extractJson(raw);
}



// ─── QUALITY GATE ────────────────────────────────────────────────────────────
async function scoreScript(
  script: z.infer<typeof SlideshowScriptSchema>,
  researchContext: string,
  niche: string,
  minScore: number,
): Promise<QualityScore> {
  const prompt = `You are the final quality controller for a ${niche} YouTube Shorts channel. 
Evaluate this script against the provided raw research data and strict safety policies.

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
- pacing (0-10): Will the natural punctuation flow well?
- visual_entropy (0-10): Are images varied?
- visual_coherence (0-10): Are images cohesive?
- caption_flow (0-10): If you read just the text in sequence, does it read smoothly?

CRITICAL CENSORSHIP CHECK:
If ANY visual_prompt contains explicit gore, blood, or visceral anatomy descriptions, you MUST score 'overall' as 0 and set 'approved' to false. State the exact trigger word in the 'issues' array.

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
    let validationFeedback = '';

    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      console.log(`[TopicGenerator] Running Pass 2 (Chunking), attempt ${attempt + 1}`);

      const parsed = await chunkScriptToJSON(
        narrative,
        reserved.topic,
        reserved.research_context,
        niche,
        aesthetic.instruction,
        formatTemplate,
        validationFeedback || undefined,
      );

      validationFeedback = '';

      let validated: z.infer<typeof SlideshowScriptSchema>;
      try {
        validated = SlideshowScriptSchema.parse(parsed);
      } catch (zodErr) {
        if (zodErr instanceof z.ZodError) {
          validationFeedback = zodErr.issues.map(i =>
            `${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`
          ).join('\n');
          if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
          throw new Error(`Script validation failed:\n${validationFeedback}`);
        }
        throw zodErr;
      }

      // Validate caption text for on-screen rendering constraints
      const captionValidation = validateAllCaptions(validated.shots.map(s => ({ caption_text: s.caption_text })));
      if (!captionValidation.valid) {
        validationFeedback = captionValidation.errors.join('\n');
        if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
        throw new Error(`Caption validation failed:\n${validationFeedback}`);
      }

      const score = await scoreScript(validated, reserved.research_context, niche, profile.minQualityScore);
      if (score.approved || attempt === QUALITY_GATE_MAX_RETRIES) {
        const hookWords = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ');
        const hook_intro = hookWords.replace(/[.!?:;,]/g, '');
        return {
          script: {
            title: validated.title,
            description: `${validated.description}`,
            visual_world: validated.visual_world,
            format_template: validated.format_template,
            voiceName: validated.voiceName,
            fact_check_and_sources: validated.fact_check_and_sources.map(f => `${f.claim} → ${f.source}`).join('\n'),
            tags: validated.tags,
            shots: validated.shots.map(shot => ({
              id: shot.id,
              visual_prompt: `${aesthetic.imagePrefix}Scene description: ${shot.visual_prompt}`,
              caption_text: shot.caption_text,
              spoken_text: shot.spoken_text,
              is_conclusion: shot.is_conclusion,
            })),
            thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt}`,
            hook_intro,
          },
          topic: reserved.topic,
        };
      }
      lastScore = score;
      validationFeedback = `Quality Gate Failed. Issues: ${score.issues.join(' | ')}`;
    }
    
    if (lastScore && !lastScore.approved) {
      throw new Error(`Script generation failed after all retries. Final LLM critique: ${lastScore.issues.join(' | ')}`);
    }
    throw new Error('Script generation failed after all retries (No score generated)');
  } catch (err) {
    await releaseTopic(reserved.id);
    throw err;
  }
}
