<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Operations

## Run pipeline (production)
```
npm run trigger:prod                          # default account (tech_shots)
npm run trigger:prod stoic_shots              # specific account
npm run trigger:prod -- --accountId stoic_shots
```

## Local dev trigger (skip publish)
```
npm run trigger
```

## Check logs

| Service | How |
|---|---|
| **Vercel** (CLI) | `npx vercel logs --environment production --limit 50 --expand` — shows API route calls and all `console.log` output from pipeline steps |
| **Vercel** (Web) | [vercel.com](https://vercel.com) → project logs → function invocations |
| **Inngest** (Web) | [app.inngest.com](https://app.inngest.com) → app `ai-slideshow`, function `generate-short` — step timing, retries, console.logs, errors |
| **Modal** (CLI) | `python3 -m modal app logs bgm-generator` — streams ACE-Step model loading and inference logs |
| **Modal** (CLI) | `python3 -m modal app logs slideshow-render` — streams Whisper transcription and FFmpeg render logs |
| **Modal** (Web) | [modal.com](https://modal.com) → apps `bgm-generator` / `slideshow-render` |
| **Database** | Direct SQL via `npx tsx -e "..."` — poll `slideshow_jobs` for status, errors, video URLs |

### Quick job status check
```bash
npx tsx -e "
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import pg from 'pg';
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const res = await pool.query('SELECT id, status, account_id, topic, youtube_video_id, error_message, video_url, created_at, updated_at FROM slideshow_jobs ORDER BY created_at DESC LIMIT 5');
  console.table(res.rows.map(r => ({ ...r, created_at: (r as any).created_at?.toISOString?.().slice(11,19), updated_at: (r as any).updated_at?.toISOString?.().slice(11,19) })));
  await pool.end();
}
main().catch(e => { console.error(e.message); });
"
```

### Get job details by account
```bash
npx tsx -e "
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const res = await pool.query('SELECT video_url, youtube_video_id FROM slideshow_jobs WHERE account_id = \$1 ORDER BY created_at DESC LIMIT 1', ['stoic_shots']);
const j = res.rows[0];
console.log('Cloudinary:', j.video_url);
console.log('YouTube: https://youtube.com/watch?v=' + j.youtube_video_id);
await pool.end();
"
```

## Deploy Modal functions
```
python3 -m modal deploy modal/bgm.py
python3 -m modal deploy modal/render.py
python3 -m modal deploy modal/tts.py
```

## Build
```
npm run build
```
