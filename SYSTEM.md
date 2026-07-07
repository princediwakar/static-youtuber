# System Architecture

Fully automated pipeline that generates, assembles, and publishes AI-powered YouTube Shorts across 4 niche channels. One video per channel per day, staggered across UTC hours. Zero human intervention from topic to publish.

**Stack:** Next.js 16 (App Router), TypeScript 5, PostgreSQL (Neon), Inngest (orchestration), Tailwind CSS 4, Python/Modal (F5-TTS voice cloning on A10G, ACE-Step BGM generation on A10G, CPU FFmpeg render worker)

---

## Directory Map

```
├── app/
│   ├── layout.tsx                  # Root layout, Inter font, dark theme
│   ├── page.tsx                    # Server-rendered dashboard (ISR 30s)
│   ├── globals.css                 # Design tokens, component styles
│   └── api/
│       ├── cron/route.ts           # Pipeline trigger endpoint (CRON_SECRET)
│       ├── inngest/route.ts        # Inngest serve (GET/POST/PUT, 300s max)
│       ├── jobs/[jobId]/retry/route.ts  # Job retry endpoint
│       └── webhooks/modal/route.ts # Modal render completion callback
├── lib/
│   ├── constants.ts                # All runtime constants (centralized)
│   ├── types.ts                    # Shot, SlideshowScript, SlideshowJob
│   ├── database.ts                 # Postgres pool + query helpers (Neon cold-start retry)
│   ├── deepseek.ts                 # DeepSeek API client
│   ├── cloudflareAi.ts             # Cloudflare FLUX.1 image gen (multi-account round-robin)
│   ├── audioEngine.ts              # F5-TTS voice cloning client (Modal)
│   ├── topicGenerator.ts           # Two-pass script generation engine
│   ├── captionValidator.ts         # Caption constraint enforcement
│   ├── ttsGenerator.ts             # TTS prompt builder (unused in pipeline)
│   ├── musicSelector.ts            # ACE-Step BGM generation (Modal)
│   ├── thumbnailGenerator.ts       # Thumbnail generation + SVG overlay
│   ├── youtubeUpload.ts            # YouTube OAuth2 upload
│   ├── accountService.ts           # AES-256-GCM credential decryption
│   ├── analyticsSync.ts            # YouTube Analytics sync + reporting
│   └── cloudinary.ts               # Asset upload/download/cleanup
├── inngest/
│   ├── client.ts                   # Inngest singleton
│   └── pipeline.ts                 # generateShort, channelScheduler, syncAnalyticsCron
├── database/
│   └── schema.sql                  # DDL (3 tables + trigger)
├── migrations/                     # Incremental schema changes (8 migrations)
├── modal/
│   ├── bgm.py                      # ACE-Step BGM generation (A10G GPU)
│   ├── tts.py                      # F5-TTS voice cloning (A10G GPU, max 5 concurrent)
│   └── render.py                   # FFmpeg render worker + Whisper word alignment (CPU)
├── assets/
│   ├── fonts/Montserrat-Bold.ttf   # Fallback caption font
│   └── music/                      # 3 CC-BY background tracks (unused — ACE-Step active)
├── docs/
│   └── adding-an-account.md        # Guide for onboarding new channels
├── scripts/                        # Dev tooling, tests, seed data
└── scratch/                        # Experimental code
```

---

## External Services

| Service | Purpose | Auth |
|---|---|---|
| **Neon** | Serverless Postgres (jobs, topics, uploads) | `DATABASE_URL` + SSL |
| **DeepSeek** | Script writing, topic gen, quality scoring | `DEEPSEEK_API_KEY` |
| **Cloudflare Workers AI** | FLUX.1 [schnell] image generation (slides + thumbnails); up to 6 account pairs for round-robin | API token(s) + account ID(s) |
| **F5-TTS** (Modal) | Voice-cloned narration per shot (open-source, A10G GPU) | `F5_TTS_API_KEY` |
| **ACE-Step** (Modal) | Instrumental BGM generation (open-source, A10G GPU) | `ACE_STEP_API_KEY` |
| **Cloudinary** | Asset CDN (images, audio, video, thumbnails; 7-day retention) | Per-channel API key/secret |
| **YouTube Data API v3** | Video upload + basic stats | OAuth2 per channel |
| **YouTube Analytics API v2** | Shorts metrics (views, swipe rate, traffic sources) | OAuth2 |
| **Inngest** | Pipeline orchestration, retries, cron, event-driven steps | Event key + signing key |
| **Modal** | GPU services (F5-TTS, ACE-Step) + CPU FFmpeg render; all self-hosted Python | HTTP callback + secrets |
| **Vercel** | Next.js hosting | Vercel OIDC |

