# AI Slideshow — Production-Ready Pipeline

## Architecture Philosophy

Vercel handles HTTP only. Inngest owns all state, retry logic, and scheduling. Modal owns all compute. Gemini owns all generation. Nothing waits, nothing polls synchronously, nothing blocks.

---

## Channels & Niches

| Channel | Niche | Voice | Aesthetic |
|---------|-------|-------|-----------|
| `english_shots` | SaaS & AI Tools | Tech reviewer — crisp, fast, zero hype | Premium 2D vector flat art, clean UI mockup style |
| `astronomy_shots` | Financial Forensics | Investigative journalist — grave, precise, numbers-driven | Vintage archival B&W, declassified dossier style |
| `health_shots` | Stoic Philosophy | Philosopher-warrior — deep, measured, unflinching | Dark cinematic, chiaroscuro, solitary figures |
| `ssc_shots` | Urban Survival | Tactical briefing — urgent, operational, spec-driven | Hyper-realistic tactical photography, matte black |

Each channel publishes once every 24 hours.

---

## Content Strategy

### Topic Generation
Gemini generates 20 topic ideas per niche. Topics stored in DB, atomically locked on use. Niche-specific criteria enforced in prompt:

- **SaaS & AI Tools:** Name exact tools (Make.com, Zapier, Claude, Cursor). Concrete time/cost savings with real numbers.
- **Financial Forensics:** Exact dollar amounts, dates, full names of people involved in collapses or fraud.
- **Stoic Philosophy:** Specific principles with named historical anecdotes (Marcus Aurelius, Seneca, Epictetus), actionable modern applications.
- **Urban Survival:** Specific gear with exact specs, emergency scenarios, tactical skills — actionable, not alarmist.

### Format Templates
Each topic is tagged with one of three templates at generation time. Template assignment follows niche weights. The template drives shot count and narrative rhythm.

| Template | Shot Count | Narrative Structure | Assigned By |
|----------|------------|---------------------|-------------|
| `RAPID_FIRE` | 15–18 shots | Dense sequential facts, no transition words, relentless pace | 80% SaaS, 80% Finance |
| `SLOW_BURN` | 12 shots exactly | Shots 1–3 build ominous context. Shots 4–8 escalate with hard facts. Shots 9–12 hit with maximum force. | 70% Stoic, 60% Survival |
| `THE_LIST` | 15 shots exactly | 5 distinct numbered items, 3 visual angles per item | 20% SaaS, 20% Survival |

### Combinatorial Reach Matrix
Each script is built from a `subject × template` cross-product. Subjects are concrete factual anchors stored per niche. Templates are locked structures. This creates combinatorial variety while keeping every script anchored to verifiable facts.

### Format Weights

| Niche | RAPID_FIRE | SLOW_BURN | THE_LIST |
|-------|------------|-----------|----------|
| SaaS & AI Tools | 80% | 0% | 20% |
| Financial Forensics | 80% | 20% | 0% |
| Stoic Philosophy | 0% | 70% | 30% |
| Urban Survival | 0% | 60% | 40% |

---

## Schema (Zod)

The schema is the contract between the LLM and the pipeline. Every downstream system — caption renderer, FFmpeg, TTS, quality gate — reads from this. Nothing is inferred at runtime.

```typescript
const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string().min(30).max(600),
  tts_text: z.string()
    .refine(text => text.split(' ').length <= 12, {
      message: 'Soft cap: flag shots over 12 words for rhythm review'
    })
    .refine(text => text.split(' ').length >= 3, {
      message: 'Minimum 3 words per shot'
    }),
  audio_instruction: z.enum(['[serious]', '[curious]', '[urgent]', '[measured]', '[grave]']).optional(),
  is_conclusion: z.boolean().default(false),
  duration_seconds: z.number().optional() // populated post-TTS from actual clip length
});

const ScriptSchema = z.object({
  visual_world: z.enum(['vector', 'dossier', 'dark_cinematic', 'tactical']),
  format_template: z.enum(['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST']),
  hook_intro: z.string().max(40), // exact first words of shot 1 tts_text
  shots: z.array(ShotSchema)
    .min(12)
    .max(18)
    .refine(shots => shots.filter(s => s.is_conclusion).length === 1, {
      message: 'Exactly one conclusion shot required'
    })
    .refine(shots => shots[shots.length - 1].is_conclusion, {
      message: 'Conclusion shot must be last'
    })
    .refine(shots => /[.!?]$/.test(shots[shots.length - 1].tts_text), {
      message: 'Conclusion shot must end with sentence-ending punctuation'
    }),
  fact_check_and_sources: z.array(
    z.string().regex(/^.+→.+$/, 'Must be in "claim → source" format')
  ).min(3),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(5).max(12)
});
```

