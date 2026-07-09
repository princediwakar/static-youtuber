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
  const systemPrompt = `You are a master storyteller and investigative journalist.
Your job is to write a highly compelling, fact-dense narrative script for a YouTube Short.

LENGTH MANDATE (CRITICAL):
- TARGET 120-140 WORDS.
- You MUST write at least ${shotCounts.min} distinct sentences or beats. This script will be sliced into EXACTLY ${shotCounts.min}-${shotCounts.max} video shots.
- If you write fewer than ${shotCounts.min} sentences, the editor will fail. Do not pad with repetition; write enough original substance to naturally fill ${shotCounts.min} shots.
- At ~2.5 words/second, 120 words ≈ 48s.

CONTENT POLICY (STRICT):
- Do NOT describe graphic violence, gore, exposed internal anatomy, or visceral bodily trauma. 
- You must build tension psychologically. Focus on the situation, the ticking clock, and the stakes, NOT the physical blood.

TONE MANDATE:
${toneInstruction}

STORYTELLING RULES:
1. NO REPETITION: Never repeat a sentence, phrase, or core idea to fill space. Every single sentence must advance the narrative.
2. Ground everything in reality. Use the exact dates, names, and numbers provided.
3. HOOK THEM WITH AN OPEN LOOP: The first sentence must create a massive curiosity gap. Never summarize the entire story upfront. Present a high-stakes question, an unbelievable paradox, or a shocking claim (e.g., "The man who built a $2B empire never owned a single computer" or "In 2008, one line of code almost destroyed the global economy"). The viewer must feel compelled to stay to find the answer.
4. Build tension. Use transition words. Let the story flow with cause and effect. Withhold the final resolution until the very last possible moment.
5. End with an empowering, triumphant conclusion. The final sentence must recontextualize the whole story and leave the viewer feeling capable and inspired to act.
6. NO CTAs. No "subscribe", "like", or "thanks for watching".
   Exception: ending on a genuinely debatable claim (supported by research) is
   encouraged — it invites organic discussion in comments without an explicit CTA.
   Prefer this over an airtight, universally-agreed conclusion when the topic allows.

PACING & SYNTAX (CRITICAL):
- Write in a naturally flowing, conversational rhythm. Do NOT write in robotic bullet points or fragmented phrases.
- Rhythm is critical: it must sound like a gripping, high-stakes spoken conversation. Mix short punchy sentences with flowing, well-connected thoughts to create momentum and natural human cadence.
- Use transition words seamlessly. The narrative must flow organically from start to finish.
- Read it aloud in your head — it must sound like a passionate storyteller recounting a gripping tale, not a disconnected list of facts.

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
VISUAL WORLD: ${niche === 'Financial Forensics' ? 'finance-editorial' : niche === 'Stoic Philosophy' ? 'stoic-zen' : niche === 'Urban Survival' ? 'survival-technical' : 'tech-minimalist'}

DUAL-TEXT MANDATE (CRITICAL):
Each shot has TWO text fields for different modalities:

1. "caption_text" — The visually punchy, abbreviated text burned onto the screen via FFMPEG.
   - VERBATIM SLICING ONLY: Do NOT rewrite, paraphrase, summarize, or alter the formatting of the narrative.
   - WORD LIMIT: No shot may contain more than 12 words.
   - If a sentence is long, SPLIT it across multiple consecutive shots. Do NOT summarize it to fit.
   - Keep symbols and abbreviations as-is from the narrative (e.g., "$1.4B", "26%", "CEO").
   - NO REPETITION: Do NOT repeat the exact same caption or spoken text across multiple shots to pad the length. Every shot must advance the text.
   - This is what the viewer reads on screen — short, scannable, punchy.

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

VISUAL AESTHETIC (FLUX.1):
You must write a scene description that fits this visual world: ${aestheticInstruction}
- Write a highly descriptive paragraph using natural language describing the specific scene.
- KINETIC ENERGY MANDATE: You MUST change the visual prompt for EVERY SINGLE SHOT. Do not just change the camera angle — change the focus, the lighting, the micro-actions (e.g., "dust motes dancing in a shaft of light", "a hand violently slamming a folder down", "sweat dripping onto a keyboard"). Make it cinematic and intensely visceral.
- NEVER COPY-PASTE VISUAL PROMPTS BETWEEN SHOTS.
- HARD BAN ON THESE OVERUSED AI LOOKS — never describe: glassmorphism, frosted/liquid glass panels, glossy soft-3D renders, pastel gradient blobs, isometric miniature dioramas, generic bento-grid layouts, neon wireframes, or sumi-e ink wash. If your instinct reaches for one of these, describe the material and light instead (paper grain, ink, stone, patina, halftone dot, contour line).
- CRITICAL: The environment must have NO written words, NO signs, NO legible letters or numbers, and NO text of any kind — this includes fake labels on maps, redaction stamps, inscriptions, or document text. Represent documents/maps/carvings with blank marks, plain bars, or abstract lines only, never characters that could be misread as words.

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
      "caption_text": "The visually punchy, abbreviated text for the screen (e.g., '$6.5B').",
      "spoken_text": "IDENTICAL to caption_text except digits become words (e.g., 'six point five billion dollars'). Acronyms like POW, CEO stay as-is. FINAL SHOT MUST END WITH TERMINAL PUNCTUATION (. ! ?)",
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

CRITICAL CENSORSHIP CHECK:
If ANY visual_prompt contains explicit gore, blood, or visceral anatomy descriptions, you MUST score 'overall' as 0 and set 'approved' to false. State the exact trigger word in the 'issues' array.

CRITICAL STYLE-DRIFT CHECK:
If ANY visual_prompt describes glassmorphism, frosted/liquid glass, glossy soft-3D renders, pastel gradient blobs, isometric dioramas, bento grids, neon wireframes, sumi-e ink wash, or any legible text/letters/numbers in the scene, you MUST score 'overall' as 0 and set 'approved' to false. State the exact offending phrase in the 'issues' array.

APPROVAL RULE:
Set 'approved' to true ONLY IF 'overall' >= ${minScore} AND every individual dimension score is >= 5. Otherwise set 'approved' to false, even if 'overall' alone clears ${minScore}.

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
      const passesFloor = score.overall >= profile.minQualityScore &&
        QUALITY_SCORE_DIMENSIONS.every(dim => score[dim] >= 5);
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