---

## Database Schema

### `slideshow_jobs`

Tracks every pipeline run from script generation through publish. Primary job record.

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID PK | Job identifier |
| `account_id` | TEXT | Channel (tech_shots, financial_forensics, etc.) |
| `topic` | TEXT | Reserved topic string |
| `niche` | TEXT | Niche category |
| `format_template` | VARCHAR(20) | RAPID_FIRE, SLOW_BURN, or THE_LIST |
| `status` | TEXT | Pipeline stage (pending → script_ready → assets_ready → assembled → published → failed) |
| `inngest_run_id` | TEXT | Inngest run identifier for resume |
| `script` | JSONB | Full SlideshowScript object |
| `shot_image_urls` | JSONB | Cloudinary URLs per shot (crash recovery) |
| `shot_audio_urls` | JSONB | Cloudinary TTS URLs per shot (crash recovery) |
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

Indexes: `status`, `account_id`, `created_at DESC`.

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

Three Inngest functions in `inngest/pipeline.ts`:

### `generateShort` — event: `slideshow/trigger`

3 retries, 2-hour timeout. On failure, marks job as `failed`.

**Step 1 — Script Generation + GPU Warmup (parallelized)**
- Checks for incomplete existing job (crash recovery / resume).
- Otherwise calls `generateScript()` which: reserves topic atomically (`FOR UPDATE SKIP LOCKED`), picks format template probabilistically, runs the two-pass script engine (narrative → chunking), validates against Zod schema, heals oversized/undersized shots, runs caption validation, scores via quality gate (retries up to 4× if below threshold).
- Simultaneously warms ACE-Step GPU by hitting the Modal warmup endpoint (pre-loads model weights, reduces cold start from ~40s to near-zero).
- Creates `slideshow_jobs` row with status `script_ready`.

**Step 2a — Generate Narration (per-shot F5-TTS)**
- Iterates each shot in batches of 5 (concurrency limit).
- Calls F5-TTS Modal endpoint per shot (voice-cloned WAV output, ~40s cold start on first call).
- Sanitizes text (curly quotes → straight, em-dashes → ellipsis, strips non-ASCII).
- Uploads each WAV to Cloudinary as `raw` resource.
- Persists `shot_audio_urls` to DB immediately for crash recovery.

**Step 2b — Parallel Remaining Assets (images, BGM, thumbnail)**
- Runs three tasks concurrently via `Promise.all`:
  - **Images**: Generates all slide images via Cloudflare FLUX (batches of 5), uploads to Cloudinary, persists `shot_image_urls` incrementally after each batch.
  - **Music**: Calls ACE-Step Modal endpoint with niche+format-specific prompt and duration (clamped 30-90s), uploads MP3 to Cloudinary.
  - **Thumbnail**: Generates via Cloudflare FLUX (1280×720), overlays title via SVG text overlay, uploads to Cloudinary.
- Marks status `assets_ready` once all three complete.

**Step 3 — Video Rendering (Modal CPU)**
- Sends all assets (images, per-shot audio, BGM, caption styles, callback URL) to render endpoint.
- Waits 30s for inline response; if Modal returns a video URL immediately, proceeds. If Modal returns a status (queued), awaits `modal/render.complete` webhook for up to 10min.
- On success, marks status `assembled`.
- No local FFmpeg fallback — if Modal is unreachable or webhook times out, the pipeline throws and Inngest retries.

**Step 4 — Publish** (optional, controlled by `skipPublish`)
- Downloads thumbnail, uploads video + thumbnail to YouTube via OAuth2.
- Records upload in `slideshow_uploads`, analytics metadata on `slideshow_topics`.
- Sets job status to `published`.

### `channelScheduler` — cron

Triggers at UTC 15, 17, 19, 21 (one niche per hour). Queries active accounts, filters to niche matching current hour, checks 24h throttle, sends `slideshow/trigger` for each due channel.