**Caption validation (separate pass after schema):**
```typescript
function validateCaptions(shots: Shot[]) {
  for (const shot of shots) {
    const words = shot.tts_text.split(' ');
    if (words.some(w => w.length > 26)) throw new Error(`Word too long in shot ${shot.id}`);
    if (shot.tts_text.length > 80) throw new Error(`Caption too long in shot ${shot.id}`);
  }
}
```

---

## Script Generation & Quality Control

Three-tier quality system. Up to 2 retries per tier failure. Quality gate scores are cached by content hash for 1 hour — a retry on an unchanged script skips the LLM scoring call.

### Tier 1 — Structural Validation (Zod)

- Schema passes: shot count, word limits, conclusion anchor, punctuation, sources, tags.
- Banned words rejected: "many," "several," "huge," "massive," "revolutionary," "game-changing," "insane," "stunning," "incredible."
- Banned CTAs rejected: "subscribe," "like and," "comment below," "link in bio," "follow for."
- Zero text or UI in image prompts (validated by keyword check).

### Tier 2 — Caption Validation

- No word over 26 characters.
- No caption over 80 characters total.
- All shots: minimum 3 words.
- Conclusion shot: ends with `.` `!` or `?`.

### Tier 3 — Quality Gate (secondary Gemini call)

Six dimensions scored 0–10. Overall must be ≥ 7.0, no single dimension below 5. Cache the score by SHA-256 of the full script JSON — skip the call if the script hasn't changed since last retry.

| Dimension | Pass Criteria |
|-----------|---------------|
| Specificity | Every shot contains at least one: exact number, full name, specific date, dollar amount, location, or named mechanism |
| Hook strength | Shot 1 presents cognitive dissonance — two facts that can't logically coexist but do |
| Spoken rhythm | Natural conversational English read aloud; clauses vary in length; no metronomic sameness |
| Tone calibration | Niche-specific voice — not theatrical, not generic, not interchangeable with another niche |
| Pacing | Forward momentum across every shot; no shot stalls; SLOW_BURN builds correctly |
| Visual coherence | All shot image prompts share a unified aesthetic while being visually distinct from each other |

### Writing Mandates (injected into every LLM prompt)

1. **Specificity mandate:** Every sentence must contain at least one verifiable anchor — exact number, full name, specific date, named location, named mechanism, or exact dollar amount. No exceptions.
2. **Fact verification mandate:** Every claim must appear in `fact_check_and_sources` with a verifiable named source. If a claim cannot be sourced, it is not written.
3. **Spoken English only:** Write for the ear. Short clauses. Conversational rhythm. Never write a sentence you wouldn't say out loud.
4. **Emotional arc through facts:** Never use an adjective where a number would work. Let the facts create the emotion. "He lost $4.7M in 14 minutes" — not "he lost a staggering amount."
5. **Template-specific rhythm:** RAPID_FIRE — no transition words between shots, dense sequential facts. SLOW_BURN — shots 1–3 ominous context only, no facts yet. THE_LIST — number each item explicitly in the TTS text.

### Hook Architecture (all templates)

- **Shot 1:** Cognitive dissonance in under 8 words — two facts that cannot logically coexist, but do. No setup. Start mid-story.
- **Shot 2:** Establish exact quantifiable stakes by the end of this shot. Money lost, historical ruin, physical consequence. If stakes are not explicit by end of Shot 2, the script fails.
- **Shots 3 onward:** Escalating specificity. Each shot must be harder-hitting than the last.
- **Conclusion shot:** The most quotable single line in the script. No cliffhanger. Definitive. Ends with `.` `!` or `?`.

---

## Visual Strategy

### Four Aesthetic Worlds

**Vector** (SaaS & AI Tools): Premium 2D flat art. Dramatic isometric perspective. Clean geometric shapes. Bold limited palette. No gradients. No texture. No human figures.

**Dossier** (Financial Forensics): Vintage archival photography. High-contrast black and white. Heavy film grain. Declassified document aesthetic. Blueprint overlays. Ominous dramatic lighting.

**Dark Cinematic** (Stoic Philosophy): Dramatic chiaroscuro lighting. Marble statues or solitary human figures in vast landscapes. Deep blacks. Desaturated palette. Film grain. Storm clouds or golden hour.

