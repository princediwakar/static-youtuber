# System Architecture

Fully automated pipeline that generates, assembles, and publishes AI-powered YouTube Shorts across 4 niche channels. One video per channel per day, staggered across UTC hours. Zero human intervention from topic to publish.

**Stack:** Next.js 16 (App Router), TypeScript 5, PostgreSQL (Neon), Inngest (orchestration), Tailwind CSS 4, Python/Modal (GPU render worker with Whisper)

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
│   ├── edgeTts.ts                  # Self-hosted Edge TTS client (primary voiceover)
│   ├── fishAudio.ts                # Fish Audio TTS client (inactive, not called from pipeline)
│   ├── topicGenerator.ts           # Two-pass script generation engine
│   ├── captionValidator.ts         # Caption constraint enforcement
│   ├── imageGenerator.ts           # Caption burn onto images (dead code — captions rendered on Modal)
│   ├── ttsGenerator.ts             # TTS prompt builder (unused in pipeline)
│   ├── musicSelector.ts            # AI music track selection
│   ├── thumbnailGenerator.ts       # Thumbnail generation + SVG overlay
│   ├── videoAssembler.ts           # FFmpeg clip assembly (not called by pipeline — dead code)
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
│   └── render.py                   # GPU FFmpeg render worker + Whisper kinetic typography (Python)
├── assets/
│   ├── fonts/Montserrat-Bold.ttf   # Caption font
│   └── music/                      # 3 CC-BY background tracks
├── scripts/                        # Dev tooling, tests, seed data
└── scratch/                        # Experimental code
```

---

## External Services

| Service | Purpose | Auth |
|---|---|---|
| **Neon** | Serverless Postgres (jobs, topics, uploads) | `DATABASE_URL` + SSL |
| **DeepSeek** | Script writing, topic gen, quality scoring, music selection | `DEEPSEEK_API_KEY` |
| **Cloudflare Workers AI** | FLUX.1 [schnell] image generation (slides + thumbnails); up to 3 account pairs for round-robin | API token(s) + account ID(s) |
| **Edge TTS** | Self-hosted TTS on EC2 (primary voiceover) | `EDGE_TTS_API_KEY` |
| **Fish Audio** | Alternate TTS (s2.1-pro-free, integrated but not active in pipeline) | `FISH_API_KEY` |
| **Cloudinary** | Asset CDN (images, audio, video, thumbnails; 7-day retention) | Per-channel API key/secret |
| **YouTube Data API v3** | Video upload + basic stats | OAuth2 per channel |
| **YouTube Analytics API v2** | Shorts metrics (views, swipe rate, traffic sources) | OAuth2 |
| **Inngest** | Pipeline orchestration, retries, cron, event-driven steps | Event key + signing key |
| **Modal** | GPU-accelerated FFmpeg rendering + Whisper kinetic typography (Python) | HTTP callback |
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
| `status` | TEXT | Pipeline stage (pending → script_ready → assets_ready → assembled → published) |
| `inngest_run_id` | TEXT | Inngest run identifier for resume |
| `script` | JSONB | Full SlideshowScript object |
| `shot_image_urls` | JSONB | Cloudinary URLs per shot (crash recovery) |
| `shot_audio_urls` | JSONB | Cloudinary TTS URLs per shot (crash recovery) |
| `video_url` | TEXT | Final assembled MP4 |
| `thumbnail_url` | TEXT | YouTube thumbnail |
| `youtube_video_id` | TEXT | Published YouTube video ID |
| `music_url` | TEXT | Selected background music URL |
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

**Step 1 — Script Generation**
- Checks for incomplete existing job (crash recovery / resume).
- Otherwise calls `generateScript()` which: reserves topic atomically (`FOR UPDATE SKIP LOCKED`), picks format template probabilistically, runs the two-pass script engine (narrative → chunking), validates against Zod schema, heals oversized/undersized shots, runs caption validation, scores via quality gate (retries up to 2× if below threshold).
- Creates `slideshow_jobs` row with status `script_ready`.

**Step 2 — Per-Shot Assets**
- Iterates each shot. Memoizes existing URLs from DB (resume skip).
- Runs image generation (Cloudflare FLUX) and TTS (Edge TTS) **in parallel** per shot.
- Raw image uploaded directly — captions are rendered on Modal via ASS/FFmpeg subtitle burning.
- Uploads both image and audio to Cloudinary in parallel.
- Persists URLs immediately for crash recovery.

**Step 3 — Music Selection**
- DeepSeek picks best track from 3-track catalog based on title, niche, visual world.
- Uploads to Cloudinary.

**Step 4 — Video Rendering**
- Generates thumbnail (Cloudflare FLUX + SVG text overlay).
- Sends render request to Modal GPU worker (mandatory) with `caption_text` per shot. Waits 90s for inline response; if async, awaits webhook for up to 10min.
- No local FFmpeg fallback — if Modal is unreachable or webhook times out, the pipeline throws and Inngest retries.

**Step 5 — Publish** (optional, controlled by `skipPublish`)
- Downloads thumbnail, uploads video + thumbnail to YouTube via OAuth2.
- Records upload in `slideshow_uploads`, analytics metadata on `slideshow_topics`.
- Sets job status to `published`.
- Cleans up Cloudinary artifacts.

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
- **TTS pacing (raw_text)**: Commas for 200ms pauses, em-dashes for dramatic beats. Final shot must end with sentence-ending punctuation.
- **Caption derivation**: `caption_text` auto-derived from `raw_text` by stripping commas/em-dashes (Zod transform).
- **Visual prompts**: Natural language paragraphs for FLUX.1's T5-XXL encoder (not comma tags). Explicit instruction to describe environments with no text/words/signs.
- **JSON output**: Full `SlideshowScriptSchema` with fact_check_and_sources, visual_world, format_template, title, description, tags, shots, thumbnailPrompt.

### Self-Healing Shot Mutator (`healShots`)

Two-dimensional partitioner that runs after Pass 2:
- Slices shots on word count (3–12) AND character count (≤75, for 80-char cap and 3×26 line wrap) simultaneously.
- Heals orphan chunks (<3 words) by merging backward and re-splitting evenly.
- Merges forward undersized shots if within character limit.
- Re-indexes IDs and ensures exactly one conclusion at the final position.

### Quality Gate (`scoreScript`, DeepSeek, temperature 0.1)

Evaluates across 7 dimensions (0–10):

| Dimension | Measures |
|---|---|
| specificity | Every sentence has an anchor |
| hook_strength | Two facts that cannot coexist |
| information_density | Every shot delivers a new verifiable fact |
| tone_calibration | Perfectly calibrated to niche voice |
| pacing | Natural shot lengths, feels <60s |
| visual_entropy | Image prompts distinct enough to prevent visual fatigue |
| visual_coherence | Prompts form a unified visual world |

Pass: overall ≥7.0 AND no dimension <5. Max 2 retries with feedback from previous score.

### Topic Generation (DeepSeek, temperature 0.9)

`generateTopics()` creates 20 fresh topics when pool is exhausted. Excludes last 50 used topics. Niche-specific quality criteria. Each topic includes a `research_context` column with ground-truth data for Pass 1.

---

## Topic Reservation

`reserveTopic()` uses `FOR UPDATE SKIP LOCKED` to atomically claim the next unused topic. Prevents concurrent pipeline runs from claiming the same topic. Returns `{ id, topic, research_context }`. Sets `used = TRUE` and `used_at = NOW()`. On pipeline failure, `releaseTopic()` returns the topic to the pool.

Seed data: 80 hand-crafted topics (20 per niche) in `scripts/seed-topics.ts`.

---

## Image Generation

### Slides (Cloudflare Workers AI — FLUX.1 [schnell])

- Resolution: 576×1024, 4 steps.
- **Multi-account round-robin**: Collects up to 3 account pairs from `CLOUDFLARE_AI_API_TOKEN[_1/_2]` and `CLOUDFLARE_ACCOUNT_ID[_1/_2]`. Picks one at random per generation call. Fails hard if no pair is configured.
- Disk cache at `/tmp/cache/flux/{sha256}.jpg` keyed on prompt+dims+steps.
- 3 retries with exponential backoff on 429/502/503/504, plus network errors (ETIMEDOUT, ECONNRESET, etc.).
- Each prompt prepended with aesthetic-specific `imagePrefix` (natural language paragraphs, not comma tags — FLUX uses a T5-XXL text encoder that understands syntax and spatial relationships).
- Negative terms per aesthetic (e.g., "text, watermark, logo, blurry, bright colors").

### Caption Rendering (Modal GPU — Whisper + ASS)

Captions are rendered on Modal, not locally. The pipeline sends `caption_text` per shot to Modal along with image and audio URLs. Modal's GPU worker:
1. Downloads the TTS audio for each shot.
2. Runs `whisper-timestamped` (base model, CUDA) for forced word-level alignment.
3. Generates an Advanced SubStation Alpha (`.ass`) subtitle file with karaoke-style kinetic typography: the currently spoken word is highlighted in gold (`\c&H00D7FF&`) at 120% scale, inactive words stay white.
4. Burns the ASS subtitles directly into the video frame via FFmpeg's `ass` filter.

Font: Montserrat Bold 72px, white with black outline/shadow, centered at bottom margin (600px).

`lib/imageGenerator.ts` `burnCaption()` still exists in the codebase but is **not called from the pipeline** — it is dead code.

### Thumbnails (`lib/thumbnailGenerator.ts`)

- Cloudflare FLUX at 1280×720 (higher steps for quality).
- SVG text overlay: white Arial Black with black stroke, gradient dark background at bottom 68%.
- Max 3 title lines.

---

## TTS (Text-to-Speech)

### Primary: Edge TTS (self-hosted on EC2)

`lib/edgeTts.ts` → `POST {EDGE_TTS_URL}/v1/audio/speech` with voice, input, mp3 format. 3 retries with backoff.

| Niche | Voice |
|---|---|
| SaaS & AI Tools | en-US-AriaNeural (female) |
| Financial Forensics | en-US-GuyNeural (male) |
| Stoic Philosophy | en-US-ChristopherNeural (male) |
| Urban Survival | en-US-EricNeural (male) |

### Alternate: Fish Audio

`lib/fishAudio.ts` → `POST https://api.fish.audio/v1/tts` with reference voice ID, WAV format. Includes detailed "director notes" per niche describing delivery style in prose. WAV header validation. Inactive in current pipeline; imported but not called from `pipeline.ts`.