| UTC | Niche |
|---|---|
| 15:00 | Financial Forensics |
| 17:00 | Stoic Philosophy |
| 19:00 | Urban Survival |
| 21:00 | SaaS & AI Tools |

### `syncAnalyticsCron` — cron

Daily at 5:00 UTC. Pulls YouTube Analytics (views, impressions, avg view duration %, traffic source breakdown) for all unsynced published videos. Falls back gracefully on missing OAuth scopes. Updates `slideshow_topics`.

---

## Script Generation Engine

`lib/topicGenerator.ts` — two-pass architecture plus quality gate:

### Pass 1: Narrative Generation (`generateNarrative`, DeepSeek, temperature 0.7)

Generates a 150–170 word prose narrative from the topic and `research_context`. The system prompt covers:
- **Tone mandate**: Niche-specific voice instructions from `NICHE_PROFILES`.
- **Ground-truth requirement**: Uses exact dates, names, and numbers from research context. No hallucination.
- **Storytelling rules**: Hook with cognitive dissonance, build tension with cause/effect, end with a devastating conclusion.
- **No CTAs**: "subscribe", "like", "comment", "follow", "link in bio", "thanks for watching" all banned.
- **Output format**: Pure prose, no JSON, no formatting.

### Pass 2: Editor/Chunking (`chunkScriptToJSON`, DeepSeek, temperature 0.2)

Slices the Pass 1 narrative into formatted JSON following the Zod schema. The system prompt covers:
- **Shot counts**: Template-specific (`RAPID_FIRE`: 15–18, `SLOW_BURN`: 12, `THE_LIST`: 15).
- **Spoken text (`spoken_text`)**: Commas for 200ms pauses, em-dashes for dramatic beats. Final shot must end with sentence-ending punctuation.
- **Caption derivation**: `caption_text` auto-derived from `spoken_text` by stripping commas/em-dashes (Zod transform).
- **Visual prompts**: Natural language paragraphs for FLUX.1's T5-XXL encoder (not comma tags). Explicit instruction to describe environments with no text/words/signs.
- **JSON output**: Full `SlideshowScriptSchema` with fact_check_and_sources, visual_world, format_template, title, description, tags, shots, thumbnailPrompt, voiceName.
- **Quality feedback**: Title, description, and thumbnailPrompt are sent alongside shots for scoring, enabling the quality gate to evaluate hook/payoff match.

### Self-Healing Shot Mutator (`healShots`)

Two-dimensional partitioner that runs after Pass 2:
- Slices shots on word count (3–12) AND character count simultaneously (per-niche max chars, derived from caption style).
- Heals orphan chunks (<3 words) by merging backward and re-splitting evenly.
- Merges forward undersized shots if within character limit.
- Re-indexes IDs and ensures exactly one conclusion at the final position.

### Quality Gate (`scoreScript`, DeepSeek, temperature 0.1)

Evaluates across 9 dimensions (0–10). The scoring payload now includes `title`, `description`, and `thumbnailPrompt` alongside shots so the gate can evaluate whether the hook pays off (not just each shot in isolation):

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
2. **Code-side floor**: The pipeline re-verifies that `overall ≥ minQualityScore` and all 9 dimensions are ≥ 5. If the model reports `approved = true` but the code-side floor fails, it's treated as not approved (with a warning logged).

Max 4 retries with feedback from previous score. On terminal failure, the last attempt is accepted regardless.

### Topic Generation (DeepSeek, temperature 0.9)

`generateTopics()` creates 20 fresh topics when pool is exhausted. Excludes last 50 used topics. Niche-specific quality criteria. Each topic includes a `research_context` column with ground-truth data for Pass 1.

---

## Topic Reservation

`reserveTopic()` uses `FOR UPDATE SKIP LOCKED` to atomically claim the next unused topic. Prevents concurrent pipeline runs from claiming the same topic. Returns `{ id, topic, research_context }`. Sets `used = TRUE` and `used_at = NOW()`. On pipeline failure, `releaseTopic()` returns the topic to the pool.

Seed data: 80 hand-crafted topics (20 per niche) in `scripts/seed-topics.ts`.

---

## Image Generation

