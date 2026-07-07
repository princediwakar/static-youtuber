# 2026 Shorts Algorithm — Implementation Plan

## Overview

8 zero-cost changes mapped to the codebase, prompted by the 2026 YouTube Shorts algorithm shift from swipe-rate to watch-time-per-impression + satisfaction, with a new 30-45s sweet spot and search carousel visibility.

---

## Change 1: Tighten hook + payoff contract

**File:** `lib/topicGenerator.ts:133` — Pass 1 system prompt

Replace:
```
3. Hook them instantly. The first sentence must present a jarring fact or cognitive dissonance.
```
With:
```
3. Hook them instantly. The first sentence must present a verbal, question-shaped or
   claim-shaped hook (e.g., "Here's why the 1987 crash almost repeated in 2008") —
   not just a visual/cognitive description. The hook should feel like it answers a
   question a viewer arrived with (YouTube Shorts search intent mode).
```

**Why:** YouTube Shorts viewers often arrive in search-intent mode wanting a question answered. Verbal/claim hooks like "here's why X is wrong" or "did you know X" currently outperform pure visual hooks.

---

## Change 2: Design for the loop

### 2a — Pass 2 loop instruction

**File:** `lib/topicGenerator.ts:253` — End of Pass 2 system prompt

Add:
```
LOOP DESIGN FOR REPLAY:
The final shot's closing phrase should echo the opening line's concept or question,
so that a replay feels deliberate rather than abrupt. If shot 1's hook is a question,
the last caption should resonate with it — not end on a definitive period that closes
the loop completely.
```

### 2b — Ken Burns loop engineering

**File:** `modal/render.py:411-413`

Replace:
```python
zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
scale_expr = "1.0" if i % 2 == 0 else "1.12"
```
With:
```python
if i == len(shots) - 1:
    zoom_expr = "zoom-0.0006"
    scale_expr = "1.12"
else:
    zoom_expr = "zoom+0.0006" if i % 2 == 0 else "zoom-0.0006"
    scale_expr = "1.0" if i % 2 == 0 else "1.12"
```

