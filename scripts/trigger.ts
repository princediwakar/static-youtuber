// scripts/trigger.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// --- Local server management ---

const startedServers: ChildProcess[] = [];

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function waitForServer(url: string, name: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error(`${name} did not start within ${timeoutMs / 1000}s`);
}

async function ensureServer(
  port: number,
  command: string,
  args: string[],
  name: string,
  readyUrl: string,
  timeoutMs: number,
): Promise<void> {
  if (await isPortInUse(port)) {
    console.log(`  ✓ ${name} already running on port ${port}`);
    return;
  }

  const logDir = path.resolve(__dirname, '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const logPath = path.join(logDir, `${slug}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`--- ${name} started at ${new Date().toISOString()} ---\n`);

  console.log(`  ▶ Starting ${name} on port ${port}...`);
  console.log(`    Logs: ${logPath}`);

  const proc = spawn(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: path.resolve(__dirname, '..'),
  });

  proc.stdout.pipe(logStream);
  proc.stderr.pipe(logStream);

  return new Promise<void>((resolve, reject) => {
    proc.on('error', (err) => {
      logStream.write(`[SPAWN ERROR] ${err.message}\n`);
      logStream.end();
      reject(new Error(`Failed to start ${name}: ${err.message}`));
    });

    waitForServer(readyUrl, name, timeoutMs)
      .then(() => {
        startedServers.push(proc);
        console.log(`  ✓ ${name} ready`);
        resolve();
      })
      .catch((err) => {
        logStream.write(`[TIMEOUT] ${name} did not become ready\n`);
        logStream.end();
        try { proc.kill(); } catch {}
        reject(err);
      });
  });
}



