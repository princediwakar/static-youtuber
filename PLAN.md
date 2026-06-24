# ai-slideshow — Final Implementation Plan

## What We're Building

A new repo that produces automated @well.4-style narrated slideshow YouTube Shorts:
- **Niche:** Psychology facts ("Why your brain replays embarrassing memories", "The psychology of FOMO")
- **Format:** 7–9 image slides, each read aloud by a calm narrator voice
- **Cadence:** 1–2 videos/day, fully automated
- **Infrastructure:** Reuses the existing Neon DB (same `accounts` table, same encryption key)

---

## Architecture: Inngest solves the 30s timeout

```
cron-job.org (daily at 07:00 IST)
    │
    ▼  POST /api/cron  ← returns 202 in < 50ms
    
Inngest (free: 50k runs/month)
    │  orchestrates 6 steps, each is a separate Vercel invocation
    │
    ├─ step 1: generate-script   (~5s)   DeepSeek → JSON
    ├─ step 2: generate-images   (~40s)  Gemini Imagen 3 × 8, parallel
    ├─ step 3: generate-tts      (~25s)  Gemini 2.5 Pro TTS × 8, parallel
    ├─ step 4: assemble-video    (~90s)  FFmpeg high-quality encode
    ├─ step 5: gen-thumbnail     (~10s)  Imagen 3 + sharp text overlay
    └─ step 6: upload-youtube    (~30s)  YouTube Data API v3 + thumbnail

Neon DB (existing, same credentials)
    ├── accounts        [EXISTING — reused as-is]
    ├── slideshow_jobs  [NEW — job state per video]
    ├── slideshow_topics [NEW — topic pool + dedup]
    └── slideshow_uploads [NEW — YouTube video records]

Cloudinary (existing credentials from accounts table)
    └── slideshow/{job_id}/slide-{n}.png  (auto-expire: 7 days)
    └── slideshow/{job_id}/audio-{n}.wav  (auto-expire: 7 days)
```

### Why each step stays under Vercel's timeout

| Step | What it does | Est. time | Timeout budget |
|---|---|---|---|
| generate-script | 1 DeepSeek API call | ~5s | 30s |
| generate-images | 8 Imagen 3 calls (parallel, concurrency=3) | ~40s | 120s |
| generate-tts | 8 Gemini TTS calls (parallel, concurrency=4) | ~25s | 60s |
| assemble-video | FFmpeg: download assets + encode | ~90s | 300s |
| gen-thumbnail | 1 Imagen 3 + sharp overlay | ~10s | 30s |
| upload-youtube | YouTube insert + thumbnail set | ~30s | 60s |

`assemble-video` gets its own Vercel function config with `maxDuration: 300`.

> [!NOTE]
> Inngest calls your functions via a normal HTTP POST, **not** a Vercel cron invocation. This means it bypasses Vercel's 10-second cron limit and gets the full configured `maxDuration` per route. This is the architectural key that makes everything work.

---

## Quality Settings

| Asset | Model / Tool | Config |
|---|---|---|
| Script | DeepSeek `deepseek-chat` | Structured JSON output, zod validation |
| Slide images | Gemini Imagen 3 `imagen-3.0-generate-002` | `aspectRatio: "9:16"`, `sharp` resize → 1080×1920 |
| Voiceover | Gemini 2.5 Pro TTS `gemini-2.5-pro-tts` | Voice: `Charon` (deep, calm, authoritative) |
| Video | FFmpeg `libx264` | `-crf 18 -preset slow -pix_fmt yuv420p` |
| Audio | FFmpeg `aac` | `-b:a 192k`, per-slide sync (not background loop) |
| Thumbnail | Imagen 3 + `sharp` | 1280×720, title text overlay, high contrast |

---

## Reuse of Existing Infrastructure

| Existing piece | How it's reused |
|---|---|
| `accounts` table | Queried identically — `getAccount(accountId)` with same AES-256-GCM decryption using `NEXTAUTH_SECRET` |
| `accountService.ts` logic | Copied into new repo with minor rename |
| `youtubeUpload.ts` | Copied verbatim — no changes |
| Cloudinary credentials | Decrypted from `accounts` table row, same pattern |
| `NEXTAUTH_SECRET` | Same env var in new Vercel project (must match to decrypt credentials) |
| Neon connection string | Same `DATABASE_URL` |

