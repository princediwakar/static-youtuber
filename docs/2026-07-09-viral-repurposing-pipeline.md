# Geo-Arbitrage Reaction Pipeline

**Date**: 2026-07-09
**Status**: Planned

## Overview

A new Inngest pipeline that discovers trending/viral shorts from foreign markets (Hindi, Chinese, Spanish, Nigerian),
mutes or ducks the original audio, and adds localized, highly engaging English reaction commentary with F5-TTS. This combines the untapped visuals of geo-arbitrage with the universally engaging reaction format.

---

## Architecture

```
[Inngest] fetch-trending ──→ create-job
    │
    ▼
[Modal] download-youtube ── yt-dlp ──→ Cloudinary
    │
    ▼
[Modal] analyze-video ──── yt-dlp (download source)
                        ──── ffmpeg (extract 1 fps frames + audio)
                        ──── Whisper (transcribe audio)
                        ──── Qwen2.5-VL Vision (frames + transcript → JSON script)
    │
    ▼
[F5-TTS] generate-tts ──── per-segment voiceover
    │
    ▼
[Modal] repurpose-render ── mute source + overlay commentary + BGM + captions
    │
    ▼
[Inngest] publish ──────── YouTube upload (dedicated channel)
```

## Key Design Decisions

- **Foreign Discovery** — `fetchTrendingShorts` rotates between targeted foreign languages and regions (e.g., Hindi, Chinese, Spanish, Nigerian) to find viral visual concepts unseen by English audiences.
- **Visual Reaction vs Translation** — Instead of trying to accurately dub foreign speech, Qwen2.5-VL simply acts as an English reactor watching the video. It responds to the *visual events*, bypassing complex translation and lip-sync issues.
- **Strict Qwen2.5-VL Quality Gate (No Captions)** — The vision model explicitly checks frames across the video to ensure there are *no dynamic subtitles or spoken-word captions at all*. It must be raw footage (a few pieces of static text are acceptable). If captions are detected, the video is aggressively rejected to ensure our English reaction looks perfectly clean.
- **Qwen2.5-VL-7B inside Modal** — Extracted frames are passed directly to the self-hosted model via vLLM (version 0.6.4+) in Python to avoid massive Inngest payload limits.
- **All video processing in Modal** — ffmpeg and yt-dlp live there, serverless GPU for Whisper
- **Separate Modal apps** — `repurpose-analyze` (GPU) and `repurpose-render` (CPU/GPU) to cleanly isolate dependencies.

---

## File-by-File Plan

### Create

#### 1. `database/schema.sql` — migration

```sql
CREATE TABLE IF NOT EXISTS repurpose_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_video_id TEXT NOT NULL,
  source_channel_id TEXT,
  source_channel_title TEXT,
  source_video_title TEXT,
  source_views INTEGER DEFAULT 0,
  source_transcript TEXT,
  commentary_script JSONB,
  commentary_audio_urls JSONB,
  music_url TEXT,
  downloaded_video_url TEXT,
  final_video_url TEXT,
  thumbnail_url TEXT,
  youtube_video_id TEXT,
  error_message TEXT,
  inngest_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repurpose_used_videos (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 2. `lib/repurposeTypes.ts`

```ts
export interface CommentatorSegment {
  text: string;
  pauseAfter: number;
}

export interface RepurposeCommentaryScript {
  title: string;
  description: string;
  segments: CommentatorSegment[];
  tags: string[];
  voiceName: string;
}

export type RepurposeJobStatus =
  | 'pending' | 'fetched' | 'downloaded'
  | 'analyzed' | 'tts_ready' | 'assets_ready'
  | 'assembled' | 'published' | 'failed';
