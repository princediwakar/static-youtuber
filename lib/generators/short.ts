// lib/generators/short.ts
import { z } from 'zod';
import { NonRetriableError } from 'inngest';
import { chatCompletion, extractJson } from '../llm';
import { SlideshowScript } from '../types';
import { validateAllCaptions } from '../captionValidator';
import {
  AESTHETICS,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  QUALITY_GATE_MAX_RETRIES,
  TEMPLATE_SHOT_COUNTS,
  getCaptionStyle,
} from '../constants';
import type { FormatTemplate } from '../constants';
import {
  SlideshowScriptSchema,
  QualityScoreSchema,
  QualityScore,
  QUALITY_SCORE_DIMENSIONS,
  ensureTerminalPunctuation
} from './schemas';
import { reserveTopic, releaseTopic, pickFormatTemplate } from './topic';

// ─── PASS 1: NARRATIVE GENERATION ─────────────────────────────────────────────
async function generateNarrative(topic: string, researchContext: string, toneInstruction: string, shotCounts: {min: number, max: number}): Promise<string> {
  const systemPrompt = `You are a master screenwriter writing a viral, high-retention YouTube Short.
Your job is to write a highly compelling, fact-dense narrative script based on the provided research.

LENGTH MANDATE (CRITICAL):
- TARGET 120-140 WORDS. (approx. 45-55 seconds of spoken audio).
- You MUST write at least ${shotCounts.min} distinct sentences. The video editor will split your text by punctuation into EXACTLY ${shotCounts.min}-${shotCounts.max} video shots.

STORYTELLING & PACING:
- Write in a natural, gripping conversational rhythm. This is for spoken word, not a dense essay.
- Sentences must sound like a passionate storyteller recounting a high-stakes tale. Use natural punctuation (commas, periods) to guide the narrator's pacing and pauses.
- Mix short, punchy sentences with flowing, well-connected thoughts to create momentum.
- Do NOT write dense, comma-heavy sentences like "In 2010, John Smith, a struggling student, built a successful company."
- Instead, write with momentum: "In 2010, a struggling student named John had an idea. He built a company that changed everything."
- Use transition words seamlessly to connect ideas and maintain cause-and-effect flow.

THE HOOK ARCHITECTURE:
1. The Hook: The first sentence must create a massive curiosity gap (e.g., "[High stakes statement]").
2. The Context: Ground it in reality fast (e.g., "[Time period]. [Grounding fact]").
3. The Pivot: Introduce the twist or high stakes.

BREVITY & STYLE (ORWELLIAN CONSTRAINTS):
1. Cut the Fat: If it is possible to cut a word out, always cut it out. Eliminate fluff, weak verbs, and unnecessary adjectives. Make every word tell.
2. Active Voice Only: Never use the passive where you can use the active (e.g., Use "The CEO destroyed the company" instead of "The company was destroyed by the CEO").
3. No Clichés: Never use a metaphor, simile, or phrase you are used to seeing in print (e.g., NO "the rest is history," "skyrocketed to success," or "a force to be reckoned with").
4. Simple Language: Never use a long word where a short one will do. Never use jargon if you can use an everyday English equivalent.

CONTENT POLICY (STRICT):
- Do NOT describe graphic violence, gore, exposed internal anatomy, or visceral bodily trauma.
- Build tension psychologically. Focus on the stakes and the situation, not blood.
- The RESEARCH CONTEXT includes a "Source: URL". This is for grounding only. NEVER include the URL in the narrative, NEVER read it aloud, and NEVER mention "source" or the link.

TONE MANDATE:
${toneInstruction}

BAN ON "ESSAY" LANGUAGE (CRITICAL):
- NEVER write summary conclusions like "This story teaches us about human potential" or "It shows the power of persistence."
- NEVER write CTAs ("subscribe", "like").
- End on a mic-drop moment, a shocking realization, or a profound open question. Show, don't tell. Let the facts speak for themselves.

FORMATTING:
- Use digits and symbols for numbers (e.g., "$1.4B", "26%") to keep the text visually concise for the captions.
- Output pure prose. NO JSON. NO formatting. Just the story.`;

  const userPrompt = `TOPIC: ${topic}\n\nRESEARCH CONTEXT (TREAT AS ABSOLUTE FACT):\n${researchContext}`;

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: 0.7, maxTokens: 1024, responseJson: false, timeout: 600_000 }
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
  attempt: number = 0,
): Promise<unknown> {
  const shotCounts = TEMPLATE_SHOT_COUNTS[formatTemplate];
  
  const systemPrompt = `You are a precision video editor and audio engineer.
Your job is to take a completed narrative script and slice it into exactly ${shotCounts.min}-${shotCounts.max} shots, formatted as strict JSON.

FORMAT: ${formatTemplate}
VISUAL WORLD: ${NICHE_PROFILES[niche]?.aestheticId || 'learn-technical'}

DUAL-TEXT MANDATE (CRITICAL):
Each shot has TWO text fields for different modalities:

1. "caption_text" — The EXACT verbatim text from the narrative, burned onto the screen.
   - VERBATIM SLICING ONLY: You MUST preserve the exact prose, grammar, and punctuation of the narrative. Do NOT rewrite, paraphrase, summarize, or convert to title-case fragments.
   - PUNCTUATION IS CRITICAL (DO NOT DROP PERIODS!): You MUST keep all commas, periods, and question marks EXACTLY as they appear in the narrative. If a shot completes a sentence, IT MUST END WITH A PERIOD. Do not strip ending punctuation, as it dictates the pacing for the text-to-speech engine!
   - WORD LIMIT: No shot may contain more than 12 words.
   - If a sentence is long, SPLIT it across multiple consecutive shots. Maintain the exact flow and punctuation of the sentence across the shots (e.g., Shot 1: "When the market crashed,", Shot 2: "they bought everything.").
   - Keep symbols and abbreviations as-is from the narrative (e.g., "$1.4B", "26%", "CEO").
   - NO REPETITION: Do NOT repeat the exact same caption or spoken text across multiple shots.

2. "spoken_text" — Nearly identical to caption_text. The ONLY change allowed is converting digit-form numbers to their spoken word equivalents.
   RULE: spoken_text = caption_text, with ONLY these substitutions:
   - Digit sequences → spoken number words. Examples:
     - "7 years" → "seven years"
     - "20 times" → "twenty times"
     - "$1.4B" → "one point four billion dollars"
     - "26%" → "twenty-six percent"
     - "500M" → "five hundred million"
   DO NOT CHANGE ANYTHING ELSE:
   - Acronyms and abbreviations stay as-is: "POW" → "POW", "CEO" → "CEO", "FBI" → "FBI".
     Whisper transcribes spoken acronyms as the full word ("POW"), not letter-by-letter ("P O W").
   - Proper names, brand names, and all other words are VERBATIM from caption_text.
   - If caption_text contains no digits, spoken_text is IDENTICAL to caption_text.
   - Never add, remove, or reorder words beyond the digit→word substitution.

VOICE SELECTION — Choose the voiceName that best matches the niche's tone:
- mallory-handford-american-female: Bright, conversational, friendly girl-next-door American female. Compelling, versatile, modern.
- melissa-harlow-american-female: Conversational, natural, energetic American female. Warm, relatable, good for narration and explainers.
- jon-british-male: Professional, clear, experienced British male. Polished, versatile narration.
- kylie-hinze-american-female: Friendly, upbeat, energetic girl-next-door American female. Cheerful, youthful, positive.
- kelli-winkler-american-female: Professional American female with radio/broadcasting background. Warm, clear, conversational.
- dee-smith-american-male: Dynamic, energetic, professional African American male. Versatile, conversational, commercial-friendly.

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

CENSORSHIP & NSFW GUARDRAILS (ZERO TOLERANCE):
- FORBIDDEN WORDS: blood, bloody, wound, severed, arterial, flesh, visceral, raw, bare chest, corpse, dead, murder.
- Focus on the gear, the environment, and the urgency. Keep anatomy out of frame or completely obscured in darkness.

JSON SCHEMA TO FOLLOW:
{
  "fact_check_and_sources": [
    { "claim": "Exact fact 1", "source": "Source context 1" },
    { "claim": "MUST provide at least 3 facts", "source": "Source 2" },
    { "claim": "Fact 3", "source": "Source 3" }
  ],
  "visual_world": "MUST EXACTLY MATCH THE VISUAL WORLD SPECIFIED ABOVE",
  "format_template": "${formatTemplate}",
  "voiceName": "pick the best match from the voice catalog above",
  "title": "5-100 chars, no period. Front-load the key claim or keyword in the first ~40 characters (mobile truncation point). Should read like a search snippet.",
  "description": "SEO-optimized 1-2 paragraphs. FIRST SENTENCE must restate the core fact in natural searchable language (this is what appears in Shorts search snippets). Subsequent sentences summarize what the viewer learns. Include relevant keywords.",
  "tags": ["must", "have", "at-least", "five", "tags"],
  "shots": [
    {
      "id": 1,
      "visual_prompt": "cinematic paragraph describing the scene... NO GORE. NO TEXT.",
      "caption_text": "The exact verbatim slice of the narrative. Must include natural punctuation (periods, commas) to ensure proper TTS pacing.",
      "spoken_text": "IDENTICAL to caption_text except digits become words. Preserve all punctuation so the TTS engine pauses correctly. FINAL SHOT MUST END WITH TERMINAL PUNCTUATION (. ! ?)",
      "is_conclusion": false
    }
  ],
  "thumbnailPrompt": "30-500 char thumbnail desc. STRICTLY PG-13. NO GORE."
}
LOOP DESIGN FOR REPLAY:
The final shot's closing phrase should echo the opening line's concept or question,
so that a replay feels deliberate rather than abrupt. If shot 1's hook is a question,
let the last caption resonate with it thematically — favor a question mark or an
open, evocative statement over a flat "case closed" line. Every shot, including this
one, still MUST end with terminal punctuation (. ! ?). The "open" feeling comes from
word choice, never from dropping the punctuation mark.

Only the LAST shot must have is_conclusion: true.`;

  let userPrompt = `TOPIC: ${topic}
RESEARCH CONTEXT: ${researchContext}

NARRATIVE TO CHUNK:
${narrative}

Slice this narrative into the exact JSON schema.`;

  if (validationFeedback) {
    userPrompt += `\n\nPREVIOUS ATTEMPT VALIDATION ERRORS:\n${validationFeedback}\n\nCRITICAL FIX INSTRUCTIONS:\n1. To fix character/word limit errors, DO NOT paraphrase, summarize, or delete words. Instead, SPLIT the long text across multiple consecutive shots. Maintain 100% verbatim text from the narrative.\n2. To fix EXACT DUPLICATE errors, you must stop repeating the same text. Advance the narrative to the next sentence.\n3. If "visual_prompt" is too short, EXPAND each scene with more cinematic detail — lighting, mood, camera angle, environment, texture, and atmosphere. Each visual_prompt should read like a vivid scene direction.\n4. Fix ALL array length constraints (tags, fact checks).\n5. Ensure the final shot's spoken_text ends with a period, exclamation mark, or question mark.`;
  }

  const raw = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    { temperature: Math.min(0.8, 0.2 + attempt * 0.15), maxTokens: 4096, responseJson: true, timeout: 600_000 }
  );

  return ensureTerminalPunctuation(extractJson(raw));
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
  title: script.title,
  description: script.description,
  thumbnailPrompt: script.thumbnailPrompt,
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
- hook_payoff_match (0-10): Does the title and thumbnailPrompt accurately represent what the shots actually deliver? A viewer who reads the title/thumbnail then watches the whole thing should feel the payoff matched the promise — score low for any bait-and-switch, exaggeration, or unresolved tease.
- overall (0-10): The final composite score (average of the above). Must be 0 if Censorship or Style-Drift checks fail.

