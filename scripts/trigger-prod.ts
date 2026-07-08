// scripts/trigger-prod.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function triggerPipeline() {
  // Import Inngest, creating a fresh client that ignores INNGEST_DEV
  delete process.env.INNGEST_DEV;
  const { Inngest } = await import('inngest');

  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) throw new Error('INNGEST_EVENT_KEY not set');

  const inngest = new Inngest({
    id: 'ai-slideshow',
    eventKey,
  });

  const args = process.argv.slice(2);
  const contentTypeIdx = args.indexOf('--contentType');
  const contentType = contentTypeIdx !== -1 ? args[contentTypeIdx + 1] : 'shorts';
  const accountIdArg = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--contentType');
  const accountId = accountIdArg || process.env.ACCOUNT_ID || 'tech_shots';
  const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';

  console.log(`Sending ${contentType} trigger to Inngest Cloud for account: ${accountId}…`);

  const result = await inngest.send({
    name: eventName,
    data: { accountId },
  });

  const triggerTime = new Date(Date.now() - 30000); // 30s buffer for clock drift

  console.log('✅ Trigger sent!');
  console.log('Event IDs:', result.ids);
  console.log('\nPolling production database for job completion (checks every 15s, max 45 min)...\n');

  // Poll the DB for the job to finish
  const { query } = await import('../lib/database');

  // Long-form can take ~30-45 mins. Poll up to 180 times (15s * 180 = 45 mins).
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 15_000));

    const res = await query<{ id: string; status: string; video_url: string | null }>(
      `SELECT id, status, video_url FROM slideshow_jobs
       WHERE account_id = $1 AND content_type = $2 AND created_at >= $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId, contentType, triggerTime]
    );

    if (res.rows.length === 0) {
      console.log(`  [${i + 1}] Waiting for job creation in prod...`);
      continue;
    }

    const job = res.rows[0];
    const status = job.status === 'published' ? '✅ published' :
                   job.status === 'failed' ? '❌ failed' :
                   job.status;

    if (job.video_url) {
      console.log(`\n🎬 Cloudinary URL: ${job.video_url}`);
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Status: ${status}`);

      // Optionally download locally
      const downloadPath = path.resolve(__dirname, '..', `output-${job.id}.mp4`);
      console.log(`\n📥 Downloading to ${downloadPath}...`);
      try {
        const response = await fetch(job.video_url);
        if (response.ok) {
          const fs = await import('fs');
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(downloadPath, buffer);
          console.log(`   Saved ${(buffer.length / 1024 / 1024).toFixed(1)} MB locally.`);
        } else {
          console.log(`   Download failed (HTTP ${response.status}). Use the Cloudinary URL above.`);
        }
      } catch (e: any) {
        console.log(`   Download failed: ${e.message}. Use the Cloudinary URL above.`);
      }
      return;
    }

    if (job.status === 'failed') {
      console.log(`\n❌ Job ${job.id} failed. Check Inngest dashboard or DB for error details.`);
      return;
    }

    process.stdout.write(`  [${i + 1}] Job ${job.id} → ${status}\r`);
  }

  console.log('\n⏰ Timed out waiting for job completion. Check Inngest Cloud dashboard.');
}

triggerPipeline().catch((err) => {
  console.error('Failed to trigger pipeline:', err);
  process.exit(1);
});