### Slides (Cloudflare Workers AI — FLUX.1 [schnell])

- Resolution: 768×1344, 8 steps (configurable via env vars).
- **Multi-account round-robin**: Collects up to 6 account pairs from `CLOUDFLARE_AI_API_TOKEN[_1/_2/_3/_4/_5]` and `CLOUDFLARE_ACCOUNT_ID[_1/_2/_3/_4/_5]`. Picks one at random per generation call. Fails hard if no pair is configured.
- Disk cache at `/tmp/cache/flux/{sha256}.jpg` keyed on model+prompt+dims+steps+guidance.
- 3 retries with exponential backoff on 429/502/503/504, plus network errors (ETIMEDOUT, ECONNRESET, etc.).
- Each prompt prepended with aesthetic-specific `imagePrefix` (natural language paragraphs, not comma tags — FLUX uses a T5-XXL text encoder that understands syntax and spatial relationships).
- Supports upgrade path to FLUX.2 [dev] (`@cf/black-forest-labs/flux-2-dev`) via env var — uses multipart/form-data, different step/guidance defaults, 40-60× cost increase.

### Caption Rendering (Modal Render — ASS Subtitles)

Captions are rendered on Modal, not locally. The pipeline sends `caption_text` per shot to Modal along with image URLs, per-shot audio URLs, `visual_world`, and `caption_style`. Modal's CPU render worker:
1. Downloads all assets (images, per-shot TTS audio, BGM) via 10-worker ThreadPoolExecutor.
2. Concatenates per-shot audio files into one master narration track (no Whisper needed for timing since per-shot split provides exact shot boundaries).
3. Generates an Advanced SubStation Alpha (`.ass`) subtitle file with karaoke-style kinetic typography.
4. Burns the ASS subtitles directly into the video frame via FFmpeg's `ass` filter.

Typography is per-niche, driven by `CAPTION_STYLES` in constants.ts:

| Aesthetic | Font Family | Colors | Max chars/line |
|---|---|---|---|
| tech-minimalist | Space Grotesk | Warm white / navy / orange | 34 / 85 |
| finance-editorial | Fraunces 72pt Black | Bone white / near-black / red | 36 / 90 |
| stoic-zen | Cinzel Black | Warm ivory / charcoal / copper | 29 / 72 |
| survival-technical | Big Shoulders Stencil Display | Khaki / near-black / rust | 48 / 120 |

### Thumbnails (`lib/thumbnailGenerator.ts`)

- Cloudflare FLUX at 1280×720 (8 steps).
- SVG text overlay: white Arial Black with black stroke, gradient dark background at bottom 68%.
- Max 3 title lines.

---

## TTS (Text-to-Speech) — F5-TTS on Modal

**Primary (and only active) TTS engine.** `lib/audioEngine.ts` calls the F5-TTS Modal endpoint (`modal/tts.py`) — an open-source voice cloning model running on an A10G GPU.

- **Endpoint**: `POST {F5_TTS_URL}` with `{ text, voice }` → WAV binary.
- **Auth**: Bearer token via `F5_TTS_API_KEY`.
- **Per-shot generation**: Pipeline calls per-shot (not monolithic), which eliminates hallucination bleed between shots and provides exact per-shot timing for render.
- **Concurrency**: Batched 5 at a time in the pipeline; Modal allows max 5 concurrent inputs.
- **Timeout**: 8 minutes per request (covers ~40s cold start + chunked synthesis).
- **Retries**: 3 attempts with 5s linear backoff.
- **Voice**: Set per script via `script.voiceName` in the generated script.

Edge TTS and Fish Audio were previously integrated as alternatives but their client files have been removed; F5-TTS is the sole TTS path.

### Audio Director Tags

Optional per-shot annotations: `[serious]`, `[curious]`, `[urgent]`, `[measured]`, `[grave]`. Prepended to TTS input text when present. Stripped before caption rendering (captions use `caption_text` field which excludes tags).

---

## Music — ACE-Step on Modal

Instrumental BGM is generated per video by ACE-Step 1.5 (open-source DiT model) running on an A10G GPU in `modal/bgm.py`.

