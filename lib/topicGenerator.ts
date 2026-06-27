// Path: lib/topicGenerator.ts
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

const BANNED_END_PUNCTUATION = ['.', '!', '?', ':', ';', ','];

const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(30, 'Image prompt must be at least 30 characters — describe lighting, camera angle, colors, textures')
    .max(600, 'Image prompt must be ≤600 chars')
    .refine(val => !/\btext\b/.test(val.toLowerCase()), {
      message: 'Image prompt must not contain the word "text" — no text in images',
    }),
  tts_text: z.string()
    .refine(t => !/\[.*?\]/.test(t), {
      message: 'tts_text must not contain audio director tags like [curious] — use the audio_instruction field instead',
    })
    .refine(t => t.split(' ').length <= 12, 'Soft cap: 12 words max per shot')
    .refine(t => t.split(' ').length >= 3, 'Min 3 words per shot')
    .refine(val => val.trim() === val, {
      message: 'Shot text must not have leading or trailing whitespace',
    }),
  audio_instruction: z.enum(['[serious]', '[curious]', '[urgent]', '[measured]', '[grave]']).optional(),
  is_conclusion: z.boolean().default(false),
});

const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10, 'Each fact claim must be at least 10 characters — write a full sentence'),
    source: z.string().min(5, 'Each source must be at least 5 characters — name the publication, study, or document'),
  })).min(3, 'At least 3 sourced factual claims required'),
  visual_world: z.enum(['vector', 'dossier', 'dark-cinematic', 'tactical']),
  format_template: z.enum(['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST']),
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(100, 'Title must be ≤100 chars')
    .refine(val => !val.endsWith('.'), 'Title must not end with a period'),
  description: z.string()
    .min(30, 'Description must be at least 30 characters')
    .max(500, 'Description must be ≤500 chars'),
  tags: z.array(z.string()
    .min(2, 'Each tag must be at least 2 characters')
    .max(30, 'Each tag must be ≤30 chars')
    .refine(val => val === val.toLowerCase(), 'Tags must be lowercase')
    .refine(val => !val.includes(' '), 'Tags must not contain spaces — use hyphens'),
  ).min(5).max(12),
  hook_intro: z.string()
    .min(3, 'hook_intro must be at least 3 characters')
    .max(40, 'hook_intro must be ≤40 chars')
    .refine(val => !BANNED_END_PUNCTUATION.some(p => val.trim().endsWith(p)), {
      message: 'hook_intro must not end with punctuation — it is the first words of shot 1',
    }),
  shots: z.array(ShotSchema).min(12, 'Minimum 12 shots required').max(18, 'Maximum 18 shots allowed'),
  thumbnailPrompt: z.string()
    .min(30, 'Thumbnail prompt must be at least 30 characters')
    .max(500, 'Thumbnail prompt must be ≤500 chars'),
}).refine(data => {
  const conclusionShots = data.shots.filter(s => s.is_conclusion);
  return conclusionShots.length === 1;
}, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => {
  const lastShot = data.shots[data.shots.length - 1];
  return lastShot.is_conclusion;
}, {
  message: 'The conclusion shot must be the last shot',
}).refine(data => {
  const lastShot = data.shots[data.shots.length - 1];
  const lastChar = lastShot.tts_text.trim().slice(-1);
  return ['.', '!', '?'].includes(lastChar);
}, {
  message: 'The conclusion shot must end with sentence-ending punctuation (. ! ?)',
}).refine(data => {
  const shot1Start = data.shots[0].tts_text.trim().toLowerCase();
  const hookIntro = data.hook_intro.trim().toLowerCase();
  return shot1Start.startsWith(hookIntro);
}, {
  message: 'hook_intro must be the exact first words of shot 1 tts_text',
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

export async function generateTopics(niche: string, accountId: string): Promise<void> {
  const pastTopicsRes = await query<{ topic: string }>(
    `SELECT topic FROM slideshow_topics WHERE niche = $1 AND account_id = $2 ORDER BY used_at DESC NULLS LAST LIMIT 50`,
    [niche, accountId]
  );
  const pastTopics = pastTopicsRes.rows.map(r => r.topic);

  const prompt = `You are an expert content strategist for a YouTube Shorts channel in the "${niche}" niche.
Generate 20 completely unique, highly engaging, and viral video topics.

TOPIC QUALITY CRITERIA:
- The story has genuine global interest — someone from any country would find it fascinating
- It can be explained clearly in 60 seconds without specialist knowledge
- It involves a real, verifiable, surprising fact or event
- It has strong visual potential (can be shown, not just told)
- For SaaS & AI Tools: specific automation workflows, tool comparisons, or business use cases. Name the exact tools (Make.com, Zapier, Notion AI, Claude, ChatGPT). Focus on concrete time/cost savings.
- For Financial Forensics: specific corporate collapses, fraud cases, market manipulations, or wealth psychology events. Include exact dollar amounts, dates, and the names of people involved.
- For Stoic Philosophy: specific Stoic principles, historical anecdotes about Marcus Aurelius/Seneca/Epictetus, or modern applications of Stoic practices. Focus on actionable wisdom, not abstract philosophy.
- For Urban Survival: specific emergency scenarios, gear recommendations with exact specs, tactical skills, or preparedness strategies. Focus on actionable, practical information — not fear-mongering.

DO NOT generate any of these previously used topics:
${pastTopics.length > 0 ? pastTopics.join('\n') : 'No past topics yet.'}

Output ONLY valid JSON. No markdown.
{ "topics": ["topic 1", "topic 2", ...] }`;

  const raw = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { temperature: 0.9, maxTokens: 2048, responseJson: true },
  );

  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object' || !('topics' in parsed)) {
    throw new Error('Topic generation response missing topics array');
  }

  for (const topic of (parsed as { topics: string[] }).topics || []) {
    await query(
      `INSERT INTO slideshow_topics (topic, niche, account_id) VALUES ($1, $2, $3) ON CONFLICT (topic, account_id) DO NOTHING`,
      [topic, niche, accountId]
    );
  }
}

