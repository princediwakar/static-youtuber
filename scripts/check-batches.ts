import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function checkBatch(name: string, label: string) {
  try {
    const job = await ai.batches.get({ name });
    console.log(`${label} (${name}): ${job.state}`);
    if (job.state === 'JOB_STATE_SUCCEEDED') {
      const count = job.dest?.inlinedResponses?.length || 0;
      console.log(`  -> ${count} responses ready`);
    }
  } catch (e: any) {
    console.log(`${label} (${name}): ERROR - ${e.message}`);
  }
}

async function main() {
  const { query } = await import('../lib/database');
  const res = await query(`SELECT id, topic, "imageBatchName", "audioBatchName", status FROM slideshow_jobs WHERE status = 'batch_pending' ORDER BY created_at DESC LIMIT 3`);

  for (const row of res.rows) {
    console.log(`\nJob: ${row.id.slice(0, 8)}... — ${row.topic}`);
    await checkBatch(row.imageBatchName, '  Images');
    await checkBatch(row.audioBatchName, '  Audio ');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