**Tactical** (Urban Survival): Hyper-realistic gear photography. Matte black equipment. Dramatic practical lighting. Shallow depth of field on specific equipment. Moody urban or wilderness environment.

### Image Prompt Requirements

Every prompt must specify all six of:
1. Lighting direction and quality (e.g. "top-right rim light, hard shadow")
2. Camera angle and lens feel (e.g. "low angle, wide-angle distortion")
3. Focal distance (e.g. "tight macro on texture," "wide establishing")
4. Dominant colors and their relationships
5. Surface textures (e.g. "brushed aluminum, matte plastic, aged paper")
6. Atmosphere (e.g. "cold industrial, oppressive, contemplative")

No text, UI, watermarks, logos, or human faces in any image prompt. Validated by keyword scan before submission.

### Image Generation

- **Model:** Verify exact Gemini Imagen model string from Google API docs before implementation — do not hardcode from this document.
- **Method:** Gemini batch API — all shots submitted in parallel in one batch job.
- **Aspect ratio:** 9:16 (1080×1920).
- **Prompt structure:** `{aestheticPrefix} {shot.visual_prompt} | Visual world: {script.visual_world} | Negative: {aesthetic.imageNegative}`
- **Pre-render resolution:** Downscale all returned images to exactly 1080×1920 before any FFmpeg processing. Do this in the harvest step before upload to Cloudinary.

### Caption Rendering (`@napi-rs/canvas`)

- **Font:** Montserrat Bold, 72pt.
- **Vertical position:** 72% from the top of the frame (1382px on a 1920px canvas). This clears YouTube's UI chrome on both ends.
- **Layout:** Auto-wrapped to maximum 3 lines, 84px line height.
- **Safe zone:** 960px horizontal (1080px − 120px margin each side).
- **Power word rendering:** Numbers, superlatives, and all-caps words rendered in gold `#FFD700` at 130% scale.
- **Stroke:** 3px white outline for readability on any background.
- **Animation on cut:** Captions appear instantly on frame cut — no slide-in animation. At shot durations of 1.2–3s there is no time for entrance animation. Cut-on-frame only.

### Thumbnail Generation

- **Model:** Verify exact Gemini model string from Google API docs.
- **CTR rules:**
  - Single dominant focal point — face > object > landscape, in that CTR priority order.
  - Extreme high contrast — readable at 200×112px (mobile browse size).
  - Lower 40% kept dark and simple for text overlay space.
  - Bold saturated colors only — no muted, pastel, or desaturated palettes.
  - Strong visual emotion: awe, surprise, or tension. No neutral compositions.
- **Upload:** Use Cloudinary eager transformation at upload time — `eager: [{width: 1280, height: 720, crop: 'fill'}]` — to auto-generate the YouTube-required 16:9 thumbnail in the same upload call. Zero extra step.

---

## Audio Strategy

### Text-to-Speech

- **Model:** Verify exact Gemini TTS model string from Google API docs.
- **Voices:** Orus (SaaS, Finance, Stoic), Sadaltager (Urban Survival).
- **Sample rate:** 24,000 Hz.
- **Prompt structure:** Full director notes + transcript with `[audio_instruction]` delivery markers from each shot's `audio_instruction` field.
- **Post-generation:** After TTS returns, measure the actual duration of each audio clip in seconds and write it back to `shot.duration_seconds` in the job state. This value is the source of truth for FFmpeg — never estimate.

### Director Voice Profiles

**Orus — SaaS & AI Tools:** Fast, crisp American neutral. Zero emotional inflection. Reads like a product analyst delivering a verdict. Pace: 1.15× normal. No dramatic pauses. Facts land clean.

**Orus — Financial Forensics:** Slower. Deliberate. Heavy weight on names and numbers. Long pause after each dollar amount. Reads like testimony, not narration.

**Orus — Stoic Philosophy:** Deep, measured. Philosophical gravity. Never theatrical. Pause before the conclusion shot.

**Sadaltager — Urban Survival:** Tactical urgency. Clipped sentences. Military briefing register. No wasted syllables. Pace: 1.05× normal.

### Background Music

- **Model:** Verify exact Lyria model string from Google API docs.
- **Prompt:** Driven by `script.visual_world` for aesthetic coherence.
- **Final mix:** Sidechain compression, not flat mixing (see FFmpeg section).

---

## Video Assembly (FFmpeg on Modal)

### Modal Configuration