export async function reserveTopic(niche: string, accountId: string): Promise<{ id: number; topic: string }> {
  let result = await query<{ id: number; topic: string }>(`
    UPDATE slideshow_topics
    SET used = TRUE, used_at = NOW()
    WHERE id = (
      SELECT id FROM slideshow_topics
      WHERE niche = $1 AND account_id = $2 AND used = FALSE
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, topic
  `, [niche, accountId]);

  if (result.rows.length === 0) {
    console.log(`[TopicGenerator] No unused topics for ${niche}/${accountId}, generating more...`);
    await generateTopics(niche, accountId);

    result = await query<{ id: number; topic: string }>(`
      UPDATE slideshow_topics
      SET used = TRUE, used_at = NOW()
      WHERE id = (
        SELECT id FROM slideshow_topics
        WHERE niche = $1 AND account_id = $2 AND used = FALSE
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, topic
    `, [niche, accountId]);

    if (result.rows.length === 0) throw new Error(`Failed to generate new topics for ${niche}/${accountId}`);
  }

  return result.rows[0];
}

export async function releaseTopic(id: number): Promise<void> {
  await query(
    `UPDATE slideshow_topics SET used = FALSE, used_at = NULL WHERE id = $1`,
    [id]
  );
}

export function pickFormatTemplate(niche: string): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST';
}