**Which account ID to use for the slideshow?** The existing `english_shots` account has YouTube OAuth credentials stored. We add `"psychology_shorts"` to its `personas` array, or create a dedicated `psychology_shots` account row — your call. The code works either way since account lookup is by ID.

---

## New Repo File Structure

```
ai-slideshow/
├── app/
│   ├── api/
│   │   ├── cron/route.ts              ← POST from cron-job.org → triggers Inngest event
│   │   └── inngest/route.ts           ← Inngest SDK serve() handler
│   ├── page.tsx                       ← Dashboard: recent jobs, status, YouTube links
│   └── layout.tsx
│
├── inngest/
│   ├── client.ts                      ← Inngest client singleton
│   └── pipeline.ts                    ← The 6-step pipeline function
│
├── lib/
│   ├── topicGenerator.ts              ← DeepSeek call → SlideshowScript JSON
│   ├── imageGenerator.ts             ← Gemini Imagen 3 × N slides → Cloudinary URLs
│   ├── ttsGenerator.ts               ← Gemini 2.5 Pro TTS × N slides → Cloudinary URLs
│   ├── videoAssembler.ts             ← FFmpeg: sync images + per-slide audio → MP4
│   ├── thumbnailGenerator.ts         ← Imagen 3 + sharp text overlay → Buffer
│   ├── youtubeUpload.ts              ← YouTube Data API v3 (copied from existing repo)
│   ├── cloudinary.ts                 ← Upload helpers (adapted from existing repo)
│   ├── accountService.ts             ← Account decryption (copied from existing repo)
│   ├── database.ts                   ← Neon pool + query helper
│   └── types.ts                      ← SlideshowScript, Slide, SlideshowJob interfaces
│
├── database/
│   └── schema.sql                    ← 3 new tables (accounts table already exists)
│
├── topics/
│   └── psychology.json               ← 150 seed topics, {topic, used: false}
│
├── .env.local
├── vercel.json
├── package.json
└── next.config.js
```

---

## Key Implementation Details

### Topic Pool + Deduplication
Topics stored in `slideshow_topics` table:
```sql
CREATE TABLE slideshow_topics (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  niche TEXT NOT NULL DEFAULT 'psychology'
);
```
`topicGenerator.ts` picks a random unused topic → marks it `used = true` atomically.

### DeepSeek System Prompt (Psychology Niche)
```
You are a scriptwriter for a calm, educational YouTube Shorts channel about psychology.
Output ONLY valid JSON. No markdown. No explanation. No code fences.

Schema: {
  "title": "string (max 60 chars, punchy, curiosity-driven)",
  "description": "string (2 sentences + 5 hashtags)",
  "tags": ["string"] (8 tags),
  "slides": [{ "text": "string", "image_prompt": "string" }] (7-9 slides),
  "thumbnailPrompt": "string"
}

Rules:
- Each slide text: ≤ 18 words, factual, conversational, ends naturally for speech
- First slide: hook that creates immediate curiosity
- image_prompt: "flat illustration, clean minimal style, dark navy background, 
  [subject], no text, muted palette, professional"
- title: starts with a number OR a question OR "Why" / "How"
- tags: mix of broad (#psychology #facts) and specific (#mentalhealth #brainfacts)
```

### FFmpeg Per-Slide Audio Sync

Unlike the existing quiz system (random background loop), each slide gets its own TTS clip. FFmpeg chains them:
```
[slide_0.png][audio_0.wav] → clip0.mp4 (duration = audio_0 length)
[slide_1.png][audio_1.wav] → clip1.mp4
...
concat all clips → final.mp4
```

This gives perfect audio-visual sync — no guessing at durations.

### Gemini TTS → WAV conversion
Gemini TTS returns raw PCM (16-bit, 24kHz). We prepend a 44-byte WAV header in-memory before writing to Cloudinary. No external library needed — standard Buffer manipulation.

### Cloudinary as Handoff Storage
Inngest cannot pass large payloads between steps (512 KB limit). Images (~500 KB each × 8 = ~4 MB) exceed this. Strategy: step 2 uploads images to Cloudinary → passes back array of URLs → step 3 downloads by URL. All Cloudinary assets tagged `auto_delete_after_7_days` to prevent storage bloat.

---

## Database Schema (3 new tables)

