# System Architecture

Fully automated pipeline that generates, assembles, and publishes AI-powered YouTube Shorts across 4 niche channels. One video per channel per day, staggered across UTC hours. Zero human intervention from topic to publish.

**Stack:** Next.js 16 (App Router), TypeScript 5, PostgreSQL (Neon), Inngest (orchestration), Tailwind CSS 4, Python/Modal (GPU render worker)

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
│   ├── database.ts                 # Postgres pool + query helpers
│   ├── deepseek.ts                 # DeepSeek API client
│   ├── cloudflareAi.ts             # Cloudflare FLUX.1 image generation
│   ├── edgeTts.ts                  # Self-hosted Edge TTS client
│   ├── fishAudio.ts                # Fish Audio TTS client (alternate)
│   ├── topicGenerator.ts           # Script generation engine
│   ├── captionValidator.ts         # Caption constraint enforcement
│   ├── imageGenerator.ts           # Kinetic typography burn onto images
│   ├── ttsGenerator.ts             # TTS prompt builder
│   ├── musicSelector.ts            # AI music track selection
│   ├── thumbnailGenerator.ts       # Thumbnail generation + SVG overlay
│   ├── videoAssembler.ts           # FFmpeg clip assembly + sidechain mix
│   ├── youtubeUpload.ts            # YouTube OAuth2 upload
│   ├── accountService.ts           # AES-256-GCM credential decryption
│   ├── analyticsSync.ts            # YouTube Analytics sync + reporting
│   └── cloudinary.ts               # Asset upload/download/cleanup
├── inngest/
│   ├── client.ts                   # Inngest singleton
│   └── pipeline.ts                 # generateShort, channelScheduler, syncAnalyticsCron
├── database/
│   └── schema.sql                  # DDL (3 tables + trigger)
├── migrations/                     # Incremental schema changes
├── modal/
│   └── render.py                   # GPU FFmpeg render worker (Python)
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
| **Cloudflare Workers AI** | FLUX.1 [schnell] image generation (slides + thumbnails) | API token + account ID |
| **Edge TTS** | Self-hosted TTS on EC2 (primary voiceover) | `EDGE_TTS_API_KEY` |
| **Fish Audio** | Alternate TTS (s2.1-pro-free, integrated but not active in pipeline) | `FISH_API_KEY` |
| **Cloudinary** | Asset CDN (images, audio, video, thumbnails; 7-day retention) | Per-channel API key/secret |
| **YouTube Data API v3** | Video upload + basic stats | OAuth2 per channel |
| **YouTube Analytics API v2** | Shorts metrics (views, swipe rate, traffic sources) | OAuth2 |
| **Inngest** | Pipeline orchestration, retries, cron, event-driven steps | Event key + signing key |
| **Modal** | Optional GPU-accelerated FFmpeg rendering (Python) | HTTP callback |
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

12 retries, 2-hour timeout. On failure, marks job as `failed`.

**Step 1 — Script Generation**
- Checks for incomplete existing job (crash recovery / resume).
- Otherwise calls `generateScript()` which: reserves topic atomically (`FOR UPDATE SKIP LOCKED`), picks format template probabilistically, calls DeepSeek with system prompt, validates against Zod schema, runs caption validation, scores via quality gate (retries up to 2× if below threshold).
- Creates `slideshow_jobs` row with status `script_ready`.

**Step 2 — Per-Shot Assets**
- Iterates each shot. Memoizes existing URLs from DB (resume skip).
- Runs image generation (Cloudflare FLUX) and TTS (Edge TTS) **in parallel** per shot.
- Burns caption onto image via `burnCaption()`.
- Uploads both to Cloudinary in parallel.
- Persists URLs immediately for crash recovery.

**Step 3 — Music Selection**
- DeepSeek picks best track from 3-track catalog based on title, niche, visual world.
- Uploads to Cloudinary.

