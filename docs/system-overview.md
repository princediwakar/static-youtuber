# AI Slideshow — System Overview

An automated pipeline that turns a topic into a fully published YouTube video — with no
human intervention. It runs multiple channels (accounts), each locked to a niche and
visual style, producing Shorts (vertical, ~60s) several times a day and long-form
videos (landscape, ~3–4 min) daily.

## Architecture

- **Next.js (Vercel)** — hosts the pipeline logic, dashboard, and webhook endpoints
- **Inngest** — event-driven job orchestrator (scheduling, retries, timeouts)
- **Neon (Postgres)** — source of truth: job state, topic pool, upload records, credentials
- **Modal (GPU)** — LLM (vLLM), voice cloning (F5-TTS), music (ACE-Step), video rendering (Whisper + FFmpeg)
- **Cloudflare AI** — generates slide images and thumbnails (FLUX)
- **Cloudinary** — stores all media (images, audio, music, final MP4s)
- **YouTube Data API** — uploads videos/thumbnails and reads back analytics

## End-to-end flow

**1. Trigger** — Videos start via cron schedulers, a manual CLI (`npm run trigger:prod`),
or the retry API. The cron schedulers (all UTC, defined in `inngest/pipeline.ts`):

| Cron function | Schedule (UTC) | Purpose |
|---|---|---|
| `channelScheduler` | 15:00, 17:00, 19:00, 21:00 daily | Shorts — triggers one eligible account per run (16h cooldown) |
| `longFormScheduler` | 11:00 daily | Long-form — triggers each account with no long-form job in 48h |
| `syncAnalyticsCron` | 05:00 daily | Pulls YouTube analytics for the feedback loop |

**2. Script** — The pipeline creates a job row, reserves the next unused topic from
the pool, picks a format template (an epsilon-greedy "bandit" using real retention
data), then has the LLM write a story and chunk it into shots — each with a visual
prompt, on-screen caption, and spoken text. Scripts must pass schema, caption, and
LLM quality-gate checks (up to 5 attempts).

> **Topic pool is pre-seeded** — the pipeline never creates new topics itself. It
> needs a curated list in `slideshow_topics` (seeded via `scripts/seed-topics.ts` /
> `seed-seo-topics.ts`); when the pool is exhausted, `reserveTopic` fails the job.
> There is no way to fully automate this — auto-generated topics hallucinate facts
> in their research context, producing scripts that fail the quality gate.

**3. Assets** — In parallel: narration (F5-TTS voice clone), slide images (Cloudflare
FLUX, one per shot), a thumbnail (FLUX + text overlay), and background music
(ACE-Step). Everything is uploaded to Cloudinary.

**4. Render** — A Modal container downloads the assets, runs Whisper over the
narration to align each shot's caption to its spoken words, renders each shot as a
Ken Burns zoom, burns in captions, and mixes voice + ducked background music. The
finished MP4 is uploaded to Cloudinary and a webhook marks the job `assembled`.

**5. Publish** — The video and thumbnail are uploaded to YouTube (unlisted, with SEO
title/description/tags). The job becomes `published` and intermediate Cloudinary
assets are cleaned up.

**6. Feedback loop** — A daily cron pulls YouTube analytics (views, view-duration,
traffic sources) back into the topic pool, which feeds the format-selection bandit
for future videos.

## Key files

| File | Purpose |
|---|---|
| `inngest/pipeline.ts` | All pipeline functions (generate, publish, schedulers) |
| `lib/generators/` | LLM script generation + quality gates |
| `lib/cloudflareAi.ts`, `lib/audioEngine.ts`, `lib/musicSelector.ts`, `lib/thumbnailGenerator.ts` | Asset generation |
| `lib/cloudinary.ts`, `lib/youtubeUpload.ts`, `lib/analyticsSync.ts` | Storage, publishing, analytics |
| `modal/render.py`, `modal/tts.py`, `modal/bgm.py`, `modal/llm.py` | GPU-side rendering, TTS, music, LLM |
| `app/api/webhooks/modal/route.ts` | Render-complete callback |
| `database/schema.sql` | `slideshow_jobs`, `slideshow_topics`, `slideshow_uploads`, `accounts` |

## Reliability

Each pipeline step runs as a separate Inngest step, so failures retry only that step.
Steps re-check the DB and skip already-completed work (resume capability). Failures
mark the job `failed`, store the error, and clean up Cloudinary assets. Hard errors
(validation, quality gate) fail fast without retries.