function getSystemPrompt(
  niche: string,
  aestheticInstruction: string,
  toneInstruction: string,
  formatTemplate: FormatTemplate,
): string {
  const shotCounts = TEMPLATE_SHOT_COUNTS[formatTemplate];

  const formatInstructions: Record<FormatTemplate, string> = {
    RAPID_FIRE: `FORMAT: RAPID_FIRE — ${shotCounts.min}-${shotCounts.max} shots.
- Dense, relentless facts. No transition words between shots.
- Each shot is a self-contained fact bomb. Cut directly from one to the next.
- Pacing is aggressive. Shots 1-3 establish 3 separate dimensions of the problem.
- Every remaining shot introduces a new, escalating fact. No repetition. No recap.
- The conclusion shot must synthesize the cumulative weight of all preceding facts into a single devastating statement.`,

    SLOW_BURN: `FORMAT: SLOW_BURN — Exactly ${shotCounts.min} shots.
- Shots 1-3: Build ominous context. No facts yet — establish atmosphere, tension, and the shape of what is wrong. The viewer should feel unease but not yet know why.
- Shots 4-8: Escalate with hard facts. Each shot introduces a specific, verifiable detail that makes the situation worse than the previous shot implied. The reveal is progressive — each fact is more damning than the last.
- Shots 9-11: The stakes become undeniable. Connect the facts to human cost, systemic failure, or irreversible consequence.
- Shot 12: The payoff. A single, unforgettable statement that recontextualizes everything that came before. The viewer should feel the weight of the entire 11-shot build converging here.`,

    THE_LIST: `FORMAT: THE_LIST — Exactly ${shotCounts.min} shots.
- 5 distinct numbered items, each explored across 3 visual angles (3 shots per item = 15 shots total).
- Each item opens with the key claim (shot A), then shows a different visual dimension or consequence (shot B), then closes with the actionable takeaway or counterintuitive insight (shot C).
- The 5 items must build in intensity. Item 1 is surprising. Item 5 is devastating.
- The conclusion shot synthesizes the list into a single organizing principle — the hidden pattern that connects all 5 items.`,
  };

  const base = `You are a world-class scriptwriter for a premium YouTube Shorts channel in the "${niche}" niche. Every script you write must be fact-dense, scientifically accurate, and structurally flawless. A single vague word or unverifiable claim is a failed script.

TONE MANDATE (critical — this overrides everything else about delivery):
${toneInstruction}

FORMAT MANDATE (locked — follow the shot structure exactly):
${formatInstructions[formatTemplate]}

SPECIFICITY MANDATE (absolute — no exceptions):
Every sentence must contain at least one anchor: an exact number, a date, a full name, a specific location, a named mechanism, or a verifiable dollar amount. The banned word list: "many", "several", "a lot", "huge", "massive", "significant", "various", "some", "often", "usually", "sometimes", "generally", "most", "few", "countless", "numerous", "unthinkable", "unprecedented", "shocking", "insane", "crazy", "mind-blowing", "game-changing", "revolutionary". If you use any of these words, you have failed.

FACT VERIFICATION MANDATE:
Every factual claim in every shot must appear in "fact_check_and_sources" with a verifiable source. The format is: claim → source. If a claim cannot be sourced, do not write it. Historical events need dates. Financial claims need dollar amounts and sources. Scientific claims need studies or documented evidence. No exceptions.

STAKES MANDATE (critical — script fails if violated):
Shot 1 must present verifiable cognitive dissonance in ≤8 words. Shot 2 must establish exact quantifiable stakes (dollars lost, lives affected, historical consequence). If stakes are not explicit by end of Shot 2, the script fails.

STORYTELLING MECHANICS:
1. COGNITIVE DISSONANCE HOOK: Shot 1 must present two facts that cannot logically coexist but do. The viewer's brain must register the contradiction in under 2 seconds.
2. EMOTIONAL ARC: Tension built through exact FACTS, never adjectives. "He lost $4.7 million in 14 minutes" — not "he lost a staggering amount."
3. SPOKEN ENGLISH ONLY: Write for the ear, not the eye. Every shot text must sound like natural speech when read aloud. Short clauses. Conversational rhythm. No written-English constructions.
4. DEFINITIVE CLOSURE: The last shot is the resolution. The hook's tension is released. The viewer leaves with a specific fact, not a cliffhanger. The final sentence must be quotable — sharp enough to remember.

NATURAL CONCLUSION:
The last shot is the payoff. The hook posed a question or contradiction — the last shot answers it definitively. Every fact built across preceding shots converges here. The final sentence must land with weight: a specific, memorable statement that the viewer carries after the video ends. The last shot MUST be marked is_conclusion: true.

1. Write hook_intro first — a high-tension, 3-5 word phrase that opens the story.
2. Write all shots building the case with escalating specificity.
3. The last shot delivers the resolution. End with a period, exclamation, or question mark. The ending must feel earned — the natural, inevitable result of everything that came before.
4. The final sentence should be the most quotable line in the script. A fact so sharp it stays in the viewer's mind.

CONCLUSION SHOT RULES:
- The last shot MUST have is_conclusion: true. Only the last shot. No other shot can be marked as conclusion.
- The conclusion shot MUST end with sentence-ending punctuation (. ! ?). This is non-negotiable.
- The final word before punctuation should carry the emotional or factual weight of the entire script.
- NEVER use filler words like "thanks for watching", "subscribe", "like", "comment", "follow", "pinned comment", "description", "link in bio", or any call-to-action language. Zero CTAs. The story ends on its own terms.

VISUAL WORLD MANDATE:
All images must share a unified aesthetic. ${aestheticInstruction} Every visual_prompt must reference specific elements from this aesthetic.

CAPTION CONSTRAINT (HARD LIMIT):
Each shot's tts_text MUST fit inside 3 rendering lines. You have a maximum of ${CAPTION_MAX_CHARS} characters TOTAL per shot and each word must be ≤${CAPTION_MAX_CHARS_PER_LINE} characters. Maximum 12 words per shot. Every shot must end with sentence-ending punctuation (. ! ?). Be ruthless with word count. Shots 1+2 combined must read aloud in under 6 seconds.

IMAGE PROMPT RULES (FLUX.1 [schnell] — literal, keyword-driven model):
- Output comma-separated descriptive tags, NOT narrative prose. FLUX interprets prompts literally.
  BAD: "A man stands alone in a vast empty warehouse bathed in cold fluorescent light"
  GOOD: "solitary figure, abandoned warehouse, cold fluorescent overhead lighting, wide 24mm shot, concrete floor texture, desaturated blue-grey palette, volumetric light beams, deep shadows"
- Every visual_prompt MUST include these 7 tag categories, in order:
  1. Subject (what is in frame — be specific)
  2. Environment (where — surfaces, materials, space)
  3. Lighting (direction + quality — "rim light from upper left", "harsh top-down key light")
  4. Camera (angle + lens — "low angle 35mm", "overhead macro 100mm")
  5. Color palette (dominant colors — "amber and navy", "desaturated with deep blacks")
  6. Texture (surface quality — "rough-hewn stone", "smooth matte plastic", "film grain")
  7. Atmosphere (environmental conditions — "volumetric fog", "dust motes in light", "rain-slicked")
- Never write the word "text" — not even in phrases like "no text"
- Each visual_prompt must be visually distinct. Vary camera angles, lighting direction, and subject distance between shots.

OUTPUT JSON SCHEMA (follow exactly — every field marked REQUIRED must be present):
{
  "fact_check_and_sources": [
    { "claim": "full sentence stating a verifiable fact (min 10 chars)", "source": "named publication, study, or document (min 5 chars)" }
  ], // REQUIRED. Min 3 items. Every factual claim in the script must appear here with a verifiable source.
  "visual_world": "vector" | "dossier" | "dark-cinematic" | "tactical", // REQUIRED
  "format_template": "RAPID_FIRE" | "SLOW_BURN" | "THE_LIST", // REQUIRED. Must match the assigned template.
  "title": "5-100 character title, no trailing period", // REQUIRED
  "description": "30-500 character video description", // REQUIRED
  "tags": ["lowercase", "hyphenated", "tags"], // REQUIRED. 5-12 tags, each 2-30 lowercase chars, hyphens not spaces.
  "hook_intro": "3-5 word high-tension opener", // REQUIRED. Must be the exact first words of shot 1 tts_text. No ending punctuation.
  "shots": [ // REQUIRED. 12-18 shots.
    {
      "id": 1,                                    // REQUIRED. Sequential number starting from 1.
      "visual_prompt": "comma-separated tags...", // REQUIRED. 30-600 chars. 7 tag categories. Never include the word "text".
      "tts_text": "Shot voiceover text.",         // REQUIRED. 3-12 words. Each word ≤26 chars. Total ≤80 chars. Must end with . ! or ?
      "audio_instruction": "[serious]",           // OPTIONAL. One of: [serious], [curious], [urgent], [measured], [grave].
      "is_conclusion": false                      // REQUIRED. true ONLY for the final shot in the array. Exactly one shot must be true.
    }
  ],
  "thumbnailPrompt": "30-500 char thumbnail image description" // REQUIRED. Must match the visual_world aesthetic.
}

EVERY shot object MUST have: id, visual_prompt, tts_text, is_conclusion.
The LAST shot MUST have is_conclusion: true. NO other shot may have is_conclusion: true.

Output ONLY valid JSON. No markdown. No code fences.`;

  return base;
}

