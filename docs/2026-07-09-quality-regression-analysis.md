# Quality Regression — July 2026

## Symptoms
- **Vercel timeouts** (function killed mid-pipeline)
- **Discontinuous / choppy TTS voice** in output videos
- **Music length misaligned** with narration (cuts off early or plays past end)

## Root Causes

### 1. `maxDuration` dropped from 300s → 60s

**Commits:** `87bd86c` (300→300 — no-op for Hobby), then `9450c1f` (300→60).

| File | Line | Current |
|---|---|---|
| `app/api/inngest/route.ts` | 25 | `export const maxDuration = 60;` |
| `vercel.json` | 4 | `"maxDuration": 60` |

Vercel Hobby plan max is 300s (`vercel.com/docs/functions/configuring-functions/duration`). The pipeline now has many sequential `step.run()` calls (audio batches, image batches) — each requires an HTTP round-trip through the Inngest serve handler. A 60s ceiling kills the outer function before all steps finish. 300 is the correct Hobby limit.

**Fix:** Revert both to `300`.

### 2. `narrationDurationMs` metadata dropped during refactor

**Commit:** `2cdd3cb` — extracted `executeAssetPipeline` helper.

The old code collected actual TTS durations from every shot and summed them:
```
// old code that was removed:
const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
```

The new helper discards this and instead passes a word-count estimate to `selectMusicTrack`:
```
const estimatedDurationSec = Math.ceil(totalWords / 2.5) + 10;
```

This means the BGM length is a guess, not the real narration length.

### 3. `selectMusicTrack` lost `visual_world` and `narrationText`

**Commit:** `2cdd3cb`

Before:
```
selectMusicTrack(script.title, niche, format_template, script.visual_world, narrationText, narrationDurationSec)
```

After:
```
selectMusicTrack(script.title, niche, format_template as FormatTemplate, duration)
```

Music selection now has no semantic context (no `visual_world`, no `narrationText` — previously used to match music mood to content).

### 4. Ducking filter restructured

**Commit:** `c916e15` — `modal/render.py`

Old filter chain:
```
[0:a]volume=1.5[voice_boost];
[1:a]volume=0.3[bg_vol];
[bg_vol][voice_boost]sidechaincompress=threshold=-22dB:ratio=4:attack=5:release=50[bg_ducked];
[voice_boost][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2:weights=2 1[mix];
[mix]volume=2.0[aout]
```

New filter chain:
```
[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.5,asplit=2[voice_sc][voice_mix];
[voice_mix]volume=2.0[voice_mix_boost];
[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.3[bg_vol];
[bg_vol][voice_sc]sidechaincompress=threshold=-22dB:ratio=4:attack=5:release=50[bg_ducked];
[voice_mix_boost][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[mix];
[mix]volume=2.0[aout]
```

Key differences:
- Forces `aformat` resampling on all inputs (potential quality loss)
- Uses `asplit` to split voice into two branches instead of reusing the same stream
- Removed `weights=2 1` from `amix` — old mix explicitly gave voice 2x weight; new mix relies on pre-mix `volume=2.0` boost on a split copy of the voice instead
- The `dropout_transition=2` without explicit weights may produce different transient behavior

This is the most likely cause of the **choppy / discontinuous voice**.