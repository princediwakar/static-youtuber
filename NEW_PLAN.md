# AI Slideshow — Refined Execution Plan

**Status:** June 2026. The pipeline works end-to-end (script → batch → harvest → assemble → publish). What follows is the prioritized gap list to go from "functional" to "high-retention."

---

## Phase 1: Break the 6-Slide Lock

The single highest-leverage change. 10 seconds per static image is a retention death sentence in short-form.

### 1.1 Zod Schema Redesign (`lib/topicGenerator.ts`)

Replace the 6-slide array with a 12–18 shot array. Each shot is a micro-breath, not a paragraph.

```typescript
const ShotSchema = z.object({
  text: z.string().min(3).max(8, "Max 8 words per shot — staccato only"),
  image_prompt: z.string().min(30).max(600),
  audio_tag: z.string().min(3).max(20).optional(),
});

// slides: z.array(SlideSchema).length(6)  ← DELETE
// shots: z.array(ShotSchema).min(12).max(18)  ← REPLACE
```

- `GeminiScriptSchema` (the structured output schema) must mirror this — change `slides` array to `shots` with matching constraints.
- Bump `CAPTION_MAX_CHARS` if needed, but the 8-word limit per shot makes this mostly self-regulating.
- Update `SlideshowScript` type in `lib/types.ts`: `slides` → `shots`.

### 1.2 DB Migration

Add a `format_template` column to `slideshow_jobs`:

```sql
ALTER TABLE slideshow_jobs ADD COLUMN format_template VARCHAR(20);
-- Values: 'RAPID_FIRE', 'SLOW_BURN', 'THE_LIST'
```

No enum type needed — just a CHECK constraint or app-level enum.

### 1.3 Atomic Topic Locking (Hardening)

The current `pickUnusedTopic` uses `ORDER BY RANDOM()` without `SKIP LOCKED`. Under parallel execution, two Inngest runs can grab the same topic. Fix:

```sql
UPDATE slideshow_topics
SET used = TRUE, used_at = NOW()
WHERE id = (
  SELECT id FROM slideshow_topics
  WHERE niche = $1 AND account_id = $2 AND used = FALSE
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING topic;
```

Drop `ORDER BY RANDOM()` — it forces a full table scan. True randomness isn't needed here; any unused topic is fine.

---

## Phase 2: Prompt Engineering Rewrite

### 2.1 The Stakes Mandate (Tier 1 Hook)

Inject into the system prompt's "STORYTELLING MECHANICS" section:

> Shot 1 must present verifiable cognitive dissonance in ≤6 words. Shot 2 must instantly establish exact quantifiable stakes (dollars lost, lives affected, historical consequence). If the stakes are not established by the end of Shot 2, the script is a failure.

### 2.2 Format Templates

When a job is created, randomly assign one of three pacing templates. Pass the corresponding instruction into the Gemini system prompt:

| Template | Frequency | Shots | Instruction |
|---|---|---|---|
| `RAPID_FIRE` | 40% | 15–18 | Dense, relentless facts. No transition words. Every shot a new fact. |
| `SLOW_BURN` | 30% | 12 | Shots 1–3 ominous and contextual. Shots 9–12 escalate rapidly with hard facts. |
| `THE_LIST` | 30% | 15 | 5 numbered items, 3 visual angles each. Structured escalation. |

Store the assigned template on the job record for analytics attribution.

### 2.3 Quality Gate Update

In `scoreScript()`, replace `spoken_rhythm` with two new criteria:

- **Information Density (0–10):** Is every shot delivering a new, verifiable fact? Zero filler shots.
- **Visual Entropy (0–10):** Are the image prompts distinct enough from one another to prevent visual fatigue? No two shots should look like the same image.

The `spoken_rhythm` concern is now enforced structurally by the 8-word Zod limit — no need for an LLM to judge it.

---

## Phase 3: Post-Production Upgrades

### 3.1 Audio Ducking (Sidechain Compression)

Current: flat `MUSIC_VOLUME` (0.35). Music competes with TTS during loud passages.

Replace the `mixBackgroundMusic` FFmpeg filter in `lib/videoAssembler.ts`:

```bash
-filter_complex "[1:a]asplit[mus1][mus2];[0:a][mus1]sidechaincompress=threshold=0.04:ratio=4:attack=5:release=50[spoken_ducked];[spoken_ducked][mus2]amix=inputs=2:duration=first:dropout_transition=2"
```

Input 0 = assembled TTS audio, Input 1 = background music track. The music automatically dips when speech is active and swells in the micro-pauses.

### 3.2 Typography Safe Zone

Current: `CAPTION_Y_POSITION = 0.72` (72% from top). This places text too close to the YouTube Shorts like/comment/share overlay zone.

Change `CAPTION_Y_POSITION` in `lib/constants.ts` to `0.65`. Test against a mobile screenshot of the YouTube Shorts UI to confirm zero overlap with interactive elements.

### 3.3 Ken Burns Speed Tuning

Current `ZOOMPAN_SPEED = 0.0012` was tuned for ~10-second slides. With 12–18 shots averaging 3–5 seconds each, the zoom needs to be subtler. Reduce to `0.0006` to prevent disorienting motion at high cut rates.

---

## Phase 4: Pipeline Hardening

### 4.1 Modal Webhook Integration

Current code has a Modal URL path with a Vercel-local fallback. The Modal path is a fire-and-forget HTTP POST — no retry, no webhook listener.

Build the receiving end:
- `POST /api/webhooks/modal` — accepts `{ jobId, mp4Url }`, triggers an Inngest event (`slideshow/video.rendered`).
- In the pipeline, after sending to Modal, use `step.waitForEvent("slideshow/video.rendered", { timeout: "10m" })` instead of the current fire-and-forget.
- On timeout, fall back to local assembly.

### 4.2 Asset Harvest Resilience

Current: sequential `for` loop over slides to harvest + caption. If slide 14 fails, slides 1–13 are re-downloaded on retry.

Wrap each slide's harvest+upload in its own `step.run()` so Inngest memoizes successful steps. On retry, only the failed slide re-runs. This requires restructuring the harvest step into N individual steps (or a fan-out pattern).

### 4.3 Remove `ORDER BY RANDOM()` in Topic Picker

Already covered in 1.3 — but worth flagging as a performance issue independent of the rest. `ORDER BY RANDOM()` on a growing topic pool will degrade linearly.

---