async function scoreScript(
  script: z.infer<typeof SlideshowScriptSchema>,
  niche: string,
  minScore: number,
): Promise<QualityScore> {
  const prompt = `You are the final quality controller for a ${niche} YouTube Shorts channel. Your standards are absolute. You reject scripts that a casual reviewer would approve. Every dimension must earn its score — default is 5, not 7.

SCRIPT TO EVALUATE:
${JSON.stringify({
  title: script.title,
  visual_world: script.visual_world,
  format_template: script.format_template,
  shots: script.shots.map(s => ({
    tts_text: s.tts_text,
    visual_prompt: s.visual_prompt,
    is_conclusion: s.is_conclusion,
  })),
}, null, 2)}

SCORING RUBRIC (0–10 each):
- specificity (0-10): Every sentence has an anchor — exact number, date, name, dollar amount, or named mechanism. Zero vague quantifiers. For 10: every shot contains at least one verifiable, specific fact. For 5: most shots have a fact but one or two are vague. For 0: script relies on adjectives and generalities.
- hook_strength (0-10): Does Shot 1 present two facts that cannot logically coexist? Does the hook create genuine curiosity, not manufactured drama? For 10: the contradiction is instantly felt and demands resolution. For 0: generic or clickbait.
- information_density (0-10): Is every shot delivering a new verifiable fact? Zero filler shots. For 10: every shot advances the argument with a distinct, sourced piece of information. No shot could be removed without losing meaning. For 5: some shots are necessary but others pad the runtime. For 0: multiple shots say the same thing in different words.
- tone_calibration (0-10): Perfectly calibrated to the niche's voice. For 10: the viewer cannot imagine the script being delivered any other way. For 0: theatrical, sensationalist, or tonally inconsistent.
- pacing (0-10): Shot lengths vary naturally. No shot drags. The 60-second constraint feels natural, not rushed. For 10: the pacing creates a sense of forward momentum that makes the viewer feel the video is shorter than 60 seconds.
- visual_entropy (0-10): Are image prompts distinct enough to prevent visual fatigue? No two shots should look like the same image. For 10: each visual_prompt describes a scene so different from the others that any single frame is instantly identifiable. Camera angles, lighting, and composition vary deliberately. For 0: multiple prompts describe the same composition with minor variations.
- visual_coherence (0-10): Do the image_prompts form a unified visual world while being distinct from each other? For 10: the visual world is so strong the viewer would recognize the channel's aesthetic from a single frame. For 0: generic or inconsistent.

OVERALL: Average of the 7 dimensions. Round to one decimal.
approved: true if overall >= 7.0 AND no individual dimension < 5.

Output ONLY valid JSON. No markdown.
{
  "specificity": number,
  "hook_strength": number,
  "information_density": number,
  "tone_calibration": number,
  "pacing": number,
  "visual_entropy": number,
  "visual_coherence": number,
  "overall": number,
  "issues": ["string — one sentence each, actionable, cite the shot number"],
  "approved": boolean
}`;

  const raw = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { temperature: 0.2, maxTokens: 2048, responseJson: true },
  );

  if (!raw) throw new Error('Quality gate returned empty response');

  const parsed = extractJson(raw);
  return QualityScoreSchema.parse(parsed);
}