CRITICAL CENSORSHIP CHECK:
If ANY visual_prompt contains explicit gore, blood, or visceral anatomy descriptions, you MUST score 'overall' as 0 and set 'approved' to false. State the exact trigger word in the 'issues' array.

CRITICAL STYLE-DRIFT CHECK:
If ANY visual_prompt describes glassmorphism, frosted/liquid glass, glossy soft-3D renders, pastel gradient blobs, isometric dioramas, bento grids, neon wireframes, or sumi-e ink wash, you MUST score 'overall' as 0 and set 'approved' to false. State the exact offending phrase in the 'issues' array.

APPROVAL RULE:
Set 'approved' to true ONLY IF 'overall' >= ${minScore}. Otherwise set 'approved' to false.

Output JSON:
{ "specificity": 0, "hook_strength": 0, "information_density": 0, "tone_calibration": 0, "pacing": 0, "visual_entropy": 0, "visual_coherence": 0, "caption_flow": 0, "hook_payoff_match": 0, "overall": 0, "issues": ["string"], "approved": boolean }`;

  const raw = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { temperature: 0.1, maxTokens: 2048, responseJson: true },
  );

  if (!raw) throw new Error('Quality gate returned empty response');
  return QualityScoreSchema.parse(extractJson(raw));
}

// ─── MAIN GENERATION PIPELINE ────────────────────────────────────────────────
export async function generateScript(
  step: any,
  niche: string,
  accountId: string,
): Promise<{ script: SlideshowScript; topic: string; formatTemplate: string }> {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];

  const { formatTemplate, reserved } = await step.run('init-topic', async () => {
    const ft = await pickFormatTemplate(niche, profile.aestheticId);
    const res = await reserveTopic(niche, accountId);
    return { formatTemplate: ft, reserved: res };
  });
  
  try {
    const narrative = await step.run('generate-narrative', () => generateNarrative(reserved.topic, reserved.research_context, profile.toneInstruction, TEMPLATE_SHOT_COUNTS[formatTemplate as FormatTemplate]));

    let lastScore: QualityScore | null = null;
    let validationFeedback = '';

    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      const parsed = await step.run(`script-attempt-${attempt}`, () => chunkScriptToJSON(
        narrative,
        reserved.topic,
        reserved.research_context,
        niche,
        aesthetic.instruction,
        formatTemplate,
        validationFeedback || undefined,
        attempt,
      ));

      validationFeedback = '';

      // Force-coerce visual_world — it's deterministic from the niche profile,
      // no reason to trust the LLM to echo it back correctly.
      if (parsed && typeof parsed === 'object') {
        (parsed as any).visual_world = aesthetic.id;
      }

      let validated: z.infer<typeof SlideshowScriptSchema>;
      try {
        validated = SlideshowScriptSchema.parse(parsed);
      } catch (zodErr) {
        if (zodErr instanceof z.ZodError) {
          validationFeedback = zodErr.issues.map(i =>
            `${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`
          ).join('\n');
          if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
          throw new NonRetriableError(`Script validation failed:\n${validationFeedback}`);
        }
        throw zodErr;
      }

      // Validate caption text for on-screen rendering constraints — using
      // this aesthetic's own font metrics, not the Montserrat-tuned global
      // default, since a condensed stencil face and a wide display serif
      // don't fit the same character count per line at the same size.
      const captionValidation = validateAllCaptions(
        validated.shots.map(s => ({ caption_text: s.caption_text, spoken_text: s.spoken_text })),
        getCaptionStyle(aesthetic.id),
      );
      if (!captionValidation.valid) {
        validationFeedback = captionValidation.errors.join('\n');
        if (attempt < QUALITY_GATE_MAX_RETRIES) continue;
        throw new NonRetriableError(`Caption validation failed:\n${validationFeedback}`);
      }

      const score = await step.run(`score-script-${attempt}`, () => scoreScript(validated, reserved.research_context, niche, profile.minQualityScore));

      // BUGFIX: profile.minQualityScore used to be passed into scoreScript()
      // and never used — the prompt never told the model what the bar was,
      // and this code only checked score.approved (a boolean the model
      // invented on its own judgment with no code-side floor). Belt-and-
      // suspenders: the prompt above now states the threshold explicitly,
      // and this still re-checks it here rather than trusting the model's
      // self-grading alone.
      const passesFloor = score.overall >= profile.minQualityScore;
      if (score.approved && !passesFloor) {
        console.warn(
          `[TopicGenerator] Quality gate: model self-reported approved=true but score ` +
          `(overall=${score.overall}, min=${profile.minQualityScore}) failed the code-side floor. Treating as not approved.`
        );
      }

      if (score.approved && passesFloor) {
        const hookWords = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ');
        const hook_intro = hookWords.replace(/[.!?:;,]/g, '');
        return {
          script: {
            title: validated.title,
            description: `${validated.description}`,
            visual_world: validated.visual_world,
            format_template: validated.format_template,
            voiceName: profile.preferredVoice || validated.voiceName,
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
          formatTemplate,
        };
      }
      lastScore = score;
      validationFeedback = `Quality Gate Failed. Issues: ${score.issues.join(' | ')}`;
    }
    
    if (lastScore) {
      throw new NonRetriableError(`Script generation failed after all retries. Final LLM critique: ${lastScore.issues.join(' | ')}`);
    }
    throw new NonRetriableError('Script generation failed after all retries (No score generated)');
  } catch (err) {
    await step.run('release-topic', () => releaseTopic(reserved.id));
    throw err;
  }
}