**Why:** Forces the last shot to zoom out to 1.0 (matching shot 1's starting zoom), so the cut back to shot 1 reads as seamless rather than jarring. Rewatches count as partial new views — this makes them feel intentional.

---

## Change 3: Runtime target — cap nearer 30-45s

### 3a — Shot count tuning

**File:** `lib/constants.ts:46-50`

Replace:
```typescript
export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 15, max: 18 },
  SLOW_BURN: { min: 12, max: 12 },
  THE_LIST: { min: 15, max: 15 },
};
```
With:
```typescript
export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 12, max: 15 },
  SLOW_BURN: { min: 12, max: 12 },
  THE_LIST: { min: 12, max: 14 },
};
```

### 3b — Narrative word limit

**File:** `lib/topicGenerator.ts:121`

Replace:
```
- ABSOLUTE MAXIMUM OF 125 WORDS.
- If you write 126 words, the video will exceed 60 seconds and fail completely.
```
With:
```
- TARGET 90-110 WORDS, ABSOLUTE MAX 120.
- At ~2.5 words/second (F5-TTS pace), 110 words ≈ 44s — ideal for the current
  30-45 second Shorts sweet spot. Videos approaching 60s need 2x the retention
  to clear the same ranking gate.
```

### 3c — BGM clamp

**File:** `lib/musicSelector.ts:129`

Replace:
```typescript
const duration = Math.max(30, Math.min(durationSeconds, 90));
```
With:
```typescript
const duration = Math.max(30, Math.min(durationSeconds, 60));
```

**Why:** Sub-30s Shorts can't clear the absolute watch-time bar even at 100% retention. 30-45s is the sweet spot; 60-90s needs proportionally higher retention. Tighter BGM clamp and shot counts bias toward the sweet spot.

---

## Change 4: Analytics feedback loop (epsilon-greedy bandit)

### 4a — New analytics function

**File:** `lib/analyticsSync.ts` — After `recordPublishedVideo` (line 416)

Add:
```typescript
export async function getRetentionByConfig(niche: string): Promise<Array<{
  aestheticId: string;
  format: string;
  avgViewDurationPct: number;
  sampleSize: number;
}>> {
  const result = await query(`
    SELECT aesthetic_id, format,
           AVG(avg_view_duration_pct) AS avg_duration,
           COUNT(*) AS sample_size
    FROM slideshow_topics
    WHERE niche = $1 AND aesthetic_id IS NOT NULL
      AND format IS NOT NULL AND views > 10
      AND avg_view_duration_pct > 0
    GROUP BY aesthetic_id, format
    ORDER BY avg_duration DESC
  `, [niche]);
  return result.rows.map(r => ({
    aestheticId: r.aesthetic_id,
    format: r.format,
    avgViewDurationPct: parseFloat(r.avg_duration),
    sampleSize: parseInt(r.sample_size, 10),
  }));
}
```

### 4b — Epsilon-greedy bandit

**File:** `lib/topicGenerator.ts:107-113`

Replace:
```typescript
export function pickFormatTemplate(niche: string): FormatTemplate {
  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST';
}
```
With:
```typescript
const EPSILON = 0.15;

export async function pickFormatTemplate(niche: string, aestheticId: string): Promise<FormatTemplate> {
  if (Math.random() < EPSILON) {
    const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3 };
    const rand = Math.random();
    if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
    if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
    return 'THE_LIST';
  }

  const retention = await getRetentionByConfig(niche);
  const best = retention.find(r => r.aestheticId === aestheticId && r.sampleSize >= 3);
  if (best) return best.format as FormatTemplate;

  const weights = FORMAT_TEMPLATE_WEIGHTS[niche] ?? { RAPID_FIRE: 0.4, SLOW_BURN: 0.3, THE_LIST: 0.3 };
  const rand = Math.random();
  if (rand < weights.RAPID_FIRE) return 'RAPID_FIRE';
  if (rand < weights.RAPID_FIRE + weights.SLOW_BURN) return 'SLOW_BURN';
  return 'THE_LIST';
}
```

### 4c — Update callers

**File:** `lib/topicGenerator.ts:340` and `inngest/pipeline.ts:87`

In `generateScript`:
```typescript
const formatTemplate = await pickFormatTemplate(niche, profile.aestheticId);
```

In `pipeline.ts`:
```typescript
const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
const format_template = await pickFormatTemplate(niche, profile.aestheticId);
```

**Why:** Closes the analytics loop. Rather than randomly picking format/aesthetic, exploits the highest-retention config 85% of the time, explores 15%. Same DB, same queries, just a weighted decision instead of flat random.

---

## Change 5: Search-optimized titles/descriptions

### 5a — Title prompt

**File:** `lib/topicGenerator.ts:239`

Replace:
```
"title": "5-100 chars, no period",
```
With:
```
"title": "5-100 chars, no period. Front-load the key claim or keyword in the first
~40 characters (mobile truncation point). Should read like a search snippet.",
```

### 5b — Description prompt

**File:** `lib/topicGenerator.ts:240`

Replace:
```
"description": "SEO-optimized 1-2 paragraph hook that grabs attention, summarizes what the viewer will learn, and includes relevant keywords for discoverability",
```
With:
```
"description": "SEO-optimized 1-2 paragraphs. FIRST SENTENCE must restate the core
fact in natural searchable language (this is what appears in Shorts search snippets).
Subsequent sentences summarize what the viewer learns. Include relevant keywords.",
```

**Why:** Shorts now show in a dedicated search carousel. Title keywords and description snippets matter more. No new API calls — just better-specified prompts on existing DeepSeek calls.

---

## Change 6: Reconsider blanket CTA ban

**File:** `lib/topicGenerator.ts:136`

Replace:
```
5. NO CTAs. No "subscribe", "like", or "thanks for watching".
```
With:
```
5. NO CTAs. No "subscribe", "like", or "thanks for watching".
   Exception: ending on a genuinely debatable claim (supported by research) is
   encouraged — it invites organic discussion in comments without an explicit CTA.
   Prefer this over an airtight, universally-agreed conclusion when the topic allows.
```

**Why:** Comments/shares now factor into ranking. Not breaking the no-CTA rule (literal "comment below" reads as cheap), but letting Pass 1 occasionally land on a debatable claim instead of an airtight closed one invites organic comment engagement.

---

## Change 7: Caption safe zones

**File:** `modal/render.py:257`

Replace:
```
Style: Default,...,80,80,1080,1
```
With:
```
Style: Default,...,120,120,1080,1
```

(Only `MarginL` and `MarginR` change: 80 → 120. The `MarginV=1080` and `Alignment=8` keep text vertically centered.)

**Why:** Moves captions 40px further from both edges to stay clear of Shorts' right-side (like/comment/share rail) and left-side (channel name/actions) chrome. Directly protects legibility/retention — zero render cost.

---

## Change 8: Thumbnail text selection

**File:** `inngest/pipeline.ts:220`

Replace:
```typescript
const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
```
With:
```typescript
const thumbText = script.hook_intro
  ? `${script.hook_intro.slice(0, 40)} — ${script.title}`
  : script.title;
const thumbBuffer = await generateThumbnail(thumbText, script.thumbnailPrompt, niche);
```

**Why:** `hook_intro` (the first ~4 words of shot 1's caption, already computed at `topicGenerator.ts:413`) is a stronger attention-grabber than the SEO-optimized title. Same FLUX call, same steps, just better-chosen input. `hook_intro` is already part of `SlideshowScript` (`lib/types.ts:23`).

---

## Execution order

| Step | Files | Changes | Dependencies |
|---|---|---|---|
| 1 | `lib/constants.ts` | 3a — Shot counts | None |
| 2 | `lib/topicGenerator.ts` | 1, 2a, 3b, 5, 6 — Prompt changes | None |
| 3 | `lib/topicGenerator.ts` | 4b, 4c — Async bandit + caller update | Step 4 (new query fn) can be done in parallel |
| 4 | `lib/analyticsSync.ts` | 4a — `getRetentionByConfig()` | None |
| 5 | `lib/musicSelector.ts` | 3c — BGM clamp | None |
| 6 | `modal/render.py` | 2b, 7 — Ken Burns loop + margins | None |
| 7 | `inngest/pipeline.ts` | 4d, 8 — Async caller + thumb text | Step 3 (async signature) |

Steps 1-6 are fully independent and can be done in parallel. Step 7 depends on step 3's async signature change.

---

## Verification

After all changes, run:

```bash
npm run build
```

And check for any TypeScript errors (especially around the `async` change to `pickFormatTemplate` and the new import from `analyticsSync.ts`).