```sql
-- Track individual video generation runs
CREATE TABLE slideshow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'psychology',
  status TEXT NOT NULL, -- pending | generating | images_done | tts_done | assembled | uploaded | failed
  inngest_run_id TEXT,
  script JSONB,          -- full DeepSeek output
  slide_image_urls JSONB, -- Cloudinary URLs for slides
  slide_audio_urls JSONB, -- Cloudinary URLs for TTS clips
  video_url TEXT,         -- Cloudinary MP4 URL
  thumbnail_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topic pool with deduplication
CREATE TABLE slideshow_topics (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  niche TEXT NOT NULL DEFAULT 'psychology',
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

-- YouTube upload records
CREATE TABLE slideshow_uploads (
  id SERIAL PRIMARY KEY,
  job_id UUID REFERENCES slideshow_jobs(id),
  youtube_video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  tags JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Environment Variables (New Repo)

```env
# Same as existing repo (CRITICAL: must match for credential decryption)
DATABASE_URL=                     # Same Neon connection string
NEXTAUTH_SECRET=                  # MUST be identical to existing repo — used to decrypt accounts table

# New
INNGEST_EVENT_KEY=                # From Inngest dashboard
INNGEST_SIGNING_KEY=              # From Inngest dashboard
GEMINI_API_KEY=                   # For Imagen 3 + TTS
DEEPSEEK_API_KEY=                 # Same key from existing repo
CRON_SECRET=                      # For cron-job.org auth header
ACCOUNT_ID=psychology_shots       # Which account row to use from DB

# Optional
DEBUG_MODE=false                  # If true, saves MP4 locally
```

> [!IMPORTANT]
> `NEXTAUTH_SECRET` **must be the exact same value** as in the existing `ai-youtuber` project — the credentials in the `accounts` table are encrypted with this key. If you use a different value, decryption will throw and the pipeline will fail on the very first step.

---

## Inngest Pipeline (Pseudocode)

```typescript
// inngest/pipeline.ts
export const slideshowPipeline = inngest.createFunction(
  { id: "slideshow-pipeline", retries: 2 },
  { event: "slideshow/generate" },
  async ({ event, step }) => {
    
    const script = await step.run("generate-script", async () => {
      const topic = await pickUnusedTopic();
      return topicGenerator.generate(topic);  // DeepSeek call
    });

    const imageUrls = await step.run("generate-images", async () => {
      return imageGenerator.generate(script.slides); // Imagen 3 × N
    });

    const audioUrls = await step.run("generate-tts", async () => {
      return ttsGenerator.generate(script.slides);   // TTS × N
    });

    const videoUrl = await step.run("assemble-video", async () => {
      return videoAssembler.assemble(imageUrls, audioUrls, script); // FFmpeg
    });

    const thumbnailUrl = await step.run("gen-thumbnail", async () => {
      return thumbnailGenerator.generate(script.title, script.thumbnailPrompt);
    });

    await step.run("upload-youtube", async () => {
      return youtubeUpload.upload(videoUrl, thumbnailUrl, script, accountId);
    });
  }
);
```

If step 3 (TTS) fails due to a rate limit, Inngest retries **only step 3**. Steps 1 and 2 are not repeated.

---

## cron-job.org Setup

| Field | Value |
|---|---|
| URL | `https://your-new-app.vercel.app/api/cron` |
| Method | POST |
| Header | `Authorization: Bearer <CRON_SECRET>` |
| Schedule | Daily at 07:00 IST (01:30 UTC) |
| Timeout | 30s (fine — route returns 202 in < 50ms) |

For 2 videos/day, add a second job at 19:00 IST.

---

## Cost Summary

| Item | Cost |
|---|---|
| DeepSeek script | ~$0.001 |
| Gemini Imagen 3 × 9 images | ~$0.09 |
| Gemini 2.5 Pro TTS × 8 clips | ~$0.02 |
| Inngest orchestration | Free (50k runs/mo) |
| Vercel hosting | Free (Hobby) |
| Neon DB | Free (shared with existing repo) |
| **Total per video** | **~$0.11** |
| **2 videos/day × 30 days** | **~$6.60/month** |

---

## Verification Plan

1. **Unit test** `topicGenerator.ts` locally with mocked DeepSeek response
2. **Dry-run** Inngest pipeline in dev mode (Inngest Dev Server) — runs locally, full trace
3. **Single video test** by calling `/api/cron` manually with curl
4. **Debug save** first MP4 to local disk before enabling YouTube upload
5. **Cron-job.org test** — hit the endpoint, verify it returns 202 immediately, verify Inngest dashboard shows the run progressing