```python
@app.function(cpu=8.0, memory=8192, timeout=300)
def render_video(job_id: str, asset_manifest: dict):
    # FFmpeg assembly
    # On completion, POST to /api/webhooks/modal with job_id and output_url
```

Modal fires `POST /api/webhooks/modal` on completion. Inngest resumes via `step.waitForEvent('modal/render.complete', { match: 'data.job_id' })`.

### FFmpeg Parameters

| Parameter | Value |
|-----------|-------|
| Resolution | 1080×1920 |
| Frame rate | 25 fps |
| Video codec | H.264, CRF 23, medium preset |
| Audio codec | AAC, 128k |
| Ken Burns | Alternating: zoom-in (1.0→1.12) and zoom-out (1.12→1.0) per shot |
| Transitions | Random per shot: fade, slideleft, slideup, wiperight, smoothleft, circlecrop |

**Critical:** Images must be pre-scaled to exactly 1080×1920 before the `zoompan` filter runs. Apply `scale=1080:1920` in FFmpeg or in the harvest step before upload. Applying zoompan to a non-native resolution drops frames.

**Shot duration:** Each image's display duration is `shot.duration_seconds + 0.2` (0.2s padding between shots). This comes from the actual measured TTS clip length written back to the job state post-TTS generation. Never estimate.

### Audio Ducking (Sidechain Compression)

Do not use a flat audio mix. This FFmpeg filter complex dynamically dips the background music when TTS is speaking:

```bash
-filter_complex "[1:a]asplit[mus1][mus2]; \
[0:a][mus1]sidechaincompress=threshold=0.04:ratio=4:attack=5:release=50[spoken_ducked]; \
[spoken_ducked][mus2]amix=inputs=2:duration=first:dropout_transition=2"
```

Input 0 = TTS track. Input 1 = Background music track.

---

## Pipeline (Inngest Durable Functions)

### `generateShort` — 8 Steps

```
1. lock-topic
   Atomic SELECT ... FOR UPDATE SKIP LOCKED on slideshow_topics.
   Marks topic used=true, used_at=NOW(). Returns topic row.
   If no topics remain, triggers topic replenishment job and exits.

2. generate-script
   Pick subject + format_template per niche weights.
   Call Gemini with full system prompt including template instructions.
   Run Tier 1 (Zod) → Tier 2 (caption) → Tier 3 (quality gate).
   Up to 2 retries per tier failure. Quality gate scores cached by SHA-256 of script JSON.
   On 3rd consecutive failure, mark job failed, release topic lock, alert.

3. submit-image-batch
   Submit all shots' visual_prompts to Gemini batch API in parallel.
   Store batch job ID in job state.

4. submit-tts-batch
   Submit all shots' tts_text + audio_instructions to Gemini TTS batch API in parallel.
   Store batch job ID in job state.
   (Steps 3 and 4 run concurrently via step.run() — images and TTS batch simultaneously.)

5. poll-batches
   Poll both batch jobs with step.sleep('1m') between checks.
   Max 45 attempts (45 minutes). On timeout, fail with alert.
   If batch returns partial results, note which items failed — proceed to harvest with fallback for failed items only.

6. harvest-assets
   Each image and audio clip is downloaded and uploaded in its own step.run().
   If asset #14 fails, Inngest retries only that asset — not the full harvest.
   Pre-scale each image to 1080×1920 during this step before Cloudinary upload.
   After each TTS clip uploads, measure actual duration_seconds and write back to job state.
   Burn captions onto each image using @napi-rs/canvas at this step.

7. generate-music
   Call Lyria with script.visual_world prompt.
   Upload background track to Cloudinary.

8. render-and-publish
   Sub-step A: Generate thumbnail → Cloudinary with eager 1280×720 transform.
   Sub-step B: Send asset manifest to Modal render function. Wait for webhook via step.waitForEvent().
   Sub-step C: On Modal completion, receive output URL. Upload final video to YouTube via Data API v3.
   Sub-step D: Write to slideshow_uploads. Sync analytics attribution. Cloudinary cleanup of intermediate assets.
```

### `channelScheduler`

Daily cron at 14:00 local. Checks each channel's 24-hour publish throttle. Uses `step.sendEvent()` with array of all due channel events — one cron execution, one atomic fan-out to all 4 channels.

### `replenishTopics`

Triggered when a channel's topic pool drops below 5 unused topics. Calls Gemini to generate 20 new topics, deduplicates against all existing topics in DB (used and unused), inserts only net-new.

