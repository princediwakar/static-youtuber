# Staggered Scheduling + Synthetic Label Randomization

**Date:** 2026-07-08

## Changes

### 1. Staggered Posting (no fixed schedule)

**Before:** Each channel had a hardcoded UTC hour. The `channelScheduler` only triggered a channel if the current cron tick matched its fixed slot (e.g., Stoic Philosophy always at 17:00 UTC).

**After:** At each of the 4 cron ticks (15, 17, 19, 21 UTC):
1. Shuffle all active channels randomly
2. Iterate in shuffled order — pick the first channel past its **16-hour cooldown**
3. Send the trigger immediately (no `step.sleep` — the shuffle + cooldown provides all the stagger needed)

Since both the slot assignment (which channel fires at which tick) and the cooldown status change daily, every channel posts at a different time each day without any fixed schedule.

### 2. Staggered Synthetic Content Label

**Before:** Every upload had `containsSyntheticMedia: true` and an AI disclosure line in the description.

**After:** A 50% coin flip per video determines both:
- `containsSyntheticMedia` flag on YouTube
- AI disclosure text in the description

The two are always in sync — if the video isn't labeled synthetic, the description won't mention it either.

### Files changed

| File | Change |
|---|---|
| `lib/constants.ts` | Removed `NICHE_PUBLISH_HOUR_UTC` |
| `inngest/pipeline.ts` | Rewrote `channelScheduler` — shuffle + 16h cooldown instead of fixed-hour filtering. Publish step now flips a coin for synthetic label. |
| `lib/youtubeUpload.ts` | `uploadToYouTube` accepts `labelAsSynthetic` param. Disclosure text in description matches the flag. |