**Step 4 — Video Rendering**
- Generates thumbnail (Cloudflare FLUX + SVG text overlay).
- If `MODAL_RENDER_URL` configured: sends render request to Modal GPU worker with callback URL. Waits up to 10min for `modal/render.complete` webhook.
- Falls back to local FFmpeg assembly if Modal unreachable or times out.

**Step 5 — Publish**
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

`lib/topicGenerator.ts` is the most complex module. Three LLM calls per script:

### Call 1: Script Writing (DeepSeek, temperature 0.7)

200+ line system prompt built by `getSystemPrompt()` covering:

- **Identity**: World-class scriptwriter for premium YouTube Shorts.
- **Tone mandate**: Niche-specific voice instructions.
- **Format instructions**: Template-specific narrative structure.
- **Specificity mandate**: Every sentence needs an exact anchor (number, date, name, amount). 20+ banned vague words.
- **Hook mechanics**: Shot 1 = cognitive dissonance in ≤8 words. Shot 2 = quantifiable stakes.
- **Fact verification**: Every claim must have `{claim, source}` entry.
- **Storytelling rules**: Emotional arc through facts, not adjectives. Spoken English. Definitive closure.
- **No CTAs**: "subscribe", "like", "comment", "follow", "link in bio", "thanks for watching" all banned.
- **Visual world mandate**: All shots share unified aesthetic.
- **Caption constraints**: Max 3 lines, 80 chars total, 26 chars/word, 12 words/shoot, punctuation on every shot.
- **Image prompt rules**: 7 required FLUX tag categories (Subject, Environment, Lighting, Camera, Color palette, Texture, Atmosphere). Comma-separated tags, not prose.
- **Output JSON schema**: Full annotated schema with field constraints.

Output validated against `SlideshowScriptSchema` (Zod) with 15+ rules including exactly one conclusion shot (must be last), hook_intro matching shot 1 start, fact_check entries ≥10 chars, tags lowercase hyphenated.

### Call 2: Quality Gate (DeepSeek, temperature 0.2)

`scoreScript()` evaluates across 7 dimensions (0–10):

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

### Call 3: Topic Generation (DeepSeek, temperature 0.9)

`generateTopics()` creates 20 fresh topics when pool is exhausted. Excludes last 50 used topics. Niche-specific quality criteria.

---

## Topic Reservation

`reserveTopic()` uses `FOR UPDATE SKIP LOCKED` to atomically claim the next unused topic. Prevents concurrent pipeline runs from claiming the same topic. On pipeline failure, `releaseTopic()` returns the topic to the pool.

Seed data: 80 hand-crafted topics (20 per niche) in `scripts/seed-topics.ts`.

---

## Image Generation

### Slides (Cloudflare Workers AI — FLUX.1 [schnell])

- Resolution: 576×1024
- Disk cache at `/tmp/cache/flux/{sha256}.jpg` keyed on prompt dims+steps.
- 3 retries with exponential backoff on 429/502/503/504.
- Each prompt prepended with aesthetic-specific `imagePrefix` (FLUX-optimized keyword tags).
- Negative terms per aesthetic (e.g., "text, watermark, logo, blurry, bright colors").

### Caption Burn (`lib/imageGenerator.ts`)

`burnCaption()` renders kinetic typography onto images via `@napi-rs/canvas`:

- Montserrat Bold 72px, word-wrapped to ≤26 chars/line.
- **Power word highlighting**: ~70 curated words get gold (#FFD700) at 1.3× scale with glow shadow. All-caps words ≥3 chars and words containing digits also highlighted.
- Dynamic scaling if text exceeds 960px safe zone (1080 − 120px margins).
- Output: PNG 1080×1920, quality 100.

### Thumbnails (`lib/thumbnailGenerator.ts`)

- Cloudflare FLUX at 1280×720 (8 steps for higher quality).
- SVG text overlay: white Arial Black with black stroke, gradient dark background at bottom 68%.
- Max 3 title lines.

---

## TTS (Text-to-Speech)

### Primary: Edge TTS (self-hosted on EC2)

`lib/edgeTts.ts` → `POST {EDGE_TTS_URL}/v1/audio/speech` with voice, input text, mp3 format. 3 retries with backoff.

| Niche | Voice |
|---|---|
| SaaS & AI Tools | en-US-AriaNeural (female) |
| Financial Forensics | en-US-GuyNeural (male) |
| Stoic Philosophy | en-US-ChristopherNeural (male) |
| Urban Survival | en-US-EricNeural (male) |

### Alternate: Fish Audio

`lib/fishAudio.ts` → `POST https://api.fish.audio/v1/tts` with reference voice ID, WAV format. Includes detailed "director notes" per niche describing delivery style in prose. WAV header validation. Inactive in current pipeline; imported but not called from `pipeline.ts`.

### Audio Director Tags

Optional per-shot annotations: `[serious]`, `[curious]`, `[urgent]`, `[measured]`, `[grave]`. Stripped before caption rendering.

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

## Video Assembly (`lib/videoAssembler.ts`)

All work in temp directory, cleaned up in finally block.

### Per-Shot Clip (`buildShotClip`)

- Still image + audio → MP4 via FFmpeg.
- Alternating Ken Burns zoom: even shots zoom in (1.0 → 1.12), odd shots zoom out (1.12 → 1.0), speed 0.0006 per frame.
- Video: libx264, CRF 23, preset medium, yuv420p.
- Audio: AAC 128k. `-shortest` to match audio duration.

### Clip Assembly (`assembleClips`)

- FFmpeg concat **filter** (not demuxer) for frame-accurate gapless audio.
- Hard cuts, zero crossfade ("MrBeast-style zero dead air").

### Audio Mixing (`mixBackgroundMusic`)

- Sidechain compression: music ducks when TTS speaks.
- Threshold −28 dBFS, ratio 4:1, attack 5ms, release 50ms.
- Music looped with `-stream_loop -1`, `-shortest`.
- Music volume: 0.35.

### Modal GPU Render Worker (`modal/render.py`)

Optional remote render. Python FastAPI service on Modal:

- Mirrors TypeScript assembler with identical constants.
- Multi-threaded asset download (10 workers).
- Receives raw PCM audio (s16le, 24000Hz, mono) instead of MP3.
- Uploads to Cloudinary using per-account secrets.
- POSTs callback to `callbackUrl` with `{ jobId, mp4Url }`.
- 600s timeout.

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

Inngest provides 12 retries with step-level memoization. On terminal failure, `onFailure` handler marks the job as `failed` with error message.

---

## Dashboard (`app/page.tsx`)

Server Component, ISR revalidation every 30 seconds.

- Stats row: Total Jobs, Uploaded, In Progress, Success Rate %.
- Jobs table: Topic, Status (color-coded pill), Account, Created (relative time), YouTube link.
- Status badges: green (uploaded), blue (assembled/assets ready), amber (generating), muted (pending), red (failed).
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
| `CLOUDFLARE_AI_API_TOKEN` | cloudflareAi.ts | Cloudflare Workers AI |
| `CLOUDFLARE_ACCOUNT_ID` | cloudflareAi.ts | Cloudflare account |
| `EDGE_TTS_URL` | constants.ts | Self-hosted Edge TTS (default localhost:5050) |
| `EDGE_TTS_API_KEY` | constants.ts | Edge TTS auth |
| `FISH_API_KEY` | fishAudio.ts | Fish Audio TTS |
| `INNGEST_EVENT_KEY` | trigger-prod.ts | Inngest Cloud (prod only) |
| `INNGEST_DEV` | client.ts | Inngest local dev mode |
| `CRON_SECRET` | cron/route.ts, retry/route.ts | Cron endpoint auth |
| `MODAL_RENDER_URL` | constants.ts | Modal GPU render (optional) |
| `YOUTUBE_API_KEY` | analyticsSync.ts | YouTube Data API v3 fallback |
| `ACCOUNT_ID` | constants.ts | Default channel ID |