function cleanup() {
  for (const proc of startedServers) {
    try { proc.kill(); } catch {}
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

// --- Status labels ---

const STATUS_LABELS: Record<string, string> = {
  pending:       '⏳ Waiting for pipeline to pick up the job...',
  script_ready:  '📝 Script generated — generating audio, images, music, and thumbnail in parallel...',
  generating:    '🔄 Generating assets...',
  images_done:   '🖼️ Images ready, waiting for audio...',
  tts_done:      '🔊 Audio ready, waiting for images...',
  assets_ready:  '🎨 All assets ready — rendering video via Modal (this may take a few minutes)...',
  assembled:     '🎬 Video assembled!',
  uploaded:      '☁️ Uploaded to Cloudinary...',
  published:     '✅ Published!',
  failed:        '❌ Failed',
};

function elapsed(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const min = Math.floor(secs / 60);
  const s = secs % 60;
  return min > 0 ? `+${min}m${s}s` : `+${s}s`;
}

// --- Pipeline trigger ---

async function triggerPipeline() {
  if (process.env.INNGEST_DEV === '1') {
    console.log('🔧 Local dev mode — ensuring servers are running...\n');

    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.INNGEST_BASE_URL = 'http://127.0.0.1:8288';
    process.env.INNGEST_EVENT_KEY = 'local';

    await ensureServer(
      3000, 'npm', ['run', 'dev'], 'Next.js dev server',
      'http://localhost:3000/api/inngest', 60000,
    );

    await ensureServer(
      8288, 'inngest', ['dev', '-u', 'http://localhost:3000/api/inngest'], 'Inngest dev server',
      'http://localhost:8288', 60000,
    );

    console.log('');
  }

  const { inngest } = await import('../inngest/client');

  const args = process.argv.slice(2);
  let contentType = 'shorts';
  let accountIdArg = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--contentType' && i + 1 < args.length) {
      contentType = args[++i];
    } else if (args[i] === '--accountId' && i + 1 < args.length) {
      accountIdArg = args[++i];
    } else if (!args[i].startsWith('--')) {
      accountIdArg = args[i];
    }
  }

  const accountId = accountIdArg || process.env.ACCOUNT_ID || 'canvas_center';
  const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';

  console.log(`🚀 Triggering ${contentType} pipeline for account: ${accountId}\n`);

  const startTime = Date.now();

  const { query } = await import('../lib/database');

  // Check the last job before we trigger so we know if Inngest will resume it or create a new one.
  const prevJobRes = await query<{ id: string, status: string }>(
    `SELECT id, status FROM slideshow_jobs WHERE account_id = $1 AND content_type = $2 ORDER BY created_at DESC LIMIT 1`,
    [accountId, contentType]
  );
  const previousJob = prevJobRes.rows[0];
  const isResuming = previousJob && !['published', 'failed'].includes(previousJob.status);

  if (isResuming) {
    console.log(`♻️ Found an incomplete previous job (${previousJob.id}). Inngest will resume it.`);
  }

  const result = await inngest.send({
    name: eventName,
    data: { accountId, skipPublish: true },
  });

  console.log('✅ Trigger sent!');
  console.log('   Event IDs:', result.ids);
  console.log('   Pipeline steps: script → audio + images + music + thumbnail → render → video');
  console.log('   Polling DB every 10s (max 10 min) — will show status transitions as they happen.\n');

  let prevStatus = '';
  const STEP_LINE =
    '   ─────────────────────────────────────────────────────────────────────';

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10_000));

    const res = await query<{
      id: string; status: string; video_url: string | null; error_message: string | null;
    }>(
      `SELECT id, status, video_url, error_message FROM slideshow_jobs
       WHERE account_id = $1 AND content_type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId, contentType]
    );

    const job = res.rows[0];

    // If we are expecting a completely new job, wait until the ID differs from the previous job.
    if (!job || (!isResuming && previousJob && job.id === previousJob.id)) {
      if (prevStatus !== '__nojob') {
        console.log(`  [${i + 1}] ⏳ No job found yet — pipeline may still be initializing...`);
        prevStatus = '__nojob';
      }
      continue;
    }

    // Status changed — log it prominently
    if (job.status !== prevStatus && prevStatus !== '') {
      const label = STATUS_LABELS[job.status] || `[${job.status}]`;
      const prevLabel = STATUS_LABELS[prevStatus] || `[${prevStatus}]`;
      console.log(`\n  ⬆ Status transition: ${prevLabel} → ${label}  (${elapsed(Date.now() - startTime)})`);
      console.log(`  ${STEP_LINE}`);
    }

    // First time seeing a job
    if (prevStatus === '') {
      const label = STATUS_LABELS[job.status] || `[${job.status}]`;
      console.log(`\n  📦 Job created: ${job.id}`);
      console.log(`  ${STEP_LINE}`);
      console.log(`  ${label}  (${elapsed(Date.now() - startTime)})`);
    }

    prevStatus = job.status;

    // Job failed — show error
    if (job.status === 'failed') {
      console.log(`\n  ❌ Job ${job.id} FAILED`);
      if (job.error_message) {
        console.log(`  Error: ${job.error_message}`);
      } else {
        console.log('  No error message stored. Check Inngest/Modal logs for details.');
      }
      return;
    }

    // Video ready — download it
    if (job.video_url) {
      console.log(`\n  🎬 Video URL: ${job.video_url}`);
      console.log(`  Status: ${STATUS_LABELS['assembled']}`);

      const downloadPath = path.resolve(__dirname, '..', `output-${job.id}.mp4`);
      console.log(`\n  📥 Downloading to ${downloadPath}...`);
      try {
        const response = await fetch(job.video_url);
        if (response.ok) {
          const fs = await import('fs');
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(downloadPath, buffer);
          console.log(`  ✅ Saved ${(buffer.length / 1024 / 1024).toFixed(1)} MB locally in ${elapsed(Date.now() - startTime)}`);
        } else {
          console.log(`  ⚠️  Download failed (HTTP ${response.status}). Use the URL above.`);
        }
      } catch (e: any) {
        console.log(`  ⚠️  Download failed: ${e.message}. Use the URL above.`);
      }
      return;
    }

    // Heartbeat every 3 iterations when status hasn't changed
    if (i % 3 === 2) {
      const label = STATUS_LABELS[job.status] || `[${job.status}]`;
      console.log(`  [${i + 1}] ${label}  (${elapsed(Date.now() - startTime)})`);
    }
  }

  console.log(`\n⏰ Timed out after 10 min. The pipeline may still be running — check Inngest or the DB.`);
}

triggerPipeline().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