```

#### 3. `lib/videoDiscovery.ts`

- `fetchTrendingShorts(minViews: number, apiKey: string)`:
  - Rotates through foreign target queries (e.g., `q="हिंदी #shorts"`, `q="español #shorts"`, `q="douyin #shorts"`, `q="nigeria #shorts"`).
  - Can also use YouTube API's `regionCode` parameter (e.g., `IN`, `MX`, `ES`, `NG`, `TW`).
  - Calls `search.list?part=snippet&q=${FOREIGN_QUERY}&regionCode=${REGION}&type=video&videoDuration=short&order=viewCount&maxResults=50`
  - Safely falls back if order=viewCount isn't yielding fresh shorts, or filters the search results.
  - Calls `videos.list?id=...&part=statistics,contentDetails` on the batched search results to get exact views and duration.
  - Filters for `statistics.viewCount >= minViews`
  - Cross-references `repurpose_used_videos` for dedup
  - Sorts by views descending, returns top unused video
- Returns `{ videoId, title, channelId, channelTitle, viewCount }`

#### 4. `modal/repurpose_analyze.py` (New Modal App)

- **`analyze_video(youtube_url: str)`**:
  - Runs `yt-dlp` to download the short to a temporary file.
  - Runs `ffmpeg` to extract frames at 1 fps into memory (base64 encoded JPEGs or directly as images).
  - Runs `whisper-timestamped` on the audio stream to generate the source transcript.
  - Calls self-hosted `Qwen/Qwen2.5-VL-7B-Instruct` model directly from Python (using vLLM) with the frames and transcript.
  - Parses the JSON response into `RepurposeCommentaryScript`.
  - Uploads the source video to Cloudinary (since it's already downloaded) and returns `{ script, source_video_url }`.

#### 5. `lib/repurposePrompts.ts`

- **System prompt** — "You are a charismatic American reactor. Look at the frames from this foreign viral video. Write a highly engaging reaction script responding to the crazy/interesting visual moments you see. Do not translate the video, just react to the events."
- **JSON schema** — defines the segmented reaction output format + `has_captions: boolean`.
- Instructions for timing, tone, natural pauses, and strictly rejecting videos that have dynamic subtitles or spoken-word text on screen.

#### 6. `modal/repurpose_render.py`

Two functions under `modal.App("repurpose-render")`:

- **`download_youtube_video`**: (Removed, handled internally by `analyze_video` to prevent double-downloading)

- **`render_repurposed_video(job_id, account_id, source_video_url, commentary_audio_urls, segment_durations, pause_after, music_url, commentary_texts, caption_style, callback_url)`**:
  1. Download source video → extract video stream (drop audio)
  2. Download all commentary TTS segments
  3. Build audio timeline via ffmpeg concat: `[seg1] [silence1] [seg2] [silence2] ...`
  4. Compute segment start times for caption ASS rendering.
  5. Add BGM, keeping the original audio ducked to 10% (retaining environmental sounds but pushing foreign speech into the background).
  6. Mix video + audio
  7. Upload to Cloudinary → callback

#### 7. `inngest/repurposePipeline.ts`

```ts
export const repurposeShort = inngest.createFunction({ id: 'repurpose-short' }, ...)

Steps:
1. fetch-trending   — YouTube API → discover viral short
2. create-job       — INSERT repurpose_jobs
3. analyze-video    — Modal: yt-dlp download + Whisper + Qwen2.5-VL → returns Script + Cloudinary URL
5. generate-tts     — F5-TTS per segment → Cloudinary
6. select-music     — ACE-Step BGM
7. render           — Modal: repurpose_render
8. publish          — YouTube upload + mark used
```

#### 8. `scripts/trigger-repurpose.ts`

Like `scripts/trigger.ts` but sends event `repurpose/trigger`.

### Modify

| File | Change |
|---|---|
| `lib/database.ts` | Add `db.getRepurposeJob`, `db.createRepurposeJob`, `db.updateRepurposeJob`, `isVideoUsed()`, `markVideoUsed()` |
| `lib/cloudinary.ts` | Add `uploadCommentaryAudio()`, `uploadSourceVideo()` |
| `lib/constants.ts` | Add `REPURPOSE_ACCOUNT_ID`, `REPURPOSE_MIN_VIEWS`, `TARGET_REGIONS`; add `geo_dub` to `ACCOUNT_NICHE` |
| `app/api/inngest/route.ts` | Import + register `repurposeShort` |
| `.env.example` | Add `REPURPOSE_ACCOUNT_ID`, `REPURPOSE_MIN_VIEWS`, `YOUTUBE_API_KEY` |

---

## Env Vars (new)

| Variable | Purpose |
|---|---|
| `REPURPOSE_ACCOUNT_ID` | Dedicated channel account ID |
| `REPURPOSE_MIN_VIEWS` | Viral threshold (default: `10000000`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (may already exist) |

## Cost Estimate

| Component | Per video | Per 1K videos |
|---|---|---|
| Qwen2.5-VL-7B Modal GPU (inference) | ~$0.015 | ~$15 |
| Modal GPU (download + Whisper + render) | ~$0.005 | ~$5 |
| F5-TTS + ACE-Step BGM | ~$0.003 | ~$3 |
| **Total** | **~$0.016** | **~$16** |

## Implementation Order

1. DB migration (schema change)
2. Types + DB helpers + Cloudinary helpers
3. Video discovery (YouTube search API)
4. Modal: repurpose_analyze.py (yt-dlp, Whisper, Qwen2.5-VL via vLLM)
5. Modal: repurpose_render.py
6. Inngest pipeline
7. Register in route
8. Trigger script
9. Deploy Modal + test
