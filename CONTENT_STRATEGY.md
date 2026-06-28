# Content Strategy

AI-powered YouTube Shorts pipeline. Four niches, four channels, fully automated script-to-publish.

---

## Niches

| Niche | Channel | Tone | Visual World |
|---|---|---|---|
| SaaS & AI Tools | tech_shots | Crisp, confident, instructive | `vector` |
| Financial Forensics | financial_forensics | Grave, investigative, forensically precise | `dossier` |
| Stoic Philosophy | stoic_philosophy | Deep, measured, unflinching | `dark-cinematic` |
| Urban Survival | urban_survival | Urgent, precise, operational | `tactical` |

---

## Format Templates

Three templates govern shot count, pacing, and narrative structure. Each niche has weighted probabilities.

### RAPID_FIRE (15–18 shots)

Dense, relentless facts. No transition words. Each shot is a self-contained fact bomb.

- Shots 1–3: Establish 3 separate dimensions.
- Every remaining shot: New escalating fact.
- Conclusion: Synthesizes cumulative weight into a single devastating statement.

**Niches:** SaaS (80%), Financial Forensics (80%), Stoic (0%), Urban (0%)

### SLOW_BURN (exactly 12 shots)

Atmospheric build. Tension over volume.

- Shots 1–3: Build ominous context. No facts yet — atmosphere and tension only.
- Shots 4–8: Escalate with hard facts, each more damning than the last.
- Shots 9–11: Connect facts to human cost or systemic failure.
- Shot 12: Unforgettable payoff that recontextualizes everything.

**Niches:** Stoic (70%), Urban (60%), Financial Forensics (20%), SaaS (0%)

### THE_LIST (exactly 15 shots)

Five numbered items, three visual angles each (5 × 3 = 15).

- Shot A: Key claim.
- Shot B: Visual dimension or consequence.
- Shot C: Actionable takeaway.
- Items build in intensity from surprising to devastating.
- Conclusion: Synthesizes all 5 items into a single organizing principle.

**Niches:** Urban (40%), Stoic (30%), SaaS (20%), Financial Forensics (0%)

---

## Hook Mechanics

Every script opens with **cognitive dissonance** — two facts that cannot logically coexist, forcing the viewer to resolve the tension by watching.

- Shot 1: Hook in ≤8 words. No punctuation at end.
- Shot 2: Quantifiable stakes. Why this matters, with numbers.
- `hook_intro`: Must be the exact first words of shot 1 `tts_text`. Validated by schema.

---

## Specificity Mandate

Every sentence must have an **anchor** — an exact number, date, name, location, or dollar amount.

**Banned words** (20+): many, several, huge, significant, unprecedented, shocking, game-changing, revolutionary, mind-blowing, insane, massive, enormous, incredible, amazing, devastating, catastrophic, astonishing, remarkable, unbelievable, staggering.

The system prompt enforces this with explicit prohibition. The quality gate scores `specificity` (must be ≥5, overall must be ≥7.0).

---

## Fact Verification

Every factual claim must appear in `fact_check_and_sources` as `{ claim, source }` with a verifiable source. Minimum 3 entries. Each claim ≥10 characters.

This is a **schema-level constraint** — scripts that fail this fail validation and retry.

---

## Natural Conclusion Rules

- `is_conclusion` must be `true` on exactly one shot — the last one.
- Last shot must end with `.` `!` or `?`.
- **Strictly banned in conclusions:** "thanks for watching", "subscribe", "like", "comment", "follow", "link in bio", "check the description", "share with", "drop a", "let me know", "what do you think", "sound off", "watch till the end", any CTA language.
- The story ends on its own terms. No begging.

---

## Visual Worlds

Every image prompt shares a unified aesthetic. Prompts use **comma-separated descriptive tags** (not narrative prose) because FLUX.1 interprets prompts literally.

Seven required tag categories per prompt: Subject, Environment, Lighting, Camera, Color Palette, Texture, Atmosphere.

### dossier (Financial Forensics)

Black and white photography, high contrast, film grain, declassified document aesthetic, dramatic shadows, chiaroscuro, vintage archival.

### vector (SaaS & AI Tools)

2D vector flat art, clean UI mockup, isometric perspective, bold limited color palette, geometric shapes, smooth matte finish.

### dark-cinematic (Stoic Philosophy)

Cinematic photography, dramatic chiaroscuro, marble statue texture, storm sky, solitary figure, desaturated deep blacks.

### tactical (Urban Survival)

Hyper-realistic tactical photography, matte black gear, dramatic practical lighting, shallow depth of field, moody urban environment.

---

## Tone Mandates (per Niche)

### SaaS & AI Tools

Crisp, confident, instructive — like a top-tier tech YouTuber. Zero fluff. Name exact software, exact metrics, exact use cases. Never "revolutionary" or "game-changing."

### Financial Forensics

Grave, investigative, forensically precise — like the journalist who broke Enron or FTX. Exact dollar amounts, dates, names, jurisdictions. Never "mind-blowing" or "insane."

### Stoic Philosophy

Deep, measured, unflinching — like a philosopher-warrior. Language of discipline, endurance, inner sovereignty. Never Instagram-quote motivational.

### Urban Survival

Urgent, precise, operational — like a special forces instructor. Name exact gear models, specs, timeframes. Never alarmist or conspiratorial.

---

## TTS Voices