### `syncAnalyticsCron`

Daily cron at 05:00. Syncs YouTube Analytics (views, watch time, retention, CTR) into `slideshow_analytics` for attribution and niche performance scoring.

---

## Database (Neon PostgreSQL 17)

### Core Tables

**`slideshow_topics`**
```sql
id, account_id, niche, topic_text, format_template,
subject_anchor, used BOOLEAN DEFAULT false,
used_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

**`slideshow_jobs`**
```sql
id, account_id, topic_id, niche, format_template,
status ENUM('pending','generating','images_queued','tts_queued',
            'polling','harvesting','assembling','rendering',
            'published','failed'),
script_json JSONB, asset_manifest JSONB,
image_batch_id TEXT, tts_batch_id TEXT,
retry_count INT DEFAULT 0, error_log TEXT,
created_at, updated_at
```

**`slideshow_uploads`**
```sql
id, job_id, account_id, youtube_video_id,
title, tags TEXT[], niche, format_template,
thumbnail_url, cloudinary_video_url,
published_at TIMESTAMPTZ
```

**`slideshow_analytics`**
```sql
id, upload_id, account_id, synced_at,
views INT, likes INT, watch_time_seconds INT,
avg_view_duration_seconds INT, ctr DECIMAL,
retention_curve JSONB
```

### Reach Matrix Tables

**`matrix_subjects`** — Factual anchors per (account, niche). Example: "The 2023 FTX collapse, Nov 11 2023, $8B customer funds missing."

**`matrix_angles`** — Narrative angles per (account, niche). Example: "What the internal Slack messages revealed three days before."

### Topic Lock Query

```sql
UPDATE slideshow_topics 
SET used = true, used_at = NOW() 
WHERE id = (
  SELECT id FROM slideshow_topics 
  WHERE niche = $1 AND account_id = $2 AND used = false 
  ORDER BY created_at ASC
  LIMIT 1 FOR UPDATE SKIP LOCKED
) 
RETURNING *;
```

---

## Content Rules (Enforced)

| Rule | Mechanism |
|------|-----------|
| No vague quantifiers | Banned word list in Zod + specificity scoring in quality gate |
| No unverifiable claims | `fact_check_and_sources` min 3 entries, `claim → source` format enforced by regex |
| No CTAs | Banned word list: "subscribe," "like and," "comment below," "link in bio," "follow for" |
| No text in images | Keyword scan on visual_prompt before batch submission |
| No duplicate topics | `FOR UPDATE SKIP LOCKED` atomic queue lock |
| Natural story endings | Conclusion shot: `is_conclusion: true`, sentence-ending punctuation required |
| Consistent visual identity | `visual_world` shared across all shots, aesthetic prefix/negative per niche |
| Shot rhythm | 12-word soft cap via Zod refine, rhythm scored in quality gate |
| Audio sync | `duration_seconds` per shot from measured TTS clip, not estimated |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Pipeline | Inngest (durable functions, sleep-based polling, cron, fan-out) |
| Text AI | Gemini Flash (verify current model string from Google API docs) |
| Image AI | Gemini Imagen (verify current model string from Google API docs) |
| TTS AI | Gemini TTS (verify current model string from Google API docs) |
| Music AI | Lyria (verify current model string from Google API docs) |
| Compute | Modal (CPU 8-core / 8GB RAM, webhook handoff to Inngest) |
| Database | Neon (serverless PostgreSQL 17) |
| Storage/CDN | Cloudinary (7-day expiry, eager thumbnails on upload) |
| Video | FFmpeg (fluent-ffmpeg + ffmpeg-static, executed on Modal) |
| Distribution | YouTube Data API v3 (OAuth per channel) |
| Validation | Zod (schema + refine) |
| Canvas | @napi-rs/canvas (caption burn, Montserrat Bold 72pt) |
| Types | TypeScript strict, zero `any` |

---

## What Needs External Verification Before Writing a Single Line of Code

These four things cannot be filled in from this document. Look them up before implementing:

1. **Gemini image generation model string** — the correct API identifier for Gemini's image generation as of your implementation date.
2. **Gemini TTS model string** — verify it supports multi-speaker voice profiles and the exact `audio_instruction` tag format.
3. **Lyria music generation model string and API shape** — confirm the current request/response contract.
4. **Gemini batch API contract** — confirm batch job polling format, partial result handling, and whether image + TTS can share one batch or require separate jobs.

Everything else in this document is implementation-ready as written.