- **Endpoint**: `POST {ACE_STEP_BGM_URL}` with `{ prompt, duration, format }` → MP3 binary.
- **Auth**: Bearer token via `ACE_STEP_API_KEY`.
- **Prompt selection**: Niche + format-template-specific prompts (e.g., "dark ambient, pulsing synth bass, investigative, tense, 85bpm") with fallback to generic prompts.
- **Duration**: Clamped to 30–90 seconds based on narration length.
- **Warmup**: GPU pre-warmed by calling `GET {ACE_STEP_WARMUP_URL}` at pipeline start (parallel with script generation).
- **Max containers**: 1 (prevents GPU OOM).

Three legacy CC-BY Kevin MacLeod tracks remain in `assets/music/` but are not used by the pipeline.

---

## Video Assembly

Video assembly happens exclusively on Modal. All local FFmpeg code has been removed.

### Modal Render Worker (`modal/render.py`)

Python FastAPI service on Modal (CPU only, `cpu=8.0`), the sole rendering path:

- **Environment**: Debian slim 3.11 + FFmpeg + fontconfig + Whisper (`openai-whisper`, `whisper-timestamped`) + per-niche display fonts (Space Grotesk, Fraunces, Cinzel, Big Shoulders Stencil Display, each cut from variable source via fonttools).
- **Asset download**: 10-worker ThreadPoolExecutor downloads all images, per-shot audio, and BGM.
- **Subtitle generation**: Generates `.ass` subtitle file with karaoke-style kinetic typography (active word: accent color at 120% scale; inactive: text color). Per-shot audio split provides exact shot boundary timing.
- **Shot rendering**: FFmpeg with Ken Burns zoom (alternating zoom-in/zoom-out, range 1.0–1.12x, seeded once on frame 0 via `eq(on,0)` — previously used `eq(mod(on,2),0)` which reseeded every even frame and produced zero visible movement), still image looped to fill shot duration, per-shot TTS audio, ASS subtitles burned via `ass` filter. libx264, CRF 23, preset medium, AAC 128k, 44100Hz stereo.
- **Concat**: FFmpeg concat demuxer for hard cuts, zero crossfade.
- **Audio mixing**: Sidechain compression — music (0.35 volume) ducks under voice at threshold −28dBFS, ratio 4:1, attack 5ms, release 50ms. Voice + ducked music mixed via amix.
- **Upload**: Cloudinary via per-account secrets.
- **Callback**: POSTs to `callbackUrl` with `{ jobId, videoUrl }`.
- **Timeout**: 600s.
- **Legacy path**: If only monolithic audio is provided (no per-shot URLs), falls back to Whisper word-level alignment with `whisper-timestamped` (small model) for shot boundary detection.

No local FFmpeg fallback exists. If Modal is unreachable or the webhook does not arrive within 10 minutes, the pipeline throws and Inngest retries.

---

## YouTube Upload (`lib/youtubeUpload.ts`)

- OAuth2 client built per channel from decrypted credentials.
- `videos.insert` with snippet (title, description, tags, categoryId 27 Education) and status (public, not made for kids, contains synthetic media).
- Custom thumbnail set via `thumbnails.set` (best-effort, requires 1000 subs).
- Description includes AI disclosure notice.
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

### Data-Driven Optimization

Every publish records `aesthetic_id`, `format`, and `quality_score` on the topic. Daily analytics sync populates performance metrics. Over time, `getNichePerformance()` reveals which visual worlds and format templates drive the highest swipe-through and view duration per niche.

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
- **Assets**: After each shot, URLs persisted to `shot_image_urls`/`shot_audio_urls` immediately. On resume, completed shots are skipped.
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
- Status badges: green (uploaded), blue (assembled/assets ready), amber (generating), muted (pending), red (failed).
- Error messages displayed inline for failed jobs.
- Animated pulsing dot for in-progress channels.
- Empty state when no jobs exist.

---

## Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `DATABASE_URL` | database.ts | Pooled Postgres connection (Neon) |
| `NEXTAUTH_SECRET` | accountService.ts | AES-256-GCM key for credentials |
| `NEXTAUTH_URL` | youtubeUpload.ts, analyticsSync.ts | OAuth callback URL |
| `DEEPSEEK_API_KEY` | deepseek.ts | DeepSeek API |
| `DEEPSEEK_TEXT_MODEL` | constants.ts | DeepSeek model name (default deepseek-v4-pro) |
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
