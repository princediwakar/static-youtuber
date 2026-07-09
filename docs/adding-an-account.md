# Adding a New YouTube Channel / Account

This document covers every file, table, config, and deployment step needed to add a new channel to the pipeline. Each section maps to exactly where changes are needed.

---

## 1. Architecture Overview

### Database tables

| Table | Purpose | Account scope |
|---|---|---|
| `accounts` | Encrypted credentials per channel (sibling project — not in this repo's schema) | Primary key = `id` (account_id string) |
| `slideshow_jobs` | Per-video pipeline state | `account_id TEXT NOT NULL` |
| `slideshow_topics` | Topic pool for script generation | `account_id TEXT NOT NULL`, unique per `(topic, account_id)` |
| `slideshow_uploads` | YouTube upload records | Referenced via `slideshow_jobs` |

### EncryptedAccountRow — `lib/accountService.ts:6-15`

All secrets are AES-256-GCM encrypted with `NEXTAUTH_SECRET` (scrypt-derived key). Format: `{ivHex}:{authTagHex}:{encryptedHex}`.

| Column | Decrypts to | Used by |
|---|---|---|
| `youtube_channel_id` | YouTube channel ID (plaintext) | `ACCOUNT_YOUTUBE_CHANNEL_ID` mapping |
| `google_client_id_encrypted` | OAuth client ID | `youtubeUpload.ts` + `analyticsSync.ts` |
| `google_client_secret_encrypted` | OAuth client secret | same |
| `refresh_token_encrypted` | OAuth refresh token | same |
| `cloudinary_cloud_name_encrypted` | Cloudinary cloud name | `cloudinary.ts` + Modal render.py |
| `cloudinary_api_key_encrypted` | Cloudinary API key | same |
| `cloudinary_api_secret_encrypted` | Cloudinary API secret | same |

### AccountCredentials — `lib/types.ts:53-62`

```typescript
export interface AccountCredentials {
  id: string;
  youtubeChannelId: string;
  googleClientId: string;
  googleClientSecret: string;
  refreshToken: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
}
```

---

## 2. Step-by-Step: Adding a New Account

### A. Pick a name and niche

- `accountId` — lowercase snake_case, e.g. `history_shots`
- Niche — either reuse an existing one from `NICHES` array, or create a new one

### B. Edit `lib/constants.ts`

Every map in this file must be updated:

```typescript
// line 6 — only if adding a NEW niche
export const NICHES = ['SaaS & AI Tools', 'Financial Forensics', 'Stoic Philosophy', 'Urban Survival', 'Your New Niche'];

// line 9 — REQUIRED
export const ACCOUNT_NICHE: Record<string, string> = {
  // ... existing ...
  history_shots: 'Your New Niche',
};

// line 17 — REQUIRED (YouTube channel ID, immutable)
export const ACCOUNT_YOUTUBE_CHANNEL_ID: Record<string, string> = {
  // ... existing ...
  history_shots: 'UCxxxxxxxxxxxxxxxxxxxxxxxxx',
};

// line 28 — only if a NEW niche
export const NICHE_PUBLISH_HOUR_UTC: Record<string, number> = {
  // ... existing ...
  'Your New Niche': 23,  // UTC hour for this niche's cron slot
};

// line 39 — only if a NEW niche
export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  // ... existing ...
  'Your New Niche': { RAPID_FIRE: 0.3, SLOW_BURN: 0.5, THE_LIST: 0.2 },
};

// line 246 — only if a NEW niche
export const NICHE_PROFILES: Record<string, NicheProfile> = {
  // ... existing ...
  'Your New Niche': {
    aestheticId: 'your-new-aesthetic',
    toneInstruction: `...`,
    minQualityScore: 6,
  },
};

// line 331 — only if a NEW aesthetic
export const AESTHETICS: Record<string, Aesthetic> = {
  // ... existing ...
  'your-new-aesthetic': {
    id: 'your-new-aesthetic',
    instruction: '...',
    imagePrefix: '...',
    thumbnailPrefix: '...',
  },
};

// line 179 — only if a NEW aesthetic
export const CAPTION_STYLES: Record<string, CaptionStyle> = {
  // ... existing ...
  'your-new-aesthetic': {
    fontFamily: 'Font Name',
    fontFile: 'FontName-Bold.ttf',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    accentColor: '#FF6600',
    maxCharsPerLine: 32,
    maxChars: 80,
  },
};
```

### C. Database — Insert into `accounts` table

The `accounts` table is managed by a sibling project. Insert a row directly:

```sql
INSERT INTO accounts (
  id, youtube_channel_id,
  google_client_id_encrypted, google_client_secret_encrypted, refresh_token_encrypted,
  cloudinary_cloud_name_encrypted, cloudinary_api_key_encrypted, cloudinary_api_secret_encrypted,
  status
) VALUES (
  'history_shots', 'UCxxxxxxxxxxxxxxxxxxxxxxxxx',
  '<encrypted>', '<encrypted>', '<encrypted>',
  '<encrypted>', '<encrypted>', '<encrypted>',
  'active'
);
```

**How to encrypt values:** Use the same AES-256-GCM scheme from `lib/accountService.ts:25-37`:

```typescript
import crypto from 'crypto';

function encrypt(plaintext: string): string {
  const key = crypto.createSecretKey(crypto.scryptSync(process.env.NEXTAUTH_SECRET!, 'salt', 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

### D. Seed Topics — `scripts/seed-data.ts`

Add an entry to the `SEEDS` array (line 6):

```typescript
['Your New Niche', 'history_shots', [
  { title: 'First topic', research_context: 'Ground truth details...' },
  // 15-20 hand-crafted topics
]],
```

Then seed them:

```bash
npx tsx scripts/seed-topics.ts
```

This runs `INSERT ... ON CONFLICT (topic, account_id) DO UPDATE` in `scripts/seed-topics.ts:26-36`.

### E. Modal Cloudinary Secret — `scripts/decrypt-and-upload-modal.ts`

Add the new account to two arrays (lines 33-38):

```typescript
const accountIds = ['canvas_center', 'canvas_area', 'canvas_base', 'canvas_station', 'history_shots'];
const suffixMap: Record<string, string> = {
  canvas_center: 'CANVAS_CENTER',
  canvas_area: 'CANVAS_AREA',
  canvas_base: 'CANVAS_BASE',
  canvas_station: 'CANVAS_STATION',
  history_shots: 'HISTORY_SHOTS',
};
```

Then run:

```bash
npx tsx scripts/decrypt-and-upload-modal.ts
```

This decrypts Cloudinary credentials from the DB and updates the Modal `cloudinary` secret with env vars like:

```
CLOUDINARY_CLOUD_NAME_CANVAS_CENTER=...
CLOUDINARY_API_KEY_CANVAS_CENTER=...
CLOUDINARY_API_SECRET_CANVAS_CENTER=...
```

Consumed in `modal/render.py:439-442`:

```python
env_suffix = account_id.upper().replace("-", "_")
cloud_name = os.environ.get(f"CLOUDINARY_CLOUD_NAME_{env_suffix}")
api_key = os.environ.get(f"CLOUDINARY_API_KEY_{env_suffix}")
api_secret = os.environ.get(f"CLOUDINARY_API_SECRET_{env_suffix}")
```

No code changes needed in `modal/render.py` — it handles any `account_id` value.

### F. Modal Fonts — `modal/render.py`

If you added a **new aesthetic with a new font**, add font download + fonttools instancing to the image build (lines 40-50):

```python
"curl -L -o /tmp/fontbuild/YourFont.ttf 'https://raw.githubusercontent.com/...'",
"fonttools varLib.instancer /tmp/fontbuild/YourFont.ttf wght=700 --update-name-table -o /usr/share/fonts/truetype/custom/YourFont-Bold.ttf",
```

The font family string in `CAPTION_STYLES` must match exactly what fonttools produces (check with `fc-list` after instancing).

### G. F5-TTS Voice (optional)

Upload a voice profile to the shared Modal volume:

```bash
modal volume put f5-tts-voices /path/to/voice.mp3 /history-shots-voice.mp3
```

Voice name selection happens in `lib/topicGenerator.ts:194-201` (system prompt lists available voices). This is a per-script choice by DeepSeek, not hardcoded per account.

`modal/tts.py` and `modal/bgm.py` are **account-agnostic** — no changes needed.

### H. Environment Variables

No per-account env vars are needed. All secrets live in:
- `accounts` DB table (Google OAuth + Cloudinary)
- Modal `cloudinary` secret (Cloudinary for render.py)

Optionally update the default `ACCOUNT_ID` in `.env.local` / `.env.production`:

```
ACCOUNT_ID=history_shots
```

---

## 3. How the Auto-Scheduler Works

`inngest/pipeline.ts:382-448` — `channelScheduler` function:

1. **Cron triggers** at UTC 15, 17, 19, 21 (lines 387-390)
2. Queries `SELECT id FROM accounts WHERE status = 'active'` (lines 399-403)
3. Maps each account to its niche via `ACCOUNT_NICHE` (line 403)
4. Filters to accounts whose `NICHE_PUBLISH_HOUR_UTC[niche] === currentHour` (line 406)
5. 24-hour throttle check per account (lines 417-427)
6. Sends `slideshow/trigger` event to Inngest (lines 430-433)

### Trigger scripts

| Script | Use | Publish? |
|---|---|---|
| `scripts/trigger.ts` | Local dev | No (`skipPublish: true`) |
| `scripts/trigger-prod.ts` | Production | Yes |
| `scripts/trigger-prod.ts history_shots` | Specific account | Yes |

### Pipeline flow — `inngest/pipeline.ts:34-379`

```
slideshow/trigger
  → Step 1: generateScript(niche, accountId) + createJob(account_id)
  → Step 2a: getAccountCredentials(accountId) → per-shot TTS + Cloudinary upload
  → Step 2b: getAccountCredentials(accountId) → images + BGM + thumbnail
  → Step 3: Modal render_video(accountId, ...assets)
  → Step 4: getAccountCredentials(accountId) → YouTube upload + update topic analytics
```

---

## 4. Deploy Checklist

In order:

```bash
# 1. Build + type-check
npm run build

# 2. Deploy Modal — only if fonts or render logic changed
python3 -m modal deploy modal/render.py

# 3. Deploy TTS — only if new voice added
python3 -m modal deploy modal/tts.py

# 4. Push Cloudinary creds to Modal secret
npx tsx scripts/decrypt-and-upload-modal.ts

# 5. Seed topics
npx tsx scripts/seed-topics.ts

# 6. Deploy to Vercel
git push  # or: npx vercel --prod
```

---

## 5. Verification

### Test pipeline end-to-end

```bash
npm run trigger:prod -- --accountId history_shots
```

### Monitor

| Where | What to check |
|---|---|
| **Inngest** (app.inngest.com) | `generate-short` function — each step's timing + logs |
| **Modal** (modal.com) | `slideshow-render` app logs — Whisper + FFmpeg output |
| **Vercel** (vercel.com) | API route logs — console.log from Inngest steps |
| **DB** (direct SQL) | `slideshow_jobs` rows for `history_shots` |

```bash
npx tsx -e "
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import pg from 'pg';
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const res = await pool.query('SELECT id, status, youtube_video_id, video_url, error_message FROM slideshow_jobs WHERE account_id = \$1 ORDER BY created_at DESC LIMIT 3', ['history_shots']);
  console.table(res.rows);
  await pool.end();
}
main().catch(e => { console.error(e.message); });
"
```

---

## 6. File Reference Summary

| File | Lines | What to change |
|---|---|---|
| `lib/constants.ts` | 6 | `NICHES` — add new niche if needed |
| `lib/constants.ts` | 9-14 | `ACCOUNT_NICHE` — map account_id → niche |
| `lib/constants.ts` | 17-22 | `ACCOUNT_YOUTUBE_CHANNEL_ID` — YouTube channel ID |
| `lib/constants.ts` | 28-33 | `NICHE_PUBLISH_HOUR_UTC` — schedule per niche |
| `lib/constants.ts` | 39-44 | `FORMAT_TEMPLATE_WEIGHTS` — format distribution per niche |
| `lib/constants.ts` | 246-303 | `NICHE_PROFILES` — aesthetic + tone per niche |
| `lib/constants.ts` | 179-225 | `CAPTION_STYLES` — font/color per aesthetic |
| `lib/constants.ts` | 331-356 | `AESTHETICS` — image prompt prefixes per aesthetic |
| `lib/accountService.ts` | 42-69 | `getAccountCredentials()` — reads from `accounts` table |
| `lib/types.ts` | 53-62 | `AccountCredentials` type |
| `lib/cloudinary.ts` | 6-12 | `initCloudinary()` — per-account via `AccountCredentials` |
| `lib/youtubeUpload.ts` | 12-22 | `buildOAuth2Client()` — per-account OAuth |
| `scripts/seed-data.ts` | 6 | `SEEDS` — add account's topics |
| `scripts/decrypt-and-upload-modal.ts` | 33-39 | Add to `accountIds` + `suffixMap` |
| `scripts/trigger-prod.ts` | 22 | Accepts accountId as CLI arg (no code change needed) |
| `inngest/pipeline.ts` | 384-448 | `channelScheduler` — auto discovers from `accounts` table (no code change) |
| `modal/render.py` | 40-50 | Font download/instancing — only if new aesthetic with new font |
| `modal/render.py` | 439-442 | Cloudinary suffix derivation (no code change needed) |
| `database/schema.sql` | 1-81 | Schema reference (no code change needed) |
| `.env.example` | 36 | `ACCOUNT_ID` default reference |
