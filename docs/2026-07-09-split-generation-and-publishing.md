# Split Generation and Publishing into Separate Inngest Functions (Updated 3-Stage Architecture)

## Current Problem

The entire pipeline previously ran as a single monolithic Inngest function (`generateShort` / `generateLongForm`) with a **2-hour timeout**, and then was proposed to be split into two functions. However, the proposed split still left `generateShort` waiting for the Modal CPU render to complete via `step.waitForEvent`. This approach occupied Inngest concurrent execution slots, unnecessarily bloated timeout budgets, and caused a bug where video URLs weren't saved to the database when publishing was skipped.

## Proposed Architecture (Fully Decoupled 3-Stage Pipeline)

We split the workload completely to eliminate any long polling or idle wait times in Inngest.

```
Scheduler ──→ generateShort / generateLongForm (20m timeout)
                    │
                    ├─ Step 1: Script + GPU warmup
                    ├─ Step 2a: TTS narration
                    ├─ Step 2b: Images + BGM + thumbnail
                    ├─ Step 3: Submit render to Modal (attaches ?accountId=X&skipPublish=Y)
                    └─ FINISH (function exits immediately, zero wait time)

Modal Render (CPU) ──→ /api/webhooks/modal (Next.js API Route)
                           │
                           ├─ Updates DB: video_url, status='assembled'
                           └─ fires slideshow/publish (if !skipPublish & !error)
                                   │
                                   ▼
slideshow/publish ──→ publishVideo (30m timeout)
                           │
                           ├─ Download video + thumbnail
                           ├─ Upload to YouTube via API
                           ├─ Record in slideshow_uploads
                           ├─ Sync analytics
                           └─ Mark job as published
```

### Stage 1: `generateShort` / `generateLongForm`
- **Trigger**: `slideshow/trigger` / `slideshow/trigger-long`
- **Timeout**: `20m` (reduced from 2h)
- **Execution**: Generates script, TTS, images, and BGM. Submits to Modal and finishes immediately.

### Stage 2: Webhook (`/api/webhooks/modal`)
- **Execution**: Receives `jobId` and `mp4Url` from Modal. It also reads `accountId` and `skipPublish` from the callback URL query string.
- **Data Integrity**: Immediately saves the `video_url` to the database and sets `status = 'assembled'`. This fixes the bug where skipped publishing lost the video URL.
- **Routing**: Triggers `slideshow/publish` via Inngest if `skipPublish` is false.

### Stage 3: `publishVideo`
- **Trigger**: `slideshow/publish`
- **Timeout**: `30m`
- **Retries**: 3 (handles flaky YouTube API connections)
- **Execution**: Uploads to YouTube, syncs analytics, and marks the job as published.

## Benefits Over Previous Plans
1. **Zero Idle Time**: No Inngest steps are left sleeping for 30+ minutes while Modal renders CPU workloads.
2. **True Error Isolation**: If Modal crashes or times out, the webhook captures it and fails the job directly.
3. **Data Integrity**: Guarantees `video_url` is saved to the DB even if publishing is skipped (vital for local testing).
4. **Resiliency**: Dedicated retries purely for the YouTube upload phase, isolated from generation timeouts.

## Resume/Publish Scenario
If a job was generated but publishing failed or was skipped (e.g., dev mode), you can manually trigger publishing for assembled jobs:

```bash
npx inngest send 'slideshow/publish' --data '{"jobId": "<uuid>", "accountId": "<account>"}'
```