### Audio Director Tags

Optional per-shot annotations: `[serious]`, `[curious]`, `[urgent]`, `[measured]`, `[grave]`. Prepended to TTS input text when present. Stripped before caption rendering (captions use `caption_text` field which excludes tags).

---

## Music

Three CC-BY tracks (Kevin MacLeod) in `assets/music/`:

| File | BPM | Energy | Character |
|---|---|---|---|
| focus-01.mp3 | 120 | 6 | Steady driving pulse, electronic, neutral |
| tension-01.mp3 | 90 | 7 | Slow-building tension, atmospheric drones |
| ambient-01.mp3 | 70 | 3 | Spacious ambient pads, contemplative |

Track selected by DeepSeek based on script title, niche, visual world. Falls back to focus-01.mp3.

---

## Video Assembly

Video assembly happens exclusively on Modal. `lib/videoAssembler.ts` is **not imported by the pipeline** — it is dead code that remains for reference.

### Modal GPU Render Worker (`modal/render.py`)

Python FastAPI service on Modal, the sole rendering path:

- **Environment**: Debian slim 3.11 + FFmpeg + fontconfig + Whisper (`openai-whisper`, `whisper-timestamped`) + Montserrat Bold font downloaded into container.
- **Asset download**: 10-worker ThreadPoolExecutor downloads all images, audio, and music.
- **Subtitle generation**: GPU function (`gpu="T4"`) uses `whisper-timestamped` for forced word-level alignment, generates `.ass` subtitle file with karaoke-style highlighting (active word: gold at 120% scale; inactive: white).
- **Shot rendering**: FFmpeg with Ken Burns zoom (alternating direction), still image looped, TTS audio, ASS subtitles burned via `ass` filter. libx264, CRF 23, preset fast, AAC 128k, 44100Hz stereo.
- **Concat**: FFmpeg concat demuxer for hard cuts, zero crossfade.
- **Audio mixing**: Sidechain compression — music (0.35 volume) ducks under voice at threshold −28dBFS, ratio 4:1, attack 5ms, release 50ms. Voice + ducked music mixed via amix.
- **Upload**: Cloudinary via per-account secrets.
- **Callback**: POSTs to `callbackUrl` with `{ jobId, videoUrl }`.
- 600s timeout.

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
| `DATABASE_URL_UNPOOLED` | — | Direct Postgres connection |
| `NEON_PROJECT_ID` | — | Neon project identifier |
| `NEXTAUTH_SECRET` | accountService.ts | AES-256-GCM key for credentials |
| `NEXTAUTH_URL` | youtubeUpload.ts, analyticsSync.ts | OAuth callback URL |
| `DEEPSEEK_API_KEY` | deepseek.ts | DeepSeek API |
| `CLOUDFLARE_AI_API_TOKEN` | cloudflareAi.ts | Cloudflare Workers AI (primary) |
| `CLOUDFLARE_AI_API_TOKEN_1` | cloudflareAi.ts | Cloudflare Workers AI (account pair 2) |
| `CLOUDFLARE_AI_API_TOKEN_2` | cloudflareAi.ts | Cloudflare Workers AI (account pair 3) |
| `CLOUDFLARE_ACCOUNT_ID` | cloudflareAi.ts | Cloudflare account (primary) |
| `CLOUDFLARE_ACCOUNT_ID_1` | cloudflareAi.ts | Cloudflare account (pair 2) |
| `CLOUDFLARE_ACCOUNT_ID_2` | cloudflareAi.ts | Cloudflare account (pair 3) |
| `EDGE_TTS_URL` | constants.ts | Self-hosted Edge TTS (default localhost:5050) |
| `EDGE_TTS_API_KEY` | constants.ts | Edge TTS auth |
| `FISH_API_KEY` | fishAudio.ts | Fish Audio TTS (inactive) |
| `INNGEST_EVENT_KEY` | trigger-prod.ts | Inngest Cloud (prod only) |
| `INNGEST_DEV` | client.ts | Inngest local dev mode |
| `CRON_SECRET` | cron/route.ts, retry/route.ts | Cron endpoint auth |
| `MODAL_RENDER_URL` | constants.ts | Modal GPU render (mandatory for production) |
| `YOUTUBE_API_KEY` | analyticsSync.ts | YouTube Data API v3 fallback |
| `ACCOUNT_ID` | constants.ts | Default channel ID |
