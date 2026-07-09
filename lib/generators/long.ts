import { z } from 'zod';
import { NonRetriableError } from 'inngest';
import { chatCompletion, extractJson } from '../llm';
import { SlideshowScript } from '../types';
import { validateAllCaptions } from '../captionValidator';
import {
  AESTHETICS,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  LONG_NICHE_PROFILES,
  QUALITY_GATE_MAX_RETRIES,
  getLongFormCaptionStyle,
} from '../constants';
import {
  LongFormScriptSchema,
  LongQualityScoreSchema,
  LongQualityScore,
  LONG_QUALITY_DIMENSIONS,
  ensureTerminalPunctuation,
} from './schemas';
import { reserveTopic, releaseTopic } from './topic';

// ─── LONG-FORM PASS 1: NARRATIVE ─────────────────────────────────────────────
async function generateLongFormNarrative(
  topic: string,
  researchContext: string,
  toneInstruction: string,
  shotCounts: {min: number, max: number},
): Promise<string> {
  const systemPrompt = `You are a documentary narrator and investigative journalist.
Your job is to write a compelling, fact-dense 3-5 minute deep-dive script.

LENGTH MANDATE (CRITICAL):
- TARGET 500-750 WORDS.
- You MUST write at least ${shotCounts.min} distinct sentences, clauses, or beats. This script will be sliced into EXACTLY ${shotCounts.min}-${shotCounts.max} video shots.
- If you write fewer than ${shotCounts.min} sentences, the editor will fail. Do not pad with repetition; write enough original substance to naturally fill ${shotCounts.min} shots.
- At ~2.5 words/second, 600 words ≈ 4 minutes — the ideal long-form sweet spot.

CONTENT POLICY (STRICT):
- Do NOT describe graphic violence, gore, exposed internal anatomy, or visceral bodily trauma.
- Build tension psychologically. Focus on stakes and ticking clocks, NOT physical blood.

TONE MANDATE:
${toneInstruction}

STRUCTURE MANDATE:
Hook → Background Context → Deep Exploration (3-4 distinct dimensions) → Modern Relevance → Synthesis

STORYTELLING RULES:
1. NO REPETITION: Never repeat a sentence, phrase, or core idea to fill space. Every single sentence must advance the narrative.
2. Ground everything in reality. Use exact dates, names, and numbers from the research context.
3. HOOK THEM WITH AN OPEN LOOP: The first sentence must create a massive curiosity gap. Never summarize the entire story upfront. Present a high-stakes question, an unbelievable paradox, or a shocking claim.
4. Build tension through structure. Use subordinate clauses, cause-and-effect transitions, and narrative callbacks. Delay the final resolution.
5. Sentences may be 15-25 words. This is prose, not caption bullets, but it must still have a conversational, gripping rhythm. Mix sentence lengths.
6. Ending must recontextualize the whole story, leaving the viewer feeling empowered, resilient, and ready to act.
7. NO CTAs. No "subscribe", "like", or "thanks for watching".

FORMATTING:
- Use digits, symbols, and abbreviations for numbers ("$1.4B", "26%", "CEO").

OUTPUT:
Pure prose. NO JSON. NO formatting headers. Just the story.`;

  const userPrompt = `TOPIC: ${topic}\n\nRESEARCH CONTEXT (TREAT AS ABSOLUTE FACT):\n${researchContext}`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.8, maxTokens: 2048, responseJson: false, timeout: 600_000 }
  );

  if (!raw) throw new Error('Long-form Pass 1: DeepSeek returned empty narrative');
  return raw as string;
}

// ─── LONG-FORM PASS 2: CHUNKING ───────────────────────────────────────────────
async function chunkLongFormScriptToJSON(
  narrative: string,
  topic: string,
  researchContext: string,
  niche: string,
  aestheticInstruction: string,
  validationFeedback?: string,
  attempt: number = 0,
): Promise<unknown> {
  const systemPrompt = `You are a precision video editor for a landscape (16:9) documentary channel.
Slice this narrative into exactly 30-60 consecutive shots, formatted as strict JSON.

FORMAT: DEEP_DIVE
VISUAL WORLD: ${niche === 'Financial Forensics' ? 'finance-editorial' : niche === 'Stoic Philosophy' ? 'stoic-zen' : niche === 'Urban Survival' ? 'survival-technical' : 'tech-minimalist'}

DUAL-TEXT MANDATE (CRITICAL):
Each shot has TWO text fields:

1. "caption_text" — Verbatim slice from the narrative, burned onto the landscape 16:9 frame.
   - VERBATIM SLICING ONLY: Do NOT rewrite, paraphrase, or alter the narrative.
   - WORD LIMIT: No shot may contain more than 15 words.
   - If a sentence is long, SPLIT across multiple consecutive shots.
   - Keep symbols and abbreviations ("$1.4B", "26%", "CEO").
   - NO REPETITION: Do NOT repeat the exact same caption or spoken text across multiple shots to pad the length. Every shot must advance the text.

2. "spoken_text" — Identical to caption_text EXCEPT digits become spoken words.
   - "7 years" → "seven years"; "$1.4B" → "one point four billion dollars"; "26%" → "twenty-six percent"
   - Acronyms stay as-is: "CEO", "FBI", "POW"
   - Never add, remove, or reorder words beyond digit substitution.

VOICE SELECTION (same catalog as shorts — pick best for long-form niche):
- phil-freeman-american-male: Deep, rich, authoritative. Best for Financial Forensics / dramatic tech.
- jon-british-male: Professional, clear, polished. Good for Stoic / editorial.
- dee-smith-american-male: Dynamic, conversational. Good for SaaS / Urban Survival.
- mallory-handford-american-female: Bright, compelling. Alternative for any niche.
- melissa-harlow-american-female: Warm, natural narration.

VISUAL AESTHETIC (FLUX.1 — landscape 1344×768):
${aestheticInstruction}
- Write a descriptive paragraph per shot using natural language.
- KINETIC ENERGY MANDATE: Change the visual prompt for EVERY SINGLE SHOT. Do not just change the camera angle — change the focus, the lighting, the micro-actions (e.g., "ink bleeding into paper", "a nervous hand adjusting a tie", "a flickering fluorescent light"). Make it cinematic and intimately detailed.
- NEVER COPY-PASTE VISUAL PROMPTS BETWEEN SHOTS.
- HARD BAN: No glassmorphism, frosted glass, glossy 3D, pastel blobs, isometric dioramas, neon wireframes, sumi-e.
  Describe material and light instead (paper grain, ink, stone, patina, halftone, contour line).
- CRITICAL: No written words, signs, legible letters, numbers, or text anywhere in the scene.
- Landscape frame: compose for 16:9 (wider than tall). Use horizontal scene depth.

CENSORSHIP (ZERO TOLERANCE):
- FORBIDDEN: blood, bloody, wound, severed, arterial, flesh, visceral, raw, bare chest, corpse, dead, murder.

JSON SCHEMA:
{
  "fact_check_and_sources": [
    { "claim": "Exact fact 1", "source": "Source context 1" },
    { "claim": "MUST provide at least 5 facts", "source": "Source 2" },
    { "claim": "Fact 3", "source": "Source 3" },
    { "claim": "Fact 4", "source": "Source 4" },
    { "claim": "Fact 5", "source": "Source 5" }
  ],
  "visual_world": "MUST MATCH THE VISUAL WORLD ABOVE",
  "format_template": "DEEP_DIVE",
  "voiceName": "pick from catalog",
  "title": "5-100 chars. Front-load the key claim. Reads like a YouTube search result.",
  "description": "SEO-optimized 2-3 paragraphs. First sentence restates the core fact. Include keywords.",
  "tags": ["must", "have", "at-least", "five", "tags"],
  "shots": [
    {
      "id": 1,
      "visual_prompt": "Descriptive landscape scene paragraph. NO GORE. NO TEXT.",
      "caption_text": "Verbatim narrative slice (≤15 words).",
      "spoken_text": "Identical except digits become words. FINAL SHOT MUST END WITH TERMINAL PUNCTUATION (. ! ?)",
      "is_conclusion": false
    }
  ],
  "thumbnailPrompt": "30-500 char landscape thumbnail. STRICTLY PG-13. NO GORE."
}
Only the LAST shot has is_conclusion: true.`;

  let userPrompt = `TOPIC: ${topic}
RESEARCH CONTEXT: ${researchContext}

NARRATIVE TO CHUNK:
${narrative}

Slice this narrative into 30-60 shots using the JSON schema above.`;

  if (validationFeedback) {
    userPrompt += `\n\nPREVIOUS ATTEMPT ERRORS:\n${validationFeedback}\n\nFIX INSTRUCTIONS:\n1. To fix word-limit errors, SPLIT the long text across multiple consecutive shots. Do NOT paraphrase or delete words.\n2. To fix EXACT DUPLICATE errors, you must stop repeating the same text. Advance the narrative to the next sentence.\n3. If "visual_prompt" is too short, EXPAND each scene with more cinematic detail — lighting, mood, camera angle, environment, texture, and atmosphere.\n4. Fix ALL array length constraints (tags, fact checks).\n5. Ensure the final shot's spoken_text ends with a period, exclamation mark, or question mark.`;
  }

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: Math.min(0.8, 0.2 + attempt * 0.15), maxTokens: 6000, responseJson: true, timeout: 900_000 }
  );

  return ensureTerminalPunctuation(extractJson(raw));
}

// ─── LONG-FORM QUALITY GATE ───────────────────────────────────────────────────
async function scoreLongFormScript(
  script: z.infer<typeof LongFormScriptSchema>,
  researchContext: string,
  niche: string,
  minScore: number,
): Promise<LongQualityScore> {
  const prompt = `You are the final quality controller for a ${niche} YouTube long-form channel.
Evaluate this deep-dive documentary script against the provided research data.

RESEARCH CONTEXT (TRUTH):
${researchContext}

SCRIPT TO EVALUATE:
${JSON.stringify({
  title: script.title,
  description: script.description,
  thumbnailPrompt: script.thumbnailPrompt,
  shots: script.shots.map(s => ({ caption_text: s.caption_text, spoken_text: s.spoken_text, visual_prompt: s.visual_prompt })),
}, null, 2)}

SCORING RUBRIC (0-10):
- narrative_coherence (0-10): Does the story flow logically from hook to synthesis? Does it feel like one continuous documentary, not disconnected clips?
- factual_depth (0-10): Are specific dates, names, and numbers from the research context woven throughout?
- arc_satisfaction (0-10): Does the ending pay off the opening hook? Would a viewer feel the full arc was worth 4 minutes of their time?
- visual_variety (0-10): Are the 30-60 visual prompts genuinely diverse — different angles, locations, lighting, materials? Or repetitive?
- information_density (0-10): Is every shot advancing the narrative? No filler, no repetition of the same point.
- tone_calibration (0-10): Does the writing match the deep documentary tone? Flowing sentences, subordinate clauses, not caption bullets?

CRITICAL CENSORSHIP CHECK:
If ANY visual_prompt contains explicit gore, blood, or visceral anatomy → score overall=0, approved=false.

CRITICAL STYLE-DRIFT CHECK:
If ANY visual_prompt describes glassmorphism, frosted glass, glossy 3D, isometric dioramas, neon wireframes, sumi-e, or any legible text/numbers → score overall=0, approved=false.

APPROVAL RULE:
approved=true ONLY IF overall >= ${minScore} AND every dimension >= 5.

Output JSON only:
{ "narrative_coherence": 0, "factual_depth": 0, "arc_satisfaction": 0, "visual_variety": 0, "information_density": 0, "tone_calibration": 0, "overall": 0, "issues": ["string"], "approved": false }`;

  const raw = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { temperature: 0.1, maxTokens: 1024, responseJson: true },
  );

  if (!raw) throw new Error('Long-form quality gate returned empty response');
  return LongQualityScoreSchema.parse(extractJson(raw));
}

