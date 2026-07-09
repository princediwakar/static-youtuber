# Animation-like Slide Continuity Plan

## Goal
Make slides feel like frames of one continuous animated scene instead of a random collection of unrelated images.

---

## 1. Visual Prompt Continuity (`lib/topicGenerator.ts`)

**What changes:** The system prompts in `chunkScriptToJSON()` and `chunkLongFormScriptToJSON()` get a new "VISUAL TRANSITION RULE" section added to the existing visual aesthetic block.

**How it works:**
- Shot 1 establishes the scene with a full description
- Every subsequent shot says "Same scene as the previous shot, but describe the one change" — e.g. camera pan, zoom, a new element entering frame, lighting shift, character movement, or focus change
- The LLM writes each prompt as an evolution of the previous one, not a brand-new unrelated scene
- This makes FLUX generate images with composition/color/mood continuity

**Files to modify:**
- `lib/topicGenerator.ts` — add the rule to both shorts and long-form system prompts (~lines 251-258 and ~lines 636-643)

---

## 2. FFmpeg Xfade Transitions (`modal/render.py`)

**What:** Replace the hard-cut concat with crossfade transitions between shots.

**How it works:**
- First shot plays fully
- Each subsequent shot crossfades in over 0.3s overlap with the previous shot's tail
- Use FFmpeg's `xfade` filter instead of concat demuxer
- Requires re-encoding (no `-c copy`), but only the transition windows are re-encoded — fast enough for 30-60 shot shorts

**Implementation details:**
- Remove the `concat` demuxer step (lines 469-478)
- Build an `xfade` filter graph: `[0:v][1:v]xfade=transition=fade:duration=0.3:offset={offset}[v01];[v01][2:v]xfade=...`
- Offset = cumulative duration of previous shots minus 0.3s overlap
- Pass the result directly into the caption-ASS filter step

**Files to modify:**
- `modal/render.py` — replace the concat block (~line 469-478) with xfade filter graph logic

---

## What Doesn't Change

| Component | Status |
|---|---|
| Script generation (2-pass LLM) | Same — only prompt text added |
| Asset fetching (images, audio, BGM) | Unchanged |
| Shot timing / shot_boundaries | Unchanged |
| Caption ASS construction | Unchanged |
| Audio mixing + ducking | Unchanged |
| Cloudinary upload | Unchanged |
| Pipeline orchestration (Inngest) | Unchanged |

## Risk

- **Visual continuity depends on the LLM following the new instruction.** If the LLM ignores it and writes independent prompts, images won't have continuity. The quality gate's `visual_coherence` dimension should catch this — the scorer will see prompts that jump between unrelated scenes and score them low.
- **Xfade adds ~1-2s of render time.** Negligible for 30s shorts on Modal's 8-CPU container.