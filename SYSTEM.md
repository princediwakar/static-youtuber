# System Architecture

Fully automated pipeline that generates, assembles, and publishes AI-powered YouTube Shorts (and long-form videos) across 4 niche channels. One Short per channel per day, staggered across UTC hours, plus one long-form deep-dive per channel every 48h. Zero human intervention from topic to publish.

**Stack:** Next.js 16 (App Router), TypeScript 5, PostgreSQL (Neon), Inngest (orchestration), Tailwind CSS 4, Python/Modal (Qwen2.5-7B-Instruct via vLLM on A10G, F5-TTS voice cloning on A10G, ACE-Step BGM generation on A10G, CPU FFmpeg render worker)

---

## Directory Map

```
├── app/
│   ├── layout.tsx                  # Root layout, dark theme
│   ├── page.tsx                    # Server-rendered dashboard (ISR 30s)
│   ├── globals.css                 # Design tokens, component styles
│   └── api/
│       ├── cron/route.ts           # Pipeline trigger endpoint (CRON_SECRET, supports contentType)
│       ├── inngest/route.ts        # Inngest serve (GET/POST/PUT, 60s max)
│       ├── jobs/[jobId]/retry/route.ts  # Job retry endpoint
│       └── webhooks/modal/route.ts # Modal render completion callback
├── lib/
│   ├── constants.ts                # All runtime constants (centralized)
│   ├── types.ts                    # Shot, SlideshowScript, SlideshowJob, ContentType
│   ├── llm.ts                      # Modal vLLM client (replaces deprecated lib/deepseek.ts)
│   ├── database.ts                 # Postgres pool + query helpers (Neon cold-start retry)
│   ├── cloudflareAi.ts             # Cloudflare FLUX.1 image gen (multi-account round-robin)
│   ├── audioEngine.ts              # F5-TTS voice cloning client (Modal)
│   ├── topicGenerator.ts           # Two-pass script generation engine (shorts + long-form)
│   ├── captionValidator.ts         # Caption constraint enforcement (per-aesthetic metrics)
│   ├── musicSelector.ts            # ACE-Step BGM generation (Modal)
│   ├── thumbnailGenerator.ts       # Thumbnail generation + SVG overlay (sharp)
│   ├── youtubeUpload.ts            # YouTube OAuth2 upload
│   ├── accountService.ts           # AES-256-GCM credential decryption
│   ├── analyticsSync.ts            # YouTube Analytics sync + epsilon-greedy bandit data
│   └── cloudinary.ts               # Asset upload/download/cleanup
├── inngest/
│   ├── client.ts                   # Inngest singleton
│   └── pipeline.ts                 # generateShort, generateLongForm, channelScheduler, longFormScheduler, syncAnalyticsCron
├── database/
│   └── schema.sql                  # DDL (3 tables + trigger)
├── migrations/                     # Incremental schema changes (10 migrations)
├── modal/
│   ├── llm.py                      # Qwen2.5-7B-Instruct vLLM inference (A10G GPU)
│   ├── bgm.py                      # ACE-Step 1.5 BGM generation (A10G GPU)
│   ├── tts.py                      # F5-TTS voice cloning (A10G GPU, max 5 concurrent)
│   └── render.py                   # FFmpeg render worker + Whisper word alignment (CPU)
├── assets/
│   ├── fonts/Montserrat-Bold.ttf   # Fallback caption font
│   └── music/                      # 3 CC-BY background tracks (unused — ACE-Step active)
├── docs/
│   ├── adding-an-account.md        # Guide for onboarding new channels
│   ├── 2026-shorts-algorithm-plan.md
│   └── 2026-07-08-*                # Planning docs (long-form, staggered scheduling, account renames)
├── scripts/                        # Dev tooling, tests, seed data
└── scratch/                        # Experimental code
```

---

## External Services

| Service | Purpose | Auth |
|---|---|---|
| **Neon** | Serverless Postgres (jobs, topics, uploads) | `DATABASE_URL` + SSL |
| **Modal vLLM** | Self-hosted LLM (Qwen2.5-7B-Instruct on A10G) — script writing, topic gen, quality scoring | `MODAL_LLM_URL` (no auth header needed) |
| **Cloudflare Workers AI** | FLUX.1 [schnell] image generation (slides + thumbnails); up to 6 account pairs for round-robin | API token(s) + account ID(s) |
| **F5-TTS** (Modal) | Voice-cloned narration per shot (open-source, A10G GPU) | `F5_TTS_API_KEY` |
| **ACE-Step** (Modal) | Instrumental BGM generation (open-source, A10G GPU) | `ACE_STEP_API_KEY` |
| **Cloudinary** | Asset CDN (images, audio, video, thumbnails; 7-day retention) | Per-channel API key/secret |
| **YouTube Data API v3** | Video upload + basic stats | OAuth2 per channel |
| **YouTube Analytics API v2** | Shorts metrics (views, swipe rate, traffic sources) | OAuth2 |
| **Inngest** | Pipeline orchestration, retries, cron, event-driven steps | Event key + signing key |
| **Modal** | GPU services (vLLM, F5-TTS, ACE-Step) + CPU FFmpeg render; all self-hosted Python | HTTP callback + secrets |
| **Vercel** | Next.js hosting | Vercel OIDC |

---

## Database Schema

### `slideshow_jobs`

Tracks every pipeline run from script generation through publish. Primary job record.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID PK | Job identifier |
| `account_id` | TEXT | Channel (canvas_center, canvas_area, etc.) |
| `topic` | TEXT | Reserved topic string |
| `niche` | TEXT | Niche category |
| `format_template` | VARCHAR(20) | RAPID_FIRE, SLOW_BURN, THE_LIST, or DEEP_DIVE |
| `content_type` | TEXT | `shorts` (default) or `long` |
| `status` | TEXT | Pipeline stage (pending → script_ready → assets_ready → assembled → published → failed) |
| `inngest_run_id` | TEXT | Inngest run identifier for resume |
| `script` | JSONB | Full SlideshowScript object |
| `shot_image_urls` | JSONB | Cloudinary URLs per shot (crash recovery) |
| `shot_audio_urls` | JSONB | Cloudinary TTS URLs per shot (crash recovery) |
| `narration_audio_url` | TEXT | Legacy monolithic audio URL (unused) |
| `video_url` | TEXT | Final assembled MP4 |
| `thumbnail_url` | TEXT | YouTube thumbnail |
| `youtube_video_id` | TEXT | Published YouTube video ID |
| `music_url` | TEXT | Generated BGM URL |
| `error_message` | TEXT | Failure reason |
| `variant` | VARCHAR(10) | A/B test tag (A or B, 50/50) |
| `imageBatchName` | TEXT | Image batch identifier |
| `audioBatchName` | TEXT | Audio batch identifier |
| `created_at` | TIMESTAMPTZ | Job creation time |
| `updated_at` | TIMESTAMPTZ | Last update timestamp (auto via trigger) |

Indexes: `status`, `account_id`, `created_at DESC`, `(account_id, content_type, created_at DESC)`.

### `slideshow_topics`

Topic pool with atomic reservation and post-publish analytics.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | Topic identifier |
| `topic` | TEXT | Topic string (unique per account) |
| `niche` | TEXT | Niche category |
| `account_id` | TEXT | Channel |
| `used` | BOOLEAN | Whether consumed (default false) |
| `used_at` | TIMESTAMPTZ | When topic was claimed |
| `youtube_id` | TEXT | Published YouTube video ID |
| `aesthetic_id` | TEXT | Visual world used |
| `format` | TEXT | Format template used |
| `quality_score` | FLOAT | Script quality score |
| `views` | INTEGER | YouTube view count |
| `avg_view_duration_pct` | FLOAT | Average % of video watched |
| `impressions` | INTEGER | Total impressions |
| `traffic_search_pct` | FLOAT | % from YouTube search |
| `traffic_feed_pct` | FLOAT | % from Shorts feed |
| `analytics_synced_at` | TIMESTAMPTZ | Last analytics sync |
| `research_context` | TEXT | Ground-truth research data for script generation |

Indexes: `(account_id, niche, used)` for topic reservation, `(niche, views DESC)` for performance queries, `(impressions DESC)` for trending, `(analytics_synced_at)` for sync scheduling.

### `slideshow_uploads`

Publish log linked to jobs.

| Column | Type | Purpose |
|---|---|---|
| `id` | SERIAL PK | Upload identifier |
| `job_id` | UUID FK | → slideshow_jobs.id (CASCADE delete) |
| `youtube_video_id` | TEXT UNIQUE | Published YouTube ID |
| `title` | TEXT | Published title |
| `description` | TEXT | Published description |
| `tags` | JSONB | Published tags |
| `variant` | VARCHAR(10) | A/B variant |
| `uploaded_at` | TIMESTAMPTZ | Publish timestamp |

### `accounts` (shared with sibling project)

Stores encrypted OAuth2 and Cloudinary credentials per channel. Not defined in this repo's schema. Managed by `lib/accountService.ts` which decrypts using AES-256-GCM with `NEXTAUTH_SECRET` as key.

---

## Pipeline (Inngest)

Five Inngest functions in `inngest/pipeline.ts`:

### `generateShort` — event: `slideshow/trigger`

3 retries, 2-hour timeout. On failure, marks job as `failed`.

**Step 1 — Script Generation + GPU Warmup (parallelized)**
- Checks for incomplete existing job (crash recovery / resume).
- Otherwise calls `generateScript()` which: reserves topic atomically (`FOR UPDATE SKIP LOCKED`), picks format template via epsilon-greedy bandit (exploit best-performing 85%, explore 15%), runs the two-pass script engine (narrative → chunking), validates against Zod schema, heals oversized/undersized shots, runs caption validation, scores via quality gate (retries up to 4× if below threshold).
- Simultaneously warms ACE-Step GPU by hitting the Modal warmup endpoint (pre-loads model weights, reduces cold start from ~40s to near-zero).
- Creates `slideshow_jobs` row with status `script_ready`.

**Step 2 — Assets Generation (all parallel)**
- Runs four tasks concurrently via `Promise.all`:
  - **Narration**: Iterates shots in batches of 5 (concurrency limit), calls F5-TTS Modal endpoint per shot (voice-cloned WAV output), sanitizes text, uploads each WAV to Cloudinary, persists `shot_audio_urls` incrementally.
  - **Images**: Generates all slide images via Cloudflare FLUX (batches of 5), uploads to Cloudinary, persists `shot_image_urls` incrementally after each batch.
  - **Music**: Calls ACE-Step Modal endpoint with niche+format-specific prompt and duration (clamped 30-90s for shorts, 300s for long-form), uploads MP3 to Cloudinary.
  - **Thumbnail**: Generates via Cloudflare FLUX, overlays title via SVG text overlay (sharp), uploads to Cloudinary.
- Marks status `assets_ready` once all four complete.

**Step 3 — Video Rendering (Modal CPU)**
- Sends all assets (images, per-shot audio, BGM, caption styles, callback URL, content_type) to render endpoint.
- Waits 30s for inline response; if Modal returns a video URL immediately, proceeds. If Modal returns a status (queued), awaits `modal/render.complete` webhook for up to 10min (30min for long-form).
- On success, marks status `assembled`.
- No local FFmpeg fallback.

**Step 4 — Publish** (optional, controlled by `skipPublish`)
- Downloads thumbnail, uploads video + thumbnail to YouTube via OAuth2.
- Records upload in `slideshow_uploads`, analytics metadata on `slideshow_topics`.
- Sets job status to `published`.

### `generateLongForm` — event: `slideshow/trigger-long`

Same structure as generateShort with key differences:
- Uses DEEP_DIVE format (30-60 shots)
- Landscape dimensions (1920×1080 video, 1344×768 images)
- Long-form narrative (450-750 words), long-form captions (max 20 words/shot)
- 48h throttle per channel (checked by scheduler)
- Takes content_type='long' throughout

### `channelScheduler` — cron

Triggers at UTC 15, 17, 19, 21 (one niche per hour). Queries active accounts, filters to niche matching current hour, checks 24h throttle, sends `slideshow/trigger` for each due channel (at most one per run, shuffled).

| UTC | Niche |
|---|---|
| 15:00 | Financial Forensics |
| 17:00 | Stoic Philosophy |
| 19:00 | Urban Survival |
| 21:00 | SaaS & AI Tools |

### `longFormScheduler` — cron

Triggers daily at 11:00 UTC. Iterates all active accounts, checks 48h throttle per channel, sends `slideshow/trigger-long` for each due channel.

### `syncAnalyticsCron` — cron

Daily at 5:00 UTC. Pulls YouTube Analytics (views, impressions, avg view duration %, traffic source breakdown) for all unsynced published videos. Falls back gracefully on missing OAuth scopes. Updates `slideshow_topics`.

---

## Script Generation Engine

`lib/topicGenerator.ts` — two-pass architecture plus quality gate:

### Pass 1: Narrative Generation (`generateNarrative`, Modal vLLM, temperature 0.7)

Generates a 90–110 word prose narrative from the topic and `research_context`. The system prompt covers:
- **Length mandate**: Target 90-110 words, absolute max 120. At ~2.5 words/sec, 110 words ≈ 44s.
- **Tone mandate**: Niche-specific voice instructions from `NICHE_PROFILES`.
- **Content policy**: No graphic violence, gore, or visceral bodily trauma. Build tension psychologically.
- **Ground-truth requirement**: Uses exact dates, names, and numbers from research context. No hallucination.
- **Storytelling rules**: Hook instantly with cognitive dissonance, build tension with cause/effect, end with a devastating conclusion. Max 15 words per sentence.
- **No CTAs**: "subscribe", "like", "follow" all banned. Ending on a genuinely debatable claim encouraged.
- **Output format**: Pure prose, no JSON, no formatting.

### Pass 2: Editor/Chunking (`chunkScriptToJSON`, Modal vLLM, temperature 0.2)

Slices the Pass 1 narrative into formatted JSON following the Zod schema. The system prompt covers:
- **Shot counts**: Template-specific (RAPID_FIRE: 12–15, SLOW_BURN: 12, THE_LIST: 12–14).
- **Dual-text mandate**: `caption_text` (verbatim slice, ≤12 words) + `spoken_text` (identical except digit→word substitution).
- **Visual prompts**: Natural language paragraphs for FLUX.1's T5-XXL encoder. Explicit instruction to describe environments with no text/words/signs. Kinetic energy mandate — every shot must change angle/lighting/focus.
- **Censorship**: Forbidden words include blood, wound, severed, corpse, murder, etc.
- **Loop design**: Final shot echoes opening concept so replay feels deliberate.
- **Voice selection**: 6 voice profiles (mallory-handford-american-female, melissa-harlow-american-female, jon-british-male, kylie-hinze-american-female, kelli-winkler-american-female, dee-smith-american-male).
- **JSON output**: Full `SlideshowScriptSchema` with fact_check_and_sources, visual_world, format_template, title, description, tags, shots, thumbnailPrompt, voiceName.

### Long-form Pipeline (`generateLongFormScript`)

Separate but parallel pipeline:
- Pass 1 (`generateLongFormNarrative`): 450-750 words, long-form tone instructions (`LONG_NICHE_PROFILES`), sentences 15-25 words.
- Pass 2 (`chunkLongFormScriptToJSON`): 30-60 shots, DEEP_DIVE format, landscape 16:9 composition, max 15 words per caption.
- Voice catalog adds phil-freeman-american-male for deep authoritative narration.
- Long fact checks (min 5), SEO description (50-1000 chars).
- Quality gate dimensions: narrative_coherence, factual_depth, arc_satisfaction, visual_variety, information_density, tone_calibration.

### Self-Healing Shot Mutator (`healShots`)

Two-dimensional partitioner that runs after Pass 2:
- Slices shots on word count (3–12) AND character count simultaneously (per-niche max chars).
- Heals orphan chunks (<3 words) by merging backward and re-splitting evenly.
- Merges forward undersized shots if within character limit.
- Re-indexes IDs and ensures exactly one conclusion at the final position.

### Quality Gate (`scoreScript`, Modal vLLM, temperature 0.1)

Evaluates across 9 dimensions (0–10). The scoring payload includes `title`, `description`, and `thumbnailPrompt` alongside shots so the gate can evaluate whether the hook pays off:

| Dimension | Measures |
|---|---|
| specificity | Every sentence has an anchor |
| hook_strength | Two facts that cannot coexist |
| information_density | Every shot delivers a new verifiable fact |
| tone_calibration | Perfectly calibrated to niche voice |
| pacing | Natural shot lengths, feels <60s |
| visual_entropy | Image prompts distinct enough to prevent visual fatigue |
| visual_coherence | Prompts form a unified visual world |
| caption_flow | Reading captions in sequence is smooth and natural |
| hook_payoff_match | Title/thumbnail promise is delivered by the actual shots; no bait-and-switch |

**Approval**: Two independent checks, both must pass:
1. **Model self-report**: The prompt instructs the model to set `approved = true` only if overall ≥ niche-specific `minQualityScore` AND every dimension ≥ 5.
2. **Code-side floor**: The pipeline re-verifies that `overall ≥ minQualityScore` and all 9 dimensions are ≥ 5.

Max 4 retries with feedback from previous score. On terminal failure, the last attempt is accepted regardless.

### Format Template Selection (Epsilon-Greedy Bandit)

`pickFormatTemplate()` exploits the best-performing (aesthetic, format) pair 85% of the time; explores randomly 15%. Uses `getRetentionByConfig()` from analyticsSync which queries average view duration % grouped by (aesthetic_id, format) for the niche, min 3 data points. Falls back to `FORMAT_TEMPLATE_WEIGHTS` when insufficient data.

### Topic Generation (Modal vLLM, temperature 0.9)

`generateTopics()` creates 20 fresh topics when pool is exhausted. Excludes last 50 used topics. Niche-specific quality criteria. Each topic includes a `research_context` column with ground-truth data for Pass 1.

---

## Topic Reservation

`reserveTopic()` uses `FOR UPDATE SKIP LOCKED` to atomically claim the next unused topic. Prevents concurrent pipeline runs from claiming the same topic. Returns `{ id, topic, research_context }`. Sets `used = TRUE` and `used_at = NOW()`. On pipeline failure, `releaseTopic()` returns the topic to the pool.

Seed data: 80 hand-crafted topics (20 per niche) in `scripts/seed-topics.ts`.

---

## LLM (Modal vLLM)

`lib/llm.ts` calls a self-hosted vLLM inference server (`modal/llm.py`) running Qwen2.5-7B-Instruct on an A10G GPU.

- **Endpoint**: `POST {MODAL_LLM_URL}/v1/chat/completions` — OpenAI-compatible API.
- **Transport**: Standard HTTP POST with JSON body (no external API key header).
- **Retries**: 2 attempts with jittered temperature.
- **Chunking**: Auto-continues when response hits `max_tokens` (up to 4 continuations × 8K tokens = 32K total).
- **JSON mode**: Uses `response_format: { type: 'json_object' }` for chunking + quality gate.
- **Timeout**: 120s default, up to 900s for long-form chunking.
- **Model**: Qwen2.5-7B-Instruct, 8K context, loaded via vLLM with CUDA graphs (`enforce_eager=False`).

The previous DeepSeek API client (`lib/deepseek.ts`) has been removed.

---

## Image Generation

### Slides (Cloudflare Workers AI — FLUX.1 [schnell])

- **Resolution**: Shorts: 768×1344 (portrait). Long-form: 1344×768 (landscape). 8 steps (configurable).
- **Multi-account round-robin**: Collects up to 6 account pairs from env vars, picks one at random per generation call. Cycles accounts on retryable failures.
- **Disk cache**: `/tmp/cache/flux/{sha256}.jpg` keyed on model+prompt+dims+steps+guidance.
- **Retries**: 6 with exponential backoff on 429/502/503/504, NSFW filter triggering, and network errors.
- **FLUX.2 support**: Upgrade path via `CF_AI_IMAGE_MODEL=@cf/black-forest-labs/flux-2-dev` — uses multipart/form-data, different step/guidance defaults (20 steps, guidance 4), 40-60× cost increase.

### Caption Rendering (Modal Render — ASS Subtitles)

Captions are rendered on Modal via Python, driven by `CAPTION_STYLES` in constants.ts:

| Aesthetic | Font Family | Colors | Max chars/line |
|---|---|---|---|
| tech-minimalist | Space Grotesk | Warm white / navy / orange | 34 / 85 |
| finance-editorial | Fraunces 72pt Black | Bone white / near-black / red | 36 / 90 |
| stoic-zen | Cinzel Black | Warm ivory / charcoal / copper | 29 / 72 |
| survival-technical | Big Shoulders Stencil Display | Khaki / near-black / rust | 48 / 120 |

Per-shot audio split provides exact shot boundary timing (no Whisper needed). FFmpeg with Ken Burns zoom (alternating zoom-in/zoom-out, 1.0–1.12x), ASS subtitles burned via `ass` filter, libx264 CRF 23, AAC 128k.

### Thumbnails (`lib/thumbnailGenerator.ts`)

- Cloudflare FLUX at 1280×720 (shorts) or 1920×1080 (long-form).
- SVG text overlay via sharp: white Montserrat with black stroke, 3 lines max.
- Per-aesthetic thumbnail prefixes ensure visual consistency.

---

## TTS (Text-to-Speech) — F5-TTS on Modal

**Primary (and only active) TTS engine.** `lib/audioEngine.ts` calls the F5-TTS Modal endpoint (`modal/tts.py`).

- **Endpoint**: `POST {F5_TTS_URL}` with `{ text, voice }` → WAV binary.
- **Auth**: Bearer token via `F5_TTS_API_KEY`.
- **Per-shot generation**: Pipeline calls per-shot (not monolithic), which eliminates hallucination bleed between shots and provides exact per-shot timing for render.
- **Concurrency**: Batched 5 at a time in the pipeline; Modal allows max 5 concurrent inputs.
- **Timeout**: 8 minutes per request (covers ~40s cold start + chunked synthesis).
- **Retries**: 3 attempts with 5s linear backoff.
- **Voice**: Set per script via `script.voiceName` in the generated script.

Edge TTS and Fish Audio integrations have been removed; F5-TTS is the sole TTS path.

---

## Music — ACE-Step on Modal

Instrumental BGM is generated per video by ACE-Step 1.5 (open-source DiT model) running on an A10G GPU in `modal/bgm.py`.

- **Endpoint**: `POST {ACE_STEP_BGM_URL}` with `{ prompt, duration, format }` → MP3 binary.
- **Auth**: Bearer token via `ACE_STEP_API_KEY`.
- **Prompt selection**: Niche + format-template-specific prompts (RAPID_FIRE, SLOW_BURN, THE_LIST, DEEP_DIVE) with fallback to generic prompts.
- **Duration**: Clamped 30–90s for shorts, 30–300s for long-form.
- **Warmup**: GPU pre-warmed by calling `GET {ACE_STEP_WARMUP_URL}` at pipeline start (parallel with script generation).
- **Max containers**: 1 (prevents GPU OOM).

Three legacy CC-BY Kevin MacLeod tracks remain in `assets/music/` but are not used by the pipeline.

---

## Video Assembly

Video assembly happens exclusively on Modal. All local FFmpeg code has been removed.

### Modal Render Worker (`modal/render.py`)

Python FastAPI service on Modal (CPU only, `cpu=8.0`), the sole rendering path:

- **Environment**: Debian slim 3.11 + FFmpeg + fontconfig + Whisper (`openai-whisper`, `whisper-timestamped`) + per-niche display fonts.
- **Asset download**: 10-worker ThreadPoolExecutor downloads all images, per-shot audio, and BGM.
- **Subtitle generation**: Generates `.ass` subtitle file with karaoke-style kinetic typography (active word: accent color at 120% scale; inactive: text color). Per-shot audio split provides exact shot boundary timing.
- **Shot rendering**: FFmpeg with Ken Burns zoom (1.0–1.12x, seeded once on frame 0), still image looped to fill shot duration, per-shot TTS audio, ASS subtitles burned via `ass` filter. libx264, CRF 23, preset medium, AAC 128k, 44100Hz stereo.
- **Concat**: FFmpeg concat demuxer for hard cuts, zero crossfade.
- **Audio mixing**: Sidechain compression — music (0.35 volume) ducks under voice at threshold −28dBFS, ratio 4:1, attack 5ms, release 50ms.
- **Upload**: Cloudinary via per-account secrets.
- **Callback**: POSTs to `callbackUrl` with `{ jobId, mp4Url }` (not `videoUrl`).
- **Timeout**: 600s.
- **Legacy path**: If only monolithic audio is provided, falls back to Whisper word-level alignment.

---

## YouTube Upload (`lib/youtubeUpload.ts`)

- OAuth2 client built per channel from decrypted credentials.
- `videos.insert` with snippet (title, description, tags, categoryId 27 Education) and status (unlisted, not made for kids, contains synthetic media — 50% chance).
- Custom thumbnail set via `thumbnails.set` (best-effort, requires 1000 subs).
- Description includes AI disclosure notice (50% chance), key moments from shots, hashtags.
- Returns `{ youtubeVideoId, title, description }`.

---

## Analytics Feedback Loop (`lib/analyticsSync.ts`)

### Daily Sync (5:00 UTC)

1. Finds all topics with `youtube_id` not synced in 24h.
2. Queries YouTube Analytics API v2 for: views, impressions, averageViewPercentage, traffic sources (YT_SEARCH, YT_WATCH_TAB, YT_SHORTS_AGGREGATOR).
3. Falls back to YouTube Data API v3 for basic view counts if Analytics scope missing.
4. Writes all metrics to `slideshow_topics`.

### Performance Analysis (`getNichePerformance`)

Aggregates per niche: counts, averages (views, viewed%, duration%, search%), best aesthetic, best format, top 5 / worst 5 topics.

### Epsilon-Greedy Bandit Data (`getRetentionByConfig`)

Returns average view-duration % grouped by (aesthetic_id, format) for a niche, ordered best-first. Only considers rows with >10 views. Used by `pickFormatTemplate()` to exploit the best-performing format 85% of the time.

### Data-Driven Optimization

Every publish records `aesthetic_id`, `format`, and `quality_score` on the topic. Daily analytics sync populates performance metrics. Over time, the bandit learns which format-aesthetic combinations drive the highest retention per niche.

---

## Credential Management (`lib/accountService.ts`)

Per-channel credentials stored encrypted in `accounts` table (shared with sibling "ai-youtuber" project).

- AES-256-GCM encryption with `NEXTAUTH_SECRET` as key (derived via scrypt).
- Format: `{ivHex}:{authTagHex}:{encryptedHex}`.
- Decrypts on fetch: Google OAuth (client ID, client secret, refresh token) + Cloudinary (cloud name, API key, API secret).
- In-memory cache per Lambda warm instance.

---

## A/B Testing

Each job randomly assigned variant `'A'` or `'B'` (50/50). Stored in both `slideshow_jobs.variant` and `slideshow_uploads.variant`. Combined with analytics metadata (aesthetic, format, quality_score), enables per-variant performance comparison.

