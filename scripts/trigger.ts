import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function triggerPipeline() {
  const { inngest } = await import('../inngest/client');
  const accountId = process.env.ACCOUNT_ID || 'tech_shots';

  console.log(`🚀 Triggering pipeline for account: ${accountId}\n`);

  const result = await inngest.send({
    name: 'slideshow/trigger',
    data: { accountId, skipPublish: true },
  });

  console.log('✅ Trigger sent!');
  console.log('Event IDs:', result.ids);
  console.log('\nPolling for job completion (checks every 10s, max 10 min)...\n');

  // Poll the DB for the job to finish
  const { query } = await import('../lib/database');

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10_000));

    const res = await query<{ id: string; status: string; video_url: string | null }>(
      `SELECT id, status, video_url FROM slideshow_jobs
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId]
    );

    if (res.rows.length === 0) {
      console.log(`  [${i + 1}] Waiting for job creation...`);
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

  console.log('\n⏰ Timed out waiting for job completion. Check Inngest dashboard.');
}

triggerPipeline().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