export async function generateScript(
  niche: string,
  accountId: string,
): Promise<{ script: SlideshowScript; topic: string }> {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];
  const toneInstruction = profile.toneInstruction;
  const minQualityScore = profile.minQualityScore;

  // Reserve topic atomically — released on failure to avoid burning topics on retry
  const reserved = await reserveTopic(niche, accountId);
  const topic = reserved.topic;
  const formatTemplate = pickFormatTemplate(niche);

  const systemPrompt = getSystemPrompt(niche, aesthetic.instruction, toneInstruction, formatTemplate);

  const userPrompt = `TOPIC: ${topic}
FORMAT TEMPLATE: ${formatTemplate}

Write the script now. Follow every rule in the system prompt exactly.`;

  let lastScore: QualityScore | null = null;

  try {
    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      const userContent = attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nCRITICAL — Fix these issues from the previous attempt:\n${lastScore!.issues.map(i => `- ${i}`).join('\n')}`;

      const raw = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { temperature: attempt === 0 ? 0.85 : 0.75, maxTokens: 8192, responseJson: true, timeout: 120_000 },
      );

      if (!raw) throw new Error('DeepSeek returned empty content for script');

      let parsed: unknown;
      try {
        parsed = extractJson(raw);
      } catch (err: any) {
        console.error('[TopicGenerator] Raw DeepSeek response:', String(raw).slice(0, 2000));
        throw new Error(`Parse Error: ${err.message}`, { cause: err });
      }

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

      // --- In-loop Caption Validation ---
      const captionValidation = validateAllCaptions(validated.shots.map(s => ({ text: s.tts_text })));
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
            script: {
              title: validated.title,
              description: `${validated.description}\n\n[Aesthetic: ${aesthetic.id}]`,
              visual_world: validated.visual_world,
              format_template: validated.format_template,
              fact_check_and_sources: validated.fact_check_and_sources
                .map(f => `${f.claim} → ${f.source}`)
                .join('\n'),
              tags: validated.tags,
              shots: validated.shots.map(shot => ({
                id: shot.id,
                visual_prompt: `${aesthetic.imagePrefix}${shot.visual_prompt} | Visual world: ${validated.visual_world} | Avoid: ${aesthetic.imageNegative}`,
                tts_text: shot.tts_text,
                audio_instruction: shot.audio_instruction,
                is_conclusion: shot.is_conclusion,
              })),
              thumbnailPrompt: `${aesthetic.thumbnailPrefix}${validated.thumbnailPrompt} | Avoid: ${aesthetic.imageNegative}`,
              hook_intro: validated.hook_intro,
            },
            topic,
          };
        }
        lastScore = score;
      } catch (gateErr) {
        break;
      }
    }
    throw new Error('Script generation failed after all retries');
  } catch (err) {
    await releaseTopic(reserved.id);
    throw err;
  }
}
