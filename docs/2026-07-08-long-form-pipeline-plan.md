# Long-Form Pipeline Plan (2026-07-08)

3-5 minute landscape (1920×1080) deep-dive videos, published to the same YouTube channels as standard uploads (not #Shorts).

---

## Key Design Decisions

- **Accounts**: Same accounts (`tech_shots`, `stoic_shots`, etc.) — long-form goes on the same channels as standard YouTube videos, not as Shorts.
- **Format template**: Single `DEEP_DIVE` — one topic, thorough 3-5 min exploration with narrative arc.
- **Publish cadence**: Every other day per channel (48h throttle).
- **Topic pool**: Same `slideshow_topics` pool — `reserveTopic` works identically, but `generateLongFormScript` produces a much deeper narrative from the same topic + research context.

---

## Assets Organisation

| Type | Shorts | Long-Form |
|------|--------|-----------:|
| Cloudinary folder | `ai-slideshow/rendered` | `ai-slideshow/rendered-long` |
| Image dimensions | 768×1344 | 1344×768 |
| Video dimensions | 1080×1920 portrait | 1920×1080 landscape |
| Thumbnail | 1280×720 | 1920×1080 |
| Music duration cap | 60s | 300s |
| Caption PlayRes | 1080×1920 | 1920×1080 |
| Caption font size | 72pt | 48pt |
| Caption margins | L:120, R:120, V:1080 | L:120, R:120, V:60 |
| Shots per video | 12–25 | 30–60 |
| Words per shot (caption) | ≤12 | 8–15 |

---

## Files to Modify

### 1. Database Migration

```sql
ALTER TABLE slideshow_jobs ADD COLUMN content_type TEXT NOT NULL DEFAULT 'shorts';
```

Used to distinguish jobs and for scheduler throttle queries.

---

### 2. `lib/constants.ts`

**Add the following — do not touch existing constants:**

```typescript
// ─── Content types ────────────────────────────────────────────────────────────
export const CONTENT_TYPES = {
  SHORTS: 'shorts',
  LONG: 'long',
} as const;
export type ContentType = typeof CONTENT_TYPES[keyof typeof CONTENT_TYPES];

// ─── Long-form video dimensions ───────────────────────────────────────────────
export const LONG_VIDEO_WIDTH = 1920;
export const LONG_VIDEO_HEIGHT = 1080;
export const LONG_CF_AI_SLIDE_WIDTH = 1344;
export const LONG_CF_AI_SLIDE_HEIGHT = 768;
export const LONG_THUMBNAIL_WIDTH = 1920;
export const LONG_THUMBNAIL_HEIGHT = 1080;

// ─── Long-form captions ───────────────────────────────────────────────────────
// At 48pt on a 1920px canvas the effective chars-per-line is ~1.18× the portrait
// value for the same aesthetic (= portrait_maxCharsPerLine × (1920/1080) × (48/72)).
// These are v1 starting values — re-run the fonttools width measurement if fonts change.
export const LONG_CAPTION_MAX_CHARS_PER_LINE = 55;  // conservative centre for all aesthetics
export const LONG_CAPTION_MAX_CHARS = 150;

// Per-aesthetic overrides (same structure as CAPTION_STYLES but with landscape values).
// The fontFamily / fontFile / color fields are identical to CAPTION_STYLES — only the
// char limits change.
export const LONG_FORM_CAPTION_STYLES: Record<string, CaptionStyle> = {
  'tech-minimalist':   { ...CAPTION_STYLES['tech-minimalist'],   maxCharsPerLine: 58, maxChars: 145 },
  'finance-editorial': { ...CAPTION_STYLES['finance-editorial'],  maxCharsPerLine: 60, maxChars: 150 },
  'stoic-zen':         { ...CAPTION_STYLES['stoic-zen'],          maxCharsPerLine: 48, maxChars: 120 },
  'survival-technical':{ ...CAPTION_STYLES['survival-technical'], maxCharsPerLine: 80, maxChars: 200 },
};

export function getLongFormCaptionStyle(aestheticId: string): CaptionStyle {
  return LONG_FORM_CAPTION_STYLES[aestheticId] ?? {
    ...getCaptionStyle(aestheticId),
    maxCharsPerLine: LONG_CAPTION_MAX_CHARS_PER_LINE,
    maxChars: LONG_CAPTION_MAX_CHARS,
  };
}

// ─── Long-form publish schedule ───────────────────────────────────────────────
// 11 UTC — before the shorts window to avoid resource contention.
export const LONG_FORM_PUBLISH_HOUR_UTC = 11;

// ─── Long-form shot counts ────────────────────────────────────────────────────
export const LONG_TEMPLATE_SHOT_COUNTS = { DEEP_DIVE: { min: 30, max: 60 } };

// ─── Long-form niche tone overrides ──────────────────────────────────────────
// Same aestheticId + minQualityScore as NICHE_PROFILES.
// toneInstruction is expanded for the documentary format: longer paragraphs,
// subordinate clauses allowed, slower pacing.
export const LONG_NICHE_PROFILES: Record<string, NicheProfile> = {
  'SaaS & AI Tools': {
    aestheticId: 'tech-minimalist',
    minQualityScore: 7,
    toneInstruction: `You are a documentary narrator chronicling the raw human drama behind the world's most consequential startup bets. Your audience has chosen to spend 4 minutes with you — reward that with depth, not speed.

Write in full paragraphs with flowing sentences (15–25 words). Use subordinate clauses, cause-and-effect transitions, and narrative callbacks. Structure: Hook → Background Context → Pivotal Conflict → Resolution → Modern Significance.

Include exact dates, dollar amounts, and names from the research context. Build tension through accumulating detail, not breathless pace. The ending must recontextualize the entire story — what did this reveal about how the world actually works?

NEVER use "disrupt", "innovate", "unicorn", or "game-changer". NEVER sound like a press release.`,
  },
  'Financial Forensics': {
    aestheticId: 'finance-editorial',
    minQualityScore: 7,
    toneInstruction: `You are the investigative journalist who broke Enron, reconstructing a financial crime scene for an audience willing to follow every thread. Your tone is grave, forensically precise, and methodical.

Write in flowing paragraphs, 15–25 words per sentence. Use transitions that build a chronological evidence trail. Structure: The Revelation → The Setup → The Paper Trail → The Collapse → The Reckoning.

Every number is a body blow — the exact trade, the forged signature, the meeting where someone should have asked the question but didn't. Humanize the perpetrators without excusing them.

NEVER use "mind-blowing", "insane", or "unbelievable". Let the facts speak.`,
  },
  'Stoic Philosophy': {
    aestheticId: 'stoic-zen',
    minQualityScore: 7,
    toneInstruction: `You are Marcus Aurelius writing to himself after a decade of war — earned wisdom, not motivational platitude. Your audience has given you 4 minutes; give them something they'll carry.

Write in measured paragraphs, 15–25 words per sentence. Use contrast (the weak response vs the disciplined response), historical anchoring (specific Stoic figures and their trials), and direct address to the modern struggle. Structure: The Principle → Its Ancient Origin → Its Modern Manifestation → The Practice → The Verdict.

Be cold, precise, and hard. No comfort. No fluff. Every sentence should land like a verdict.

NEVER sound like an Instagram quote. NEVER use "vibes", "manifest", "energy", or "the universe".`,
  },
  'Urban Survival': {
    aestheticId: 'survival-technical',
    minQualityScore: 7,
    toneInstruction: `You are the calm, credible mentor who has been through the worst and is sharing hard-won knowledge for 4 minutes — not a 30-second tip.

Write in clear, authoritative paragraphs, 15–25 words per sentence. Every claim must be actionable by an average person. Use the ticking-clock structure for urgency: the 3-minute window, the 15-second countdown, the cascade of decisions. Structure: The Scenario → Why Most People Get It Wrong → The Correct Protocol → The Underlying Principle → How to Train for It.

NEVER sound alarmist, conspiratorial, or like a motivational Instagram post.`,
  },
};
```

**Modify the existing `FORMAT_TEMPLATES` const** to include `DEEP_DIVE`:

```typescript
// BEFORE:
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST'] as const;

// AFTER:
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST', 'DEEP_DIVE'] as const;
```

**Add `DEEP_DIVE` to `FORMAT_TEMPLATE_WEIGHTS`** (weight = 0 for all shorts niches — the bandit will never pick it for shorts):

```typescript
export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'SaaS & AI Tools':      { RAPID_FIRE: 0.1,  SLOW_BURN: 0.7, THE_LIST: 0.2, DEEP_DIVE: 0 },
  'Financial Forensics':  { RAPID_FIRE: 0.8,  SLOW_BURN: 0.2, THE_LIST: 0,   DEEP_DIVE: 0 },
  'Stoic Philosophy':     { RAPID_FIRE: 0,    SLOW_BURN: 0.7, THE_LIST: 0.3, DEEP_DIVE: 0 },
  'Urban Survival':       { RAPID_FIRE: 0,    SLOW_BURN: 0.6, THE_LIST: 0.4, DEEP_DIVE: 0 },
};
```

**Add `DEEP_DIVE` to `TEMPLATE_SHOT_COUNTS`:**

```typescript
export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 12, max: 15 },
  SLOW_BURN:  { min: 12, max: 12 },
  THE_LIST:   { min: 12, max: 14 },
  DEEP_DIVE:  { min: 30, max: 60 },  // long-form only — never selected by shorts bandit
};
```

**Update `pickFormatTemplateSync`** in `lib/topicGenerator.ts` to guard against DEEP_DIVE being selected for shorts (the 0-weight entries in FORMAT_TEMPLATE_WEIGHTS mean it can't happen through the weighted path, but the fallback function should be explicit):

```typescript
function pickFormatTemplateSync(niche: string): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3, DEEP_DIVE: 0 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST';  // DEEP_DIVE is never returned here — long-form selects it directly
}
```

---

### 3. `lib/types.ts`

```typescript
// Add ContentType import (re-export from constants or define locally):
export type ContentType = 'shorts' | 'long';

// Extend SlideshowScript:
export type SlideshowScript = {
  title: string;
  description: string;
  visual_world: 'tech-minimalist' | 'finance-editorial' | 'stoic-zen' | 'survival-technical';
  format_template: 'RAPID_FIRE' | 'SLOW_BURN' | 'THE_LIST' | 'DEEP_DIVE';  // add DEEP_DIVE
  fact_check_and_sources: string;
  tags: string[];
  shots: Shot[];
  thumbnailPrompt: string;
  hook_intro: string;
  voiceName: string;
  contentType?: ContentType;  // add — used by pipeline to route render config
};

// Extend SlideshowJob:
export interface SlideshowJob {
  // ... existing fields ...
  content_type: ContentType;  // add
}
```

---

### 4. `lib/database.ts`

Four changes, all surgical:

**4a. Add `'content_type'` to `JOB_COLUMNS`:**

```typescript
const JOB_COLUMNS = new Set([
  'account_id', 'topic', 'niche', 'format_template', 'status',
  'inngest_run_id', 'imageBatchName', 'audioBatchName', 'script',
  'shot_image_urls', 'narration_audio_url', 'shot_audio_urls', 'music_url', 'video_url', 'thumbnail_url',
  'youtube_video_id', 'error_message', 'variant',
  'content_type',  // NEW
]);
```

**4b. Update `createJob()` SQL and signature** — the INSERT is hardcoded, so both the string and the values array need changing:

```typescript
createJob: async (data: {
  account_id: string;
  topic: string;
  niche: string;
  format_template: string;
  script: any;
  status: string;
  variant?: string;
  content_type?: string;   // NEW — defaults to 'shorts'
}) => {
  const res = await query(
    `INSERT INTO slideshow_jobs
       (account_id, topic, niche, format_template, script, status, variant, content_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      data.account_id, data.topic, data.niche, data.format_template,
      serializeJsonbValue(data.script), data.status,
      data.variant || null,
      data.content_type || 'shorts',  // NEW
    ]
  );
  return res.rows[0].id;
},
```

**4c. Add `getIncompleteJobByType()`** — replaces direct calls to `getIncompleteJob` inside long-form pipeline and its failure handler. Do NOT modify `getIncompleteJob` itself (shorts pipeline depends on it):

```typescript
getIncompleteJobByType: async (accountId: string, contentType: string) => {
  const res = await query(
    `SELECT * FROM slideshow_jobs
     WHERE account_id = $1
       AND content_type = $2
       AND status NOT IN ('published', 'failed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId, contentType]
  );
  return res.rows[0] ?? null;
},
```

**4d. Add `getLastJobByType()` for throttle queries** (used by long-form scheduler):

```typescript
getLastJobByType: async (accountId: string, contentType: string, hours: number) => {
  const res = await query(
    `SELECT id FROM slideshow_jobs
     WHERE account_id = $1
       AND content_type = $2
       AND status IN ('published', 'assembled')
       AND created_at > NOW() - INTERVAL '${hours} hours'
     LIMIT 1`,
    [accountId, contentType]
  );
  return res.rows[0] ?? null;
},
```

---

### 5. `lib/topicGenerator.ts` — new `generateLongFormScript()`

**5a. New Zod schemas** (parallel to `SlideshowScriptSchema`, not extending it):

```typescript
const LongShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string().min(30).max(800),
  caption_text: z.string()
    .refine(t => t.trim().split(/\s+/).length >= 1, 'Min 1 word')
    .refine(t => t.trim().split(/\s+/).length <= 20, 'Max 20 words')  // wider than shorts 12
    .refine(t => !/\[.*?\]/.test(t), 'No director tags'),
  spoken_text: z.string().min(1),
  is_conclusion: z.boolean().default(false),
});

const LongFormScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10),
    source: z.string().min(5),
  })).min(5),  // higher bar — deep dive has more facts
  visual_world: z.enum(['tech-minimalist', 'finance-editorial', 'stoic-zen', 'survival-technical']),
  format_template: z.literal('DEEP_DIVE'),
  title: z.string().min(5).max(100),
  description: z.string().min(50).max(1000),
  tags: z.array(z.string()).min(5).max(15),
  voiceName: z.string().min(1),
  shots: z.array(LongShotSchema).min(30).max(60),
  thumbnailPrompt: z.string().min(30).max(500),
}).refine(data => data.shots.filter(s => s.is_conclusion).length === 1, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => data.shots[data.shots.length - 1].is_conclusion, {
  message: 'The conclusion shot must be the last shot',
});
```

**5b. Long-form quality gate dimensions:**

```typescript
const LONG_QUALITY_SCORE_DIMENSIONS = [
  'narrative_coherence', 'factual_depth', 'arc_satisfaction',
  'visual_variety', 'information_density', 'tone_calibration',
] as const;

const LongQualityScoreSchema = z.object({
  narrative_coherence:  z.number().min(0).max(10),  // story flows hook → synthesis
  factual_depth:        z.number().min(0).max(10),  // specific dates/names/numbers used
  arc_satisfaction:     z.number().min(0).max(10),  // ending pays off the hook
  visual_variety:       z.number().min(0).max(10),  // prompts are diverse across 30-60 shots
  information_density:  z.number().min(0).max(10),  // every shot advances narrative, no filler
  tone_calibration:     z.number().min(0).max(10),  // matches long-form niche tone
  overall:  z.number().min(0).max(10),
  issues:   z.array(z.string()),
  approved: z.boolean(),
});
```

**5c. Pass 1 — Long-form narrative generation** (temp=0.8):

System prompt key differences from `generateNarrative()`:
- Target **450–750 words** (not 90–110)
- Sentences **15–25 words** with subordinate clauses allowed (not ≤15 words punchy)
- Structure mandate: `Hook → Context → Deep Exploration (3-4 dimensions) → Modern Relevance → Synthesis`
- Specific dates/names/numbers from research context required
- No 60s pacing constraint — this is prose, not caption bullets

**5d. Pass 2 — Long-form chunking** (temp=0.2):

Key differences from `chunkScriptToJSON()`:
- Slice into **30–60 shots** (not 12–25)
- Each shot: **8–15 spoken words** (~3–6s at 2.5 wps)
- `caption_text`: verbatim slice, up to 20 words (landscape has more room — `LONG_CAPTION_MAX_CHARS_PER_LINE` applies)
- `visual_prompt`: FLUX-optimized for **1344×768 landscape**
- `format_template` in JSON output must be `"DEEP_DIVE"`
- Caption validation uses `getLongFormCaptionStyle(aesthetic.id)` not `getCaptionStyle()`

**5e. `hook_intro` derivation** (same as `generateScript`) — must be included:

```typescript
const hookWords = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ');
const hook_intro = hookWords.replace(/[.!?:;,]/g, '');
```

**5f. Export function signature:**

```typescript
export async function generateLongFormScript(
  niche: string,
  accountId: string,
): Promise<{ script: SlideshowScript; topic: string; formatTemplate: string }> {
  const profile = LONG_NICHE_PROFILES[niche] ?? NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];

  const reserved = await reserveTopic(niche, accountId);

  try {
    // Pass 1: 450-750 word deep narrative
    const narrative = await generateLongFormNarrative(reserved.topic, reserved.research_context, profile.toneInstruction);

    let lastScore = null;
    let validationFeedback = '';

    for (let attempt = 0; attempt <= QUALITY_GATE_MAX_RETRIES; attempt++) {
      const parsed = await chunkLongFormScriptToJSON(/* ... */);

      let validated: z.infer<typeof LongFormScriptSchema>;
      try {
        validated = LongFormScriptSchema.parse(parsed);
      } catch (zodErr) {
        // same feedback-loop pattern as generateScript
      }

      // Caption validation using landscape char limits
      const captionValidation = validateAllCaptions(
        validated.shots.map(s => ({ caption_text: s.caption_text })),
        getLongFormCaptionStyle(aesthetic.id),  // NOT getCaptionStyle()
      );

      const score = await scoreLongFormScript(validated, reserved.research_context, niche, profile.minQualityScore);
      const passesFloor = score.overall >= profile.minQualityScore &&
        LONG_QUALITY_SCORE_DIMENSIONS.every(dim => score[dim] >= 5);

      if ((score.approved && passesFloor) || attempt === QUALITY_GATE_MAX_RETRIES) {
        const hook_intro = validated.shots[0].caption_text.split(/\s+/).slice(0, 4).join(' ').replace(/[.!?:;,]/g, '');
        return {
          script: {
            title: validated.title,
            description: validated.description,
            visual_world: validated.visual_world,
            format_template: 'DEEP_DIVE',
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
            contentType: 'long',
          },
          topic: reserved.topic,
          formatTemplate: 'DEEP_DIVE',
        };
      }

      lastScore = score;
      validationFeedback = `Quality Gate Failed. Issues: ${score.issues.join(' | ')}`;
    }

    throw new Error(`Long-form script generation failed after all retries. Final critique: ${lastScore?.issues.join(' | ')}`);
  } catch (err) {
    await releaseTopic(reserved.id);
    throw err;
  }
}
```

---

### 6. `lib/musicSelector.ts`

**Two changes:**

**6a. Remove the 60s cap** — line 129 currently reads:
```typescript
const duration = Math.max(30, Math.min(durationSeconds, 60));
```
Change to respect the caller's requested duration (pipeline caps at 300s for long-form):
```typescript
const duration = Math.max(30, durationSeconds);
```

**6b. Add `DEEP_DIVE` entries to `NICHE_MUSIC_PROMPTS`:**

```typescript
const NICHE_MUSIC_PROMPTS: Record<string, Partial<Record<FormatTemplate, string[]>>> = {
  'Financial Forensics': {
    // ... existing RAPID_FIRE / SLOW_BURN / THE_LIST entries ...
    DEEP_DIVE: [
      'dark ambient documentary score, slow evolving strings, tense piano motif, investigative, cinematic build, 65bpm',
      'minimal orchestral, brooding cello ostinato, sparse brass swells, cold and precise, 60bpm',
    ],
  },
  'Stoic Philosophy': {
    // ... existing entries ...
    DEEP_DIVE: [
      'neoclassical ambient, solo cello, slow evolving string pads, contemplative, meditative depth, 55bpm',
      'cinematic orchestral, gradual crescendo, emotional but restrained, ancient and timeless, 60bpm',
    ],
  },
  'Urban Survival': {
    // ... existing entries ...
    DEEP_DIVE: [
      'dark cinematic, low drones with distant percussion, tactical, methodical build, foreboding, 60bpm',
      'ambient industrial, slow sub-bass pulse, sparse metallic percussion, ominous, deliberate, 65bpm',
    ],
  },
  'SaaS & AI Tools': {
    // ... existing entries ...
    DEEP_DIVE: [
      'ambient electronic documentary score, soft evolving pads, minimal beat, hopeful and reflective, 65bpm',
      'lo-fi cinematic, warm piano, gentle atmospheric synth, contemplative, optimistic depth, 60bpm',
    ],
  },
};
```

**ACE-Step timeout** — increase `FETCH_TIMEOUT_MS` from 3 min to 8 min to accommodate 3–5 min audio generation:

```typescript
// BEFORE:
const FETCH_TIMEOUT_MS = 3 * 60 * 1000;

// AFTER:
const FETCH_TIMEOUT_MS = 8 * 60 * 1000;
```

> **Note:** This timeout increase applies to shorts too (currently 3 min, which is already tight for 60s audio). Raising to 8 min is safe — shorts never approaches it.

---

### 7. `modal/render.py`

Four changes:

**7a. Increase function timeout from 600s → 1800s.** 60 shots × zoompan render time easily exceeds 10 min:

```python
# BEFORE:
@app.function(cpu=8.0, timeout=600, secrets=[modal.Secret.from_name("cloudinary")])

# AFTER:
@app.function(cpu=8.0, timeout=1800, secrets=[modal.Secret.from_name("cloudinary")])
```

**7b. Add `get_render_config()` helper:**

```python
def get_render_config(content_type: str) -> dict:
    if content_type == 'long':
        return {
            'play_res_x': 1920, 'play_res_y': 1080,
            'font_size': 48,
            'margin_l': 120, 'margin_r': 120, 'margin_v': 60,
            'scale': '1920:1080', 'size': '1920x1080',
            'cloudinary_folder': 'ai-slideshow/rendered-long',
        }
    return {
        'play_res_x': 1080, 'play_res_y': 1920,
        'font_size': 72,
        'margin_l': 120, 'margin_r': 120, 'margin_v': 1080,
        'scale': '1080:1920', 'size': '1080x1920',
        'cloudinary_folder': 'ai-slideshow/rendered',
    }
```

**7c. Add `content_type` parameter to `render_video()` and thread it through:**

```python
# BEFORE:
def render_video(job_id, account_id, shots, audio_url, music_url, callback_url, visual_world=None, caption_style=None, shot_audio_urls=None):

# AFTER:
def render_video(job_id, account_id, shots, audio_url, music_url, callback_url, visual_world=None, caption_style=None, shot_audio_urls=None, content_type='shorts'):
    cfg = get_render_config(content_type)
    # Use cfg['scale'], cfg['size'], cfg['cloudinary_folder'] etc. throughout
```

Specifically, `cfg` replaces all hardcoded `"1080:1920"`, `"1080x1920"`, and `"ai-slideshow/rendered"` strings in the function body. Update:
- `build_continuous_ass()` call — pass `cfg['play_res_x']`, `cfg['play_res_y']`, `cfg['font_size']`, `cfg['margin_v']`
- `build_continuous_ass()` function signature — accept these as params instead of hardcoding in `[Script Info]`
- Every `zoompan` filter — replace `scale=1080:1920` and `s=1080x1920` with `cfg['scale']` and `cfg['size']`
- Cloudinary `folder=` kwarg — use `cfg['cloudinary_folder']`

**7d. Thread `content_type` through `trigger_render` → `render_video.spawn()`:**

```python
@modal.fastapi_endpoint(method="POST")
async def trigger_render(request: Request):
    payload = await request.json()
    # ... existing field unpacking ...
    content_type = payload.get('content_type', 'shorts')  # NEW

    render_video.spawn(
      job_id, account_id, shots, audio_url, music_url,
      callback_url, visual_world, caption_style, shot_audio_urls,
      content_type  # NEW — must match render_video() signature order
    )
```

---

### 8. `inngest/pipeline.ts` — new `generateLongForm` function

```typescript
import {
  generateLongFormScript,
} from '@/lib/topicGenerator';
import {
  LONG_CF_AI_SLIDE_WIDTH, LONG_CF_AI_SLIDE_HEIGHT,
  LONG_NICHE_PROFILES, NICHE_PROFILES, DEFAULT_NICHE_PROFILE,
  ACCOUNT_NICHE, NICHES, MODAL_RENDER_URL,
  ACE_STEP_WARMUP_URL, getCaptionStyle,
} from '@/lib/constants';

export const generateLongForm = inngest.createFunction(
  {
    id: 'generate-long-form',
    retries: 3,
    timeouts: { finish: '3h' },  // longer than shorts' 2h
    triggers: [{ event: 'slideshow/trigger-long' }],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Long-form pipeline failed: ${error.message}`);
      const accountId = (event as any)?.data?.accountId;
      const explicitJobId = (event as any)?.data?.jobId;
      try {
        const job = explicitJobId
          ? await db.getJob(explicitJobId)
          : accountId
            ? await db.getIncompleteJobByType(accountId, 'long')  // NOT getIncompleteJob
            : null;
        if (job?.id) {
          await db.updateJob(job.id, { status: 'failed', error_message: error.message });
        }
      } catch (dbErr: any) {
        console.error(`[CRITICAL] Failed to update long-form job failure status: ${dbErr.message}`);
      }
    },
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;
    const explicitJobId: string | undefined = event.data.jobId;
    const skipPublish: boolean = event.data.skipPublish === true;

    // ── Step 1: Script + GPU warmup (parallel) ────────────────────────────────
    const [scriptResult] = await Promise.all([
      step.run('generate-long-script', async () => {
        const jobToResume = explicitJobId
          ? await db.getJob(explicitJobId)
          : await db.getIncompleteJobByType(accountId, 'long');  // type-safe resume

        if (jobToResume) {
          console.log(`[LongForm] Resuming job ${jobToResume.id} (status: ${jobToResume.status})`);
          if (!jobToResume.script) throw new Error(`Job ${jobToResume.id} has no script`);
          return {
            script: jobToResume.script,
            jobId: jobToResume.id,
            format_template: jobToResume.format_template,
            niche: jobToResume.niche,
            topic: jobToResume.topic,
          };
        }

        const niche = ACCOUNT_NICHE[accountId] ?? NICHES[Math.floor(Math.random() * NICHES.length)];
        const { script, topic, formatTemplate } = await generateLongFormScript(niche, accountId);

        const jobId = await db.createJob({
          account_id: accountId,
          topic,
          niche,
          format_template: formatTemplate,
          script,
          status: 'script_ready',
          content_type: 'long',  // critical — must be set here
        });

        (event as any).data.jobId = jobId;
        return { script, jobId, format_template: formatTemplate, niche, topic };
      }),

      step.run('warmup-bgm-gpu', async () => {
        if (!ACE_STEP_WARMUP_URL) return { status: 'skipped' };
        try {
          const res = await fetch(ACE_STEP_WARMUP_URL, { method: 'GET' });
          if (!res.ok) console.warn(`[LongForm] BGM Warmup failed: ${res.status}`);
          return { status: 'warmed' };
        } catch {
          return { status: 'failed' };
        }
      }),
    ]);

    const { script, jobId, format_template, niche, topic } = scriptResult;

    // ── Step 2a: Narration (same F5-TTS, just 30-60 shots instead of 12-25) ──
    const { shotAudioUrls, narrationDurationMs } = await step.run('generate-narration', async () => {
      // Identical implementation to generateShort's generate-narration step
      // — no changes needed, it iterates script.shots regardless of count.
    });

    const narrationDurationSec = Math.ceil(narrationDurationMs / 1000) || 180;  // default 3min for long-form

    // ── Step 2b: Images + Music + Thumbnail (parallel) ────────────────────────
    const [imageUrls, musicUrl] = await Promise.all([

      step.run('generate-all-images', async () => {
        // Same idempotency pattern as generateShort.
        // Key difference: pass LONG_CF_AI_SLIDE_WIDTH / LONG_CF_AI_SLIDE_HEIGHT (1344×768).
        // generateImage() already accepts arbitrary width/height — no changes needed there.
        const job = await db.getJob(jobId);
        const existingUrls = job?.shot_image_urls || [];
        const urls: string[] = [...existingUrls];

        if (urls.length >= script.shots.length && urls.slice(0, script.shots.length).every(Boolean)) {
          return urls.slice(0, script.shots.length);
        }

        const creds = await getAccountCredentials(accountId);
        const CONCURRENCY_LIMIT = 5;

        for (let batchStart = 0; batchStart < script.shots.length; batchStart += CONCURRENCY_LIMIT) {
          const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.shots.length);
          const batch = script.shots.slice(batchStart, batchEnd);

          const batchResults = await Promise.all(
            batch.map(async (shot: Shot, offset: number) => {
              const globalIndex = batchStart + offset;
              if (urls[globalIndex]) return urls[globalIndex];
              const rawImageBuffer = await generateImage(
                shot.visual_prompt,
                LONG_CF_AI_SLIDE_WIDTH,   // 1344
                LONG_CF_AI_SLIDE_HEIGHT,  // 768
              );
              return uploadSlideImage(rawImageBuffer, jobId, globalIndex, creds);
            })
          );

          batchResults.forEach((url, offset) => { urls[batchStart + offset] = url; });
          await db.updateJob(jobId, { shot_image_urls: urls });
        }

        return urls;
      }),

      step.run('select-music', async () => {
        const job = await db.getJob(jobId);
        if (job?.music_url) return job.music_url;

        const creds = await getAccountCredentials(accountId);
        const narrationText = script.shots.map((s: Shot) => s.spoken_text).join(' ');
        // narrationDurationSec is passed uncapped — musicSelector.ts no longer enforces 60s max
        const { buffer } = await selectMusicTrack(script.title, niche, format_template as FormatTemplate, script.visual_world, narrationText, Math.min(narrationDurationSec, 300));
        const url = await uploadMusicTrack(buffer, jobId, creds);
        await db.updateJob(jobId, { music_url: url });
        return url;
      }),

      step.run('generate-thumbnail', async () => {
        const job = await db.getJob(jobId);
        if (job?.thumbnail_url) return job.thumbnail_url;

        const creds = await getAccountCredentials(accountId);
        const thumbText = script.hook_intro
          ? `${script.hook_intro.slice(0, 40)} — ${script.title}`
          : script.title;
        // generateThumbnail must accept optional width/height — verify before wiring.
        // If it doesn't, add them: generateThumbnail(text, prompt, niche, LONG_THUMBNAIL_WIDTH, LONG_THUMBNAIL_HEIGHT)
        const thumbBuffer = await generateThumbnail(thumbText, script.thumbnailPrompt, niche);
        const url = await uploadThumbnail(thumbBuffer, jobId, creds);
        await db.updateJob(jobId, { thumbnail_url: url });
        return url;
      }),
    ]);

    await step.run('update-assets-ready', async () => {
      await db.updateJob(jobId, { status: 'assets_ready' });
    });

    // ── Step 3: Render ────────────────────────────────────────────────────────
    const videoUrl = await step.run('render-video', async () => {
      const job = await db.getJob(jobId);
      if (job?.video_url) return job.video_url;

      if (!MODAL_RENDER_URL || MODAL_RENDER_URL.includes('example-modal-url')) {
        throw new Error('MODAL_RENDER_URL is not configured');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(MODAL_RENDER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            accountId,
            content_type: 'long',           // NEW — triggers get_render_config('long') in render.py
            visual_world: script.visual_world,
            caption_style: getCaptionStyle(script.visual_world),
            shots: script.shots.map((shot: Shot, i: number) => ({
              image_url: imageUrls[i],
              caption_text: shot.caption_text,
              spoken_text: shot.spoken_text,
              audio_url: shotAudioUrls[i],
            })),
            shot_audio_urls: shotAudioUrls,
            music_url: musicUrl,
            callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/modal`,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const msg = `Modal returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
          if (response.status >= 400 && response.status < 500) throw new NonRetriableError(msg);
          throw new Error(msg);
        }

        const body = await response.json();
        if (body.error) throw new NonRetriableError(`Modal render failed: ${body.error}`);

        if (body.videoUrl || body.mp4Url) {
          const url = body.videoUrl || body.mp4Url;
          await db.updateJob(jobId, { video_url: url, status: 'assembled' });
          return url;
        }
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    });

    let resolvedVideoUrl = videoUrl;

    if (!videoUrl) {
      const modalResult = await step.waitForEvent('wait-for-modal', {
        event: 'modal/render.complete',
        timeout: '30m',  // long-form render takes longer — increased from 10m
        if: `async.data.jobId == '${jobId}'`,
      }).catch(() => null);

      if (modalResult?.data?.error) throw new NonRetriableError(`Modal render failed asynchronously: ${modalResult.data.error}`);
      if (!modalResult?.data?.mp4Url) throw new Error('Modal render did not complete within 30 minutes');
      resolvedVideoUrl = modalResult.data.mp4Url;
    }

    // ── Step 4: Publish ───────────────────────────────────────────────────────
    if (!skipPublish) {
      await step.run('publish', async () => {
        if (process.env.INNGEST_DEV === '1') {
          console.log('[LongForm] Skipping publish — INNGEST_DEV is set');
          return;
        }

        const job = await db.getJob(jobId);
        if (job?.status === 'published') return;

        const creds = await getAccountCredentials(accountId);
        const jobRecord = await query('SELECT thumbnail_url FROM slideshow_jobs WHERE id = $1', [jobId]);

        let thumbRes;
        for (let t = 0; t < 3; t++) {
          thumbRes = await fetch(jobRecord.rows[0].thumbnail_url);
          if (thumbRes.ok) break;
          await new Promise(res => setTimeout(res, 1000));
        }
        if (!thumbRes?.ok) throw new Error('Failed to fetch thumbnail for YouTube upload');

        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
        // uploadToYouTube — no #Shorts tag appended (handled by caller's script.contentType check
        // or simply by not passing isShorts=true — verify youtubeUpload.ts signature).
        const result = await uploadToYouTube(resolvedVideoUrl, thumbBuffer, script, creds);

        await query(
          `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags, variant)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags), null]
        );

        await db.updateJob(jobId, {
          status: 'published',
          video_url: resolvedVideoUrl,
          youtube_video_id: result.youtubeVideoId,
        });
      });
    }
  }
);
```

---

### 9. `inngest/pipeline.ts` — long-form scheduler

```typescript
export const longFormScheduler = inngest.createFunction(
  {
    id: 'long-form-scheduler',
    retries: 1,
    triggers: [{ cron: '0 11 * * *' }],  // 11 UTC daily — before shorts window
    onFailure: async ({ error }) => {
      console.error(`[CRITICAL] Long-form scheduler failed: ${error.message}`);
    },
  },
  async ({ step }) => {
    const accounts = await step.run('get-accounts', async () => {
      const result = await query<{ id: string }>(
        "SELECT id FROM accounts WHERE status = 'active'"
      );
      return result.rows.map(r => r.id);  // just IDs — niche lookup not needed here
    });

    let triggered = 0;
    let skipped = 0;

    for (const accountId of accounts) {
      const shouldRun = await step.run(`check-48h-throttle-${accountId}`, async () => {
        const recent = await db.getLastJobByType(accountId, 'long', 48);
        return recent === null;
      });

      if (shouldRun) {
        await step.sendEvent(`trigger-long-${accountId}`, {
          name: 'slideshow/trigger-long',
          data: { accountId },
        });
        console.log(`[LongFormScheduler] Triggered long-form for ${accountId}`);
        triggered++;
      } else {
        console.log(`[LongFormScheduler] Skipping ${accountId} — long-form published within 48h`);
        skipped++;
      }
    }

    return { triggered, skipped };
  }
);
```

---

### 10. Trigger Scripts

**`scripts/trigger.ts`** — add `--contentType` flag:

```typescript
const args = process.argv.slice(2);
const contentTypeIdx = args.indexOf('--contentType');
const contentType = contentTypeIdx !== -1 ? args[contentTypeIdx + 1] : 'shorts';
const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';

// Change inngest.send() call:
const result = await inngest.send({
  name: eventName,
  data: { accountId, skipPublish: true },
});

// Also update the DB poll to filter by content_type:
const res = await query<{ id: string; status: string; video_url: string | null }>(
  `SELECT id, status, video_url FROM slideshow_jobs
   WHERE account_id = $1 AND content_type = $2
   ORDER BY created_at DESC LIMIT 1`,
  [accountId, contentType]
);
```

**`scripts/trigger-prod.ts`** — same `--contentType` pattern.

**`package.json`** — new scripts:

```json
{
  "trigger:long": "npx tsx scripts/trigger.ts --contentType long",
  "trigger:long:prod": "npx tsx scripts/trigger-prod.ts --contentType long"
}
```

---

### 11. `app/api/cron/route.ts`

```typescript
const contentType = body.contentType || 'shorts';
const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';
```

---

### 12. `lib/youtubeUpload.ts`

No structural changes. When `contentType === 'long'`:
- Do not append `#Shorts` hashtags (YouTube auto-detects format from dimensions + duration > 60s)
- Same `categoryId: '27'` (Education)
- Same `privacyStatus: 'unlisted'`
- Thumbnail generated at 1920×1080 for long-form (passed in as buffer — no change needed here)

Verify the function doesn't hardcode `#Shorts` unconditionally — if it does, add a guard based on `script.contentType`.

---

## Pipeline Flow

```
longFormScheduler (cron: 0 11 * * *)
  │   checks 48h throttle per account (content_type = 'long')
  │
  └─ slideshow/trigger-long { accountId }
       │
       ├─ Step 1 (parallel):
       │   ├─ generate-long-script
       │   │   ├─ getIncompleteJobByType(accountId, 'long')  ← type-safe resume
       │   │   ├─ generateLongFormScript()
       │   │   │   ├─ reserveTopic()
       │   │   │   ├─ Pass 1: 450-750 word narrative (temp=0.8)
       │   │   │   ├─ Pass 2: chunk into 30-60 shots (temp=0.2)
       │   │   │   └─ quality gate (min 7, 4 retries, long rubric)
       │   │   └─ createJob({ content_type: 'long' })
       │   └─ warmup-bgm-gpu
       │
       ├─ Step 2a: generate-narration
       │   └─ F5-TTS per-shot, batch=5 (same impl, more shots)
       │
       ├─ Step 2b (parallel):
       │   ├─ generate-all-images (1344×768)
       │   ├─ select-music (DEEP_DIVE prompts, ≤300s, no 60s cap)
       │   └─ generate-thumbnail (1920×1080)
       │
       ├─ Step 3: render-video
       │   └─ Modal: content_type='long' → get_render_config('long')
       │          1920×1080 landscape, 48pt ASS, rendered-long folder
       │          timeout=1800s
       │
       └─ Step 4: publish
           └─ YouTube standard upload (no #Shorts tag)
```

---

## Scheduling Diagram

```
Day 1        Day 2        Day 3        Day 4
┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
│Short │    │Short │    │Short │    │Short │  ← daily shorts (15-21 UTC per niche)
│      │    │Long  │    │      │    │Long  │  ← every-other-day long (11 UTC)
└──────┘    └──────┘    └──────┘    └──────┘
```

---

## Implementation Order

Execute in this sequence — each step is a dependency for the next:

1. **Database migration** — add `content_type` column
2. **`lib/constants.ts`** — `CONTENT_TYPES`, landscape dims, `DEEP_DIVE` additions, `LONG_NICHE_PROFILES`, `LONG_FORM_CAPTION_STYLES`
3. **`lib/types.ts`** — `ContentType`, extend `SlideshowScript` and `SlideshowJob`
4. **`lib/database.ts`** — `JOB_COLUMNS` update, `createJob` SQL fix, `getIncompleteJobByType`, `getLastJobByType`
5. **`lib/topicGenerator.ts`** — `LongShotSchema`, `LongFormScriptSchema`, `LongQualityScoreSchema`, `generateLongFormScript`
6. **`lib/musicSelector.ts`** — remove 60s cap, `DEEP_DIVE` prompts, `FETCH_TIMEOUT_MS` to 8min
7. **`modal/render.py`** — `get_render_config()`, `timeout=1800`, `content_type` param through `render_video` + `trigger_render`
8. **Deploy Modal** — `python3 -m modal deploy modal/render.py` ← before wiring Inngest
9. **`inngest/pipeline.ts`** — `generateLongForm` function + `longFormScheduler`
10. **Trigger scripts + `package.json`** — `--contentType` flag, new npm scripts
11. **`app/api/cron/route.ts`** — `contentType` routing
12. **Run migration on production DB**
13. **Smoke test** — `npm run trigger:long` (local, skipPublish=true), verify Cloudinary URL is landscape

---

## Pre-Implementation Checklist

Before writing a line of code, verify:

- [ ] `lib/thumbnailGenerator.ts` accepts `width`/`height` params (or add them) — long-form needs 1920×1080
- [ ] `lib/youtubeUpload.ts` does not hardcode `#Shorts` unconditionally — add `script.contentType` guard if it does
- [ ] Modal `slideshow-render` app has the Cloudinary secret set for all accounts in the `rendered-long` folder
- [ ] ACE-Step Modal app (`bgm-generator`) can handle 300s generation requests without its own timeout killing it

---

## Trade-offs & Decisions

| Decision | Why |
|----------|-----|
| Single `DEEP_DIVE` format for v1 | Simplest starting point; can add `COMPARISON` or `GUIDE` later |
| `DEEP_DIVE` in main `FORMAT_TEMPLATES` (not separate) | Prevents `FormatTemplate` union from excluding it in `musicSelector.ts` and `topicGenerator.ts` |
| `getIncompleteJobByType` not modifying `getIncompleteJob` | Surgical — shorts pipeline is unaffected |
| `createJob` SQL updated explicitly | `JOB_COLUMNS` only guards `updateJob`; INSERT is a hardcoded string |
| `timeout=1800` for all renders | Shorts never approaches 600s anyway; single cap is simpler than branching |
| 48h throttle vs weekly | Matches "every other day" cadence; avoids flooding the channel |
| Same render.py function | Avoids duplicating 500 lines of FFmpeg orchestration |
| New Cloudinary folder | Keeps shorts and long assets separate for cleanup/analytics |
| `step.waitForEvent` timeout extended to 30m | 30-60 shot render is ~3× longer than shorts |