---

## Crash Recovery

Pipeline is fully resumable at every step:

- **Script**: Checks for existing incomplete job before generating new one.
- **Assets**: After each shot, URLs persisted to `shot_image_urls`/`shot_audio_urls` immediately. After each batch, DB is updated. On resume, completed shots are skipped.
- **Music**: Checks `music_url` before re-selecting.
- **Thumbnail**: Checks `thumbnail_url` before re-generating.
- **Video**: Checks `video_url` before re-rendering.
- **Publish**: Checks `youtube_video_id` before re-uploading.

Inngest provides 3 retries with step-level memoization. On terminal failure, `onFailure` handler marks the job as `failed` with error message.

---

## Dashboard (`app/page.tsx`)

Server Component, ISR revalidation every 30 seconds.

- Stats row: Total Jobs, Uploaded, In Progress, Success Rate %.
- Jobs table: Topic, Status (color-coded pill with animated dot), Account, Created (relative time), YouTube link.
- Status badges: green (published), blue (assembled/assets ready), amber (generating), muted (pending), red (failed).
- Error messages displayed inline for failed jobs.
- Empty state when no jobs exist.

---

## Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `DATABASE_URL` | database.ts | Pooled Postgres connection (Neon) |
| `NEXTAUTH_SECRET` | accountService.ts | AES-256-GCM key for credentials |
| `NEXTAUTH_URL` | youtubeUpload.ts, analyticsSync.ts | OAuth callback URL |
| `MODAL_LLM_URL` | llm.ts | Modal vLLM endpoint (replaces DeepSeek) |
| `CF_AI_IMAGE_MODEL` | cloudflareAi.ts | Cloudflare FLUX model (default @cf/black-forest-labs/flux-1-schnell) |
| `CF_AI_IMAGE_STEPS` | cloudflareAi.ts | FLUX inference steps (default 8) |
| `CF_AI_IMAGE_STEPS_FLUX2` | cloudflareAi.ts | FLUX.2 steps when using flux-2-dev (default 20) |
| `CF_AI_IMAGE_GUIDANCE_FLUX2` | cloudflareAi.ts | FLUX.2 guidance scale (default 4) |
| `CLOUDFLARE_AI_API_TOKEN` | cloudflareAi.ts | Cloudflare Workers AI (primary) |
| `CLOUDFLARE_AI_API_TOKEN_1` through `_5` | cloudflareAi.ts | Cloudflare Workers AI (account pairs 2–6) |
| `CLOUDFLARE_ACCOUNT_ID` | cloudflareAi.ts | Cloudflare account (primary) |
| `CLOUDFLARE_ACCOUNT_ID_1` through `_5` | cloudflareAi.ts | Cloudflare account (pairs 2–6) |
| `F5_TTS_URL` | audioEngine.ts | F5-TTS Modal endpoint |
| `F5_TTS_API_KEY` | audioEngine.ts | F5-TTS auth |
| `ACE_STEP_BGM_URL` | musicSelector.ts | ACE-Step BGM generation Modal endpoint |
| `ACE_STEP_API_KEY` | musicSelector.ts | ACE-Step auth |
| `ACE_STEP_WARMUP_URL` | pipeline.ts | ACE-Step GPU warmup endpoint |
| `INNGEST_EVENT_KEY` | trigger-prod.ts | Inngest Cloud (prod only) |
| `INNGEST_DEV` | client.ts | Inngest local dev mode (skips publish when set to 1) |
| `CRON_SECRET` | cron/route.ts, retry/route.ts | Cron endpoint auth |
| `MODAL_RENDER_URL` | pipeline.ts | Modal FFmpeg render endpoint |
| `YOUTUBE_API_KEY` | analyticsSync.ts | YouTube Data API v3 fallback |
| `ACCOUNT_ID` | constants.ts | Default channel ID |

Removed: `DEEPSEEK_API_KEY`, `DEEPSEEK_TEXT_MODEL` (replaced by `MODAL_LLM_URL`).