// ─── LONG-FORM MAIN PIPELINE ──────────────────────────────────────────────────
export async function generateLongFormScript(
  step: any,
  niche: string,
  accountId: string,
): Promise<{ script: SlideshowScript; topic: string; formatTemplate: string }> {
  const profile = LONG_NICHE_PROFILES[niche] ?? NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];

  const reserved = await step.run('init-topic', () => reserveTopic(niche, accountId));

  try {
    const narrative = await step.run('generate-narrative', () => generateLongFormNarrative(reserved.topic, reserved.research_context, profile.toneInstruction, {min: 30, max: 60}));

    let lastScore: LongQualityScore | null = null;
    let validationFeedback = '';
    const captionLimits = getLongFormCaptionStyle(profile.aestheticId);

    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      const parsed = await step.run(`script-attempt-${attempt}`, () => chunkLongFormScriptToJSON(
        narrative,
        reserved.topic,
        reserved.research_context,
        niche,
        aesthetic.instruction,
        validationFeedback || undefined,
        attempt,
      ));

      validationFeedback = '';

      let validated: z.infer<typeof LongFormScriptSchema>;
      try {
        validated = LongFormScriptSchema.parse(parsed);
      } catch (zodErr) {
        if (zodErr instanceof z.ZodError) {
          validationFeedback = zodErr.issues.map(i =>
            `${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`
          ).join('\n');
          if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
          throw new NonRetriableError(`Long-form script validation failed:\n${validationFeedback}`);
        }
        throw zodErr;
      }

      // Caption validation using landscape char limits (maxWords=20)
      const captionValidation = validateAllCaptions(
        validated.shots.map(s => ({ caption_text: s.caption_text, spoken_text: s.spoken_text })),
        captionLimits,
      );
      if (!captionValidation.valid) {
        validationFeedback = captionValidation.errors.join('\n');
        if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
        throw new NonRetriableError(`Long-form caption validation failed:\n${validationFeedback}`);
      }

      const score = await step.run(`score-script-${attempt}`, () => scoreLongFormScript(validated, reserved.research_context, niche, profile.minQualityScore));
      const passesFloor = score.overall >= profile.minQualityScore &&
        LONG_QUALITY_DIMENSIONS.every(dim => score[dim] >= 5);

      if (score.approved && !passesFloor) {
        console.warn(
          `[LongForm] Quality gate: model self-reported approved=true but ` +
          `overall=${score.overall} failed code-side floor (min=${profile.minQualityScore}). Treating as not approved.`
        );
      }

      if (score.approved && passesFloor) {
        const hookWords = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ');
        const hook_intro = hookWords.replace(/[.!?:;,]/g, '');
        return {
          script: {
            title: validated.title,
            description: validated.description,
            visual_world: validated.visual_world,
            format_template: 'DEEP_DIVE',
            voiceName: validated.voiceName,
            fact_check_and_sources: validated.fact_check_and_sources
              .map(f => `${f.claim} → ${f.source}`).join('\n'),
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
            contentType: 'long',
          },
          topic: reserved.topic,
          formatTemplate: 'DEEP_DIVE',
        };
      }

      lastScore = score;
      validationFeedback = `Quality Gate Failed. Issues: ${score.issues.join(' | ')}`;
    }

    if (lastScore) {
      throw new NonRetriableError(`Long-form generation failed after all retries. Final critique: ${lastScore.issues.join(' | ')}`);
    }
    throw new NonRetriableError('Long-form script generation failed after all retries (No score generated)');
  } catch (err) {
    await step.run('release-topic', () => releaseTopic(reserved.id));
    throw err;
  }
}