| Niche | Edge TTS Voice | Character |
|---|---|---|
| SaaS & AI Tools | en-US-AriaNeural | Female, crisp tech reviewer |
| Financial Forensics | en-US-GuyNeural | Male, grave journalist |
| Stoic Philosophy | en-US-ChristopherNeural | Male, deep philosopher |
| Urban Survival | en-US-EricNeural | Male, tactical instructor |

### Audio Director Tags

Optional per-shot annotations that guide TTS delivery: `[serious]`, `[curious]`, `[urgent]`, `[measured]`, `[grave]`. Stripped before caption rendering.

---

## Caption System

### Constraints

- Max 3 rendering lines per shot.
- Max 80 characters total.
- Max 26 characters per word (longer words rejected).
- Target ≤12 words (warns at 13–14, rejects at 15+).
- Every shot must end with `.` `!` or `?`.
- No special characters that interfere with TTS.

### Kinetic Typography

Rendered directly onto images via `@napi-rs/canvas` with Montserrat Bold at 72px.

**Power word highlighting:** ~70 curated words get gold (`#FFD700`) highlighting at 1.3× scale with glow shadow. Additionally, any all-caps word ≥3 characters or any word containing digits gets the same treatment.

Text dynamically scales down if it exceeds a 960px safe zone (1080 − 120px margins).

---

## Quality Gate

Every generated script is scored by a second DeepSeek call across 7 dimensions (0–10):

| Dimension | Measures |
|---|---|
| `specificity` | Every sentence has an anchor |
| `hook_strength` | Cognitive dissonance in opening |
| `information_density` | Every shot delivers a new verifiable fact |
| `tone_calibration` | Perfectly calibrated to niche voice |
| `pacing` | Natural shot lengths, feels <60s |
| `visual_entropy` | Image prompts distinct enough to prevent visual fatigue |
| `visual_coherence` | Prompts form a unified visual world |

**Pass threshold:** Overall ≥7.0 AND no dimension <5. Max 2 retries. Uses temperature 0.2 for consistent scoring.

---

## Topic Strategy

### Seed Pool

80 hand-crafted topics (20 per niche) seeded from `scripts/seed-topics.ts`. Topics are hyper-specific, e.g.:

- SaaS: "How Make.com replaced 12 people and nobody got fired"
- Financial: "Two pizzas bought with Bitcoin now worth $680 million"
- Stoic: "Epictetus was a crippled slave who became Rome's greatest philosopher"
- Urban: "FEMA says 72 hours — every survival instructor stocks 14 days"

### Atomic Reservation

Topics are claimed with `FOR UPDATE SKIP LOCKED` to prevent concurrent pipeline runs from stealing the same topic. On pipeline failure, the topic is released back to the pool.

### Auto-Replenishment

When a niche exhausts its unused topics, DeepSeek generates 20 fresh ones at temperature 0.9. Previously used topics (last 50) are explicitly excluded from generation to prevent repeats.

---

## Publishing Cadence

One video per channel per day, staggered:

| Niche | UTC | EST |
|---|---|---|
| Financial Forensics | 15:00 | 11 AM |
| Stoic Philosophy | 17:00 | 1 PM |
| Urban Survival | 19:00 | 3 PM |
| SaaS & AI Tools | 21:00 | 5 PM |

---

## A/B Testing

Every job is randomly assigned variant `A` or `B` (50/50). Stored in `slideshow_uploads.variant` for later performance comparison against `aesthetic_id`, `format`, and `quality_score`.

---

## Analytics Feedback Loop

Daily sync from YouTube Analytics (OAuth) at 5:00 UTC. Metrics tracked per topic:

- Views, impressions, average view duration %
- Traffic source breakdown (search % vs feed %)
- Aggregate performance by aesthetic and format

This enables data-driven optimization — the system learns which visuals and formats perform best per niche over time.

---

## Music

Three background tracks, AI-selected per video by DeepSeek based on script title, niche, and visual world:

| Track | BPM | Energy | Character |
|---|---|---|---|
| focus-01.mp3 | 120 | 6 | Steady driving pulse, electronic, neutral |
| tension-01.mp3 | 90 | 7 | Slow-building tension, atmospheric drones |
| ambient-01.mp3 | 70 | 3 | Spacious ambient pads, contemplative |

Mixed with sidechain compression: music ducks when TTS speaks (threshold −28 dBFS, ratio 4:1, attack 5ms, release 50ms). Music volume: 0.35.

---

## Content Pipeline Steps

1. **Topic Reservation** — Atomic claim from pool, or generate 20 fresh topics via DeepSeek.
2. **Format Selection** — Weighted random pick per niche.
3. **Script Generation** — DeepSeek with 200+ line system prompt, Zod-validated output.
4. **Quality Gate** — Second DeepSeek call scores script; retries if below threshold.
5. **Image Generation** — Cloudflare Workers AI (FLUX.1 schnell), one per shot.
6. **TTS Generation** — Self-hosted Edge TTS on EC2, one audio clip per shot.
7. **Caption Burn** — Kinetic typography rendered onto images.
8. **Music Selection** — DeepSeek picks best track from catalog.
9. **Video Assembly** — FFmpeg with alternating Ken Burns zoom, hard cuts, sidechain audio mixing.
10. **Thumbnail** — Cloudflare AI image + SVG text overlay.
11. **YouTube Upload** — OAuth, with metadata from script.
12. **Analytics Sync** — Daily pull from YouTube Analytics.
