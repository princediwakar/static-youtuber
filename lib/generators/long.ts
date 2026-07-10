// Path: lib/generators/long.ts
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
  const systemPrompt = `You are a master screenwriter writing a highly-retained, cinematic YouTube documentary.
Your job is to write a compelling, fact-dense deep-dive script based on the provided research.

LENGTH MANDATE (CRITICAL):
- TARGET 500-750 WORDS (approx. 3-4 minutes of spoken audio).
- You MUST write at least ${shotCounts.min} distinct sentences. The video editor will split your text by punctuation into EXACTLY ${shotCounts.min}-${shotCounts.max} video shots.

STORYTELLING & PACING:
- Write in a natural, gripping conversational rhythm. This is for spoken word, not a dense essay.
- Sentences must sound like a passionate storyteller recounting a high-stakes tale. Use natural punctuation (commas, periods) to guide the narrator's pacing and pauses.
- Mix short, punchy sentences with flowing, well-connected thoughts to create momentum.
- Do NOT write dense, comma-heavy sentences like "In 1998, Larry Page and Sergey Brin, Stanford PhD students, built a search engine."
- Instead, write with momentum: "In 1998, two Stanford PhDs named Larry and Sergey had an idea. They built a search engine called BackRub."
- Use transition words seamlessly to connect ideas and maintain cause-and-effect flow.

THE HOOK ARCHITECTURE:
1. The Hook: The first sentence must create a massive curiosity gap.
2. The Context: Ground it in reality fast.
3. The Pivot: Introduce the twist or high stakes.

BREVITY & STYLE (ORWELLIAN CONSTRAINTS):
1. Cut the Fat: If it is possible to cut a word out, always cut it out. Eliminate fluff, weak verbs, and unnecessary adjectives. Make every word tell.
2. Active Voice Only: Never use the passive where you can use the active (e.g., Use "Larry Page built Google" instead of "Google was built by Larry Page").
3. No Clichés: Never use a metaphor, simile, or phrase you are used to seeing in print (e.g., NO "the rest is history," "skyrocketed to success," or "a force to be reckoned with").
4. Simple Language: Never use a long word where a short one will do. Never use jargon if you can use an everyday English equivalent.

CONTENT POLICY (STRICT):
- Do NOT describe graphic violence, gore, exposed internal anatomy, or visceral bodily trauma.
- Build tension psychologically. Focus on stakes and ticking clocks, NOT physical blood.

TONE MANDATE:
${toneInstruction}

STRUCTURE MANDATE:
Hook → Background Context → Deep Exploration (3-4 distinct dimensions) → Modern Relevance → Synthesis

BAN ON "ESSAY" LANGUAGE (CRITICAL):
- NEVER write summary conclusions like "This story teaches us about human potential" or "It shows the power of persistence."
- NEVER write CTAs ("subscribe", "like").
- End on a mic-drop moment, a shocking realization, or a profound open question. Show, don't tell. Let the facts speak for themselves.

FORMATTING:
- Use digits and symbols for numbers ("$1.4B", "26%", "CEO").
- Pure prose. NO JSON. NO formatting headers. Just the story.`;

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
VISUAL WORLD: ${LONG_NICHE_PROFILES[niche]?.aestheticId || 'learn-technical'}

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
- phil-freeman-american-male: Deep, rich, authoritative. Best for Wealth & Mindset / Fascinating History.
- jon-british-male: Professional, clear, polished. Good for Growth Psychology.
- dee-smith-american-male: Dynamic, conversational. Good for Learn Something New.
- mallory-handford-american-female: Bright, compelling. Alternative for any niche.
- melissa-harlow-american-female: Warm, natural narration.

VISUAL AESTHETICS & SHOT VARIETY MANDATE (CRITICAL):
Visual World: ${aestheticInstruction}

To prevent repetitive, boring images, you MUST use a "Shot Sequence Architecture". You must violently alternate the camera distance and subject for EVERY single shot. Cycle through these 4 shot types in order:
1. WIDE ESTABLISHING SHOT (e.g., A massive, empty brutalist room)
2. MACRO INSERT SHOT (e.g., Extreme close-up of sweat on a fingerprint)
3. OVER-THE-SHOULDER / POV (e.g., Looking down at a shredded document)
4. ABSTRACT / TEXTURAL (e.g., Pure heavy film grain over oxidized metal)

- Write a highly descriptive, visceral paragraph for the visual_prompt.
- NEVER describe the same shot type twice in a row. 
- HARD BAN: No glassmorphism, no glossy 3D, no "cinematic lighting", no neon. Describe physical mediums (halftone, xerox, polaroid, 35mm film, risograph, CCTV).
- CRITICAL: NO written words, letters, or numbers in the scene. Represent documents with abstract redacted black bars or blank scribbles.
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
If ANY visual_prompt describes glassmorphism, frosted glass, glossy 3D, isometric dioramas, neon wireframes, or sumi-e → score overall=0, approved=false.

APPROVAL RULE:
approved=true ONLY IF overall >= ${minScore}.

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
      const passesFloor = score.overall >= profile.minQualityScore;

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
