/**
 * scripts/debug-pipeline.ts
 *
 * End-to-end pipeline debugger.
 * Run: npx tsx scripts/debug-pipeline.ts
 *
 * Steps tested (in order):
 *   0. Env vars   — are all required vars present?
 *   1. DB         — can we read a stuck job and fetch account creds?
 *   2. LLM        — is the Modal LLM endpoint reachable?
 *   3. F5-TTS     — is the Modal TTS endpoint reachable?
 *   4. CF Images  — can we generate one image from Cloudflare AI?
 *   5. ACE-Step   — is the Modal BGM endpoint reachable?
 *   6. Cloudinary — can we upload a tiny test file for the account?
 *   7. Modal Render — is the render endpoint reachable (health ping)?
 *   8. YouTube    — are the account OAuth credentials still valid?
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import pg from 'pg';
import { getAccountCredentials } from '../lib/accountService';
import { generateImage } from '../lib/cloudflareAi';
import { generateShotSpeech } from '../lib/audioEngine';
import { selectMusicTrack } from '../lib/musicSelector';
import { uploadSlideImage } from '../lib/cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import {
  getModalLlmUrl,
  getF5TtsUrl,
  getAceStepBgmUrl,
  getModalRenderUrl,
} from '../lib/constants';
import { google } from 'googleapis';

// ── Helpers ────────────────────────────────────────────────────────────────────

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
const SKIP = '⏭  SKIP';
const INFO = '   ℹ️ ';

let stepNum = 0;
function header(title: string) {
  stepNum++;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`STEP ${stepNum}: ${title}`);
  console.log('─'.repeat(60));
}

function pass(msg: string) { console.log(`${PASS}  ${msg}`); }
function fail(msg: string) { console.log(`${FAIL}  ${msg}`); }
function info(msg: string) { console.log(`${INFO} ${msg}`); }
function skip(msg: string) { console.log(`${SKIP}  ${msg}`); }

async function ping(label: string, url: string, timeoutMs = 15_000): Promise<{ ok: boolean; status?: number; body?: string; ms: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body: body.slice(0, 300), ms: Date.now() - start };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, body: e?.message ?? String(e), ms: Date.now() - start };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 Pipeline End-to-End Debug');
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log(`   ENV file: .env.local\n`);

  const results: { step: string; ok: boolean; notes: string }[] = [];

  // ── STEP 0: Environment Variables ──────────────────────────────────────────
  header('Environment Variables');

  const required: Record<string, string | undefined> = {
    DATABASE_URL:            process.env.DATABASE_URL,
    NEXTAUTH_SECRET:         process.env.NEXTAUTH_SECRET,
    CLOUDFLARE_AI_API_TOKEN: process.env.CLOUDFLARE_AI_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID:   process.env.CLOUDFLARE_ACCOUNT_ID,
    MODAL_LLM_URL:           process.env.MODAL_LLM_URL,
    F5_TTS_URL:              process.env.F5_TTS_URL,
    ACE_STEP_BGM_URL:        process.env.ACE_STEP_BGM_URL,
    MODAL_RENDER_URL:        process.env.MODAL_RENDER_URL,
  };

  const optional: Record<string, string | undefined> = {
    F5_TTS_API_KEY:     process.env.F5_TTS_API_KEY,
    ACE_STEP_API_KEY:   process.env.ACE_STEP_API_KEY,
    CRON_SECRET:        process.env.CRON_SECRET,
    CF_AI_IMAGE_MODEL:  process.env.CF_AI_IMAGE_MODEL,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    INNGEST_EVENT_KEY:   process.env.INNGEST_EVENT_KEY,
  };

  let envOk = true;
  for (const [k, v] of Object.entries(required)) {
    if (!v) {
      fail(`${k} is MISSING`);
      envOk = false;
    } else if (v.includes('example-modal-url') || v.includes('placeholder')) {
      fail(`${k} looks like a placeholder: ${v.slice(0, 60)}`);
      envOk = false;
    } else {
      pass(`${k} = ${v.slice(0, 40)}...`);
    }
  }
  for (const [k, v] of Object.entries(optional)) {
    if (!v) skip(`${k} not set (optional)`);
    else     info(`${k} = ${v.slice(0, 40)}...`);
  }

  // Extra: MODAL_RENDER_URL must NOT be the example fallback
  const renderUrl = getModalRenderUrl();
  if (!renderUrl || renderUrl.includes('example-modal-url')) {
    fail(`MODAL_RENDER_URL resolves to the fallback placeholder: ${renderUrl}`);
    envOk = false;
  } else {
    pass(`MODAL_RENDER_URL resolves to: ${renderUrl.slice(0, 60)}...`);
  }

  results.push({ step: 'Env Vars', ok: envOk, notes: envOk ? 'All required vars present' : 'Missing or placeholder vars — pipeline WILL fail' });

  // ── STEP 1: Database + Stuck Jobs ──────────────────────────────────────────
  header('Database — Stuck Jobs & Account Credentials');

  let stuckJob: any = null;
  let dbOk = false;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  try {
    // Find most recent stuck job
    const res = await pool.query(
      `SELECT id, account_id, status, topic, created_at, updated_at 
       FROM slideshow_jobs 
       WHERE status = 'script_ready' 
       ORDER BY created_at DESC LIMIT 1`
    );

    if (res.rows.length === 0) {
      info('No script_ready jobs found — nothing stuck right now');
    } else {
      stuckJob = res.rows[0];
      info(`Most recent stuck job:`);
      info(`  id:          ${stuckJob.id}`);
      info(`  account_id:  ${stuckJob.account_id}`);
      info(`  topic:       ${stuckJob.topic}`);
      info(`  created_at:  ${stuckJob.created_at?.toISOString()}`);
      info(`  updated_at:  ${stuckJob.updated_at?.toISOString()}`);
      const ageHours = Math.round((Date.now() - stuckJob.updated_at.getTime()) / 3600_000);
      info(`  age since last update: ${ageHours}h`);

      if (ageHours > 1) {
        fail(`Job has been stuck for ${ageHours}h — Inngest function likely timed out or died silently`);
      } else {
        pass(`Job is recent — may still be in-flight`);
      }
    }

    // Check total job counts
    const counts = await pool.query(
      `SELECT status, COUNT(*) FROM slideshow_jobs GROUP BY status ORDER BY status`
    );
    info('\nAll job status counts:');
    for (const r of counts.rows) {
      info(`  ${r.status.padEnd(20)} ${r.count}`);
    }

    dbOk = true;
    pass('DB connection OK');
  } catch (e: any) {
    fail(`DB error: ${e.message}`);
    results.push({ step: 'Database', ok: false, notes: e.message });
    await pool.end();
    return;
  }

  // Try to fetch credentials for the stuck account (or canvas_station as default)
  const testAccount = stuckJob?.account_id ?? 'canvas_station';
  info(`\nFetching credentials for account: ${testAccount}`);
  let creds: any = null;
  try {
    creds = await getAccountCredentials(testAccount);
    pass(`Got credentials — cloudName: ${creds.cloudinaryCloudName}`);
    pass(`YouTube channel ID: ${creds.youtubeChannelId}`);
  } catch (e: any) {
    fail(`getAccountCredentials('${testAccount}') threw: ${e.message}`);
    dbOk = false;
  }

  results.push({ step: 'Database', ok: dbOk, notes: `testAccount=${testAccount}` });

  // ── STEP 2: Modal LLM ──────────────────────────────────────────────────────
  header('Modal LLM (Script Generation)');

  const llmUrl = getModalLlmUrl();
  info(`URL: ${llmUrl}`);

  try {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(llmUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "pong" only.' }],
        temperature: 0,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    const body = await res.text();
    if (res.ok) {
      pass(`LLM responded HTTP ${res.status} in ${ms}ms`);
      info(`Response preview: ${body.slice(0, 200)}`);
      results.push({ step: 'Modal LLM', ok: true, notes: `${ms}ms` });
    } else {
      fail(`LLM returned HTTP ${res.status} in ${ms}ms: ${body.slice(0, 300)}`);
      results.push({ step: 'Modal LLM', ok: false, notes: `HTTP ${res.status}: ${body.slice(0, 100)}` });
    }
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    fail(`LLM ${isTimeout ? 'TIMED OUT after 30s' : `threw: ${e.message}`}`);
    results.push({ step: 'Modal LLM', ok: false, notes: e.message });
  }

  // ── STEP 3: F5-TTS ─────────────────────────────────────────────────────────
  header('Modal F5-TTS (Narration)');

  const ttsUrl = getF5TtsUrl();
  info(`URL: ${ttsUrl}`);

  if (!ttsUrl) {
    fail('F5_TTS_URL is not set');
    results.push({ step: 'F5-TTS', ok: false, notes: 'URL not configured' });
  } else {
    try {
      const start = Date.now();
      const result = await generateShotSpeech('Hello. This is a pipeline health check.', 'jon-british-male', 0);
      const ms = Date.now() - start;
      pass(`TTS succeeded in ${ms}ms — ${result.audioBuffer.byteLength.toLocaleString()} bytes, ${result.durationMs}ms audio`);
      results.push({ step: 'F5-TTS', ok: true, notes: `${ms}ms, ${result.audioBuffer.byteLength} bytes` });
    } catch (e: any) {
      fail(`TTS threw: ${e.message}`);
      results.push({ step: 'F5-TTS', ok: false, notes: e.message });
    }
  }

  // ── STEP 4: Cloudflare AI Images ───────────────────────────────────────────
  header('Cloudflare AI (Image Generation)');

  const cfToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  info(`Account: ${cfAccount?.slice(0, 8)}...`);
  info(`Model: ${process.env.CF_AI_IMAGE_MODEL ?? '@cf/black-forest-labs/flux-1-schnell (default)'}`);

  if (!cfToken || !cfAccount) {
    fail('CLOUDFLARE_AI_API_TOKEN or CLOUDFLARE_ACCOUNT_ID missing');
    results.push({ step: 'CF Images', ok: false, notes: 'Missing credentials' });
  } else {
    try {
      const start = Date.now();
      const buf = await generateImage('A simple green circle on a white background', 256, 256);
      const ms = Date.now() - start;
      pass(`Image generated in ${ms}ms — ${buf.byteLength.toLocaleString()} bytes`);
      results.push({ step: 'CF Images', ok: true, notes: `${ms}ms, ${buf.byteLength} bytes` });
    } catch (e: any) {
      fail(`generateImage threw: ${e.message}`);
      results.push({ step: 'CF Images', ok: false, notes: e.message });
    }
  }

  // ── STEP 5: ACE-Step BGM ───────────────────────────────────────────────────
  header('Modal ACE-Step (Background Music)');

  const bgmUrl = getAceStepBgmUrl();
  info(`URL: ${bgmUrl}`);

  if (!bgmUrl || bgmUrl.includes('example-modal-url')) {
    fail('ACE_STEP_BGM_URL is not set or is a placeholder');
    results.push({ step: 'ACE-Step BGM', ok: false, notes: 'URL not configured' });
  } else {
    try {
      const start = Date.now();
      const result = await selectMusicTrack(
        'Debug Test Track',
        'YouTube Automation',
        'RAPID_FIRE',
        'learn-technical',
        'This is a test narration for the debug pipeline.',
        10
      );
      const ms = Date.now() - start;
      pass(`BGM generated in ${ms}ms — ${result.buffer.byteLength.toLocaleString()} bytes`);
      results.push({ step: 'ACE-Step BGM', ok: true, notes: `${ms}ms, ${result.buffer.byteLength} bytes` });
    } catch (e: any) {
      fail(`selectMusicTrack threw: ${e.message}`);
      results.push({ step: 'ACE-Step BGM', ok: false, notes: e.message });
    }
  }

  // ── STEP 6: Cloudinary Upload ──────────────────────────────────────────────
  header('Cloudinary (Asset Upload)');

  if (!creds) {
    skip('Skipping — no credentials loaded in Step 1');
    results.push({ step: 'Cloudinary', ok: false, notes: 'No credentials' });
  } else {
    try {
      // Upload a 1x1 white JPEG (minimal valid buffer)
      const minimalJpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
        'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
        'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
        'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
        'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oA' +
        'DAMBAAIRAxEAPwCwABmX/9k=',
        'base64'
      );
      const start = Date.now();
      const url = await uploadSlideImage(minimalJpeg, 'debug-test-job', 0, creds);
      const ms = Date.now() - start;
      pass(`Upload succeeded in ${ms}ms`);
      info(`URL: ${url}`);
      results.push({ step: 'Cloudinary', ok: true, notes: `${ms}ms → ${url.slice(0, 60)}` });
    } catch (e: any) {
      fail(`uploadSlideImage threw: ${e.message}`);
      results.push({ step: 'Cloudinary', ok: false, notes: e.message });
    }
  }

  // ── STEP 7: Modal Render Endpoint ──────────────────────────────────────────
  header('Modal Render Endpoint (Health Check)');

  const renderUrlFinal = getModalRenderUrl();
  info(`URL: ${renderUrlFinal}`);

  if (!renderUrlFinal || renderUrlFinal.includes('example-modal-url')) {
    fail('MODAL_RENDER_URL is the placeholder — render step WILL fail');
    results.push({ step: 'Modal Render', ok: false, notes: 'Placeholder URL' });
  } else {
    // Derive a health/root URL from the render URL
    // e.g. https://xx--slideshow-render-fastapi-app.modal.run/render → base
    let healthUrl: string;
    try {
      const u = new URL(renderUrlFinal);
      healthUrl = `${u.origin}/`;
    } catch {
      healthUrl = renderUrlFinal;
    }
    info(`Pinging: ${healthUrl}`);
    const { ok, status, body, ms } = await ping('render', healthUrl, 20_000);
    if (ok || (status && status < 500)) {
      pass(`Render endpoint reachable — HTTP ${status} in ${ms}ms`);
      info(`Body: ${body?.slice(0, 150)}`);
      results.push({ step: 'Modal Render', ok: true, notes: `HTTP ${status} in ${ms}ms` });
    } else {
      fail(`Render endpoint unreachable — ${status ? `HTTP ${status}` : 'no response'} in ${ms}ms: ${body}`);
      results.push({ step: 'Modal Render', ok: false, notes: `${status ?? 'no response'}: ${body?.slice(0, 100)}` });
    }
  }

  // ── STEP 8: YouTube OAuth ──────────────────────────────────────────────────
  header('YouTube OAuth (Token Validity)');

  if (!creds) {
    skip('Skipping — no credentials loaded in Step 1');
    results.push({ step: 'YouTube OAuth', ok: false, notes: 'No credentials' });
  } else {
    try {
      const oauth2Client = new google.auth.OAuth2(
        creds.googleClientId,
        creds.googleClientSecret,
      );
      oauth2Client.setCredentials({ refresh_token: creds.refreshToken });

      const start = Date.now();
      const tokenRes = await oauth2Client.getAccessToken();
      const ms = Date.now() - start;

      if (tokenRes.token) {
        pass(`Access token obtained in ${ms}ms (token starts with: ${tokenRes.token.slice(0, 20)}...)`);
        
        // Also do a quick channels.list call to confirm quota isn't exhausted
        const yt = google.youtube({ version: 'v3', auth: oauth2Client });
        const ch = await yt.channels.list({ part: ['snippet'], mine: true });
        const channel = ch.data.items?.[0];
        if (channel) {
          pass(`YouTube channel verified: "${channel.snippet?.title}" (${channel.id})`);
        } else {
          fail('channels.list returned no items — token may lack youtube scope');
        }
        results.push({ step: 'YouTube OAuth', ok: true, notes: `channel: ${channel?.snippet?.title}` });
      } else {
        fail('getAccessToken() returned no token');
        results.push({ step: 'YouTube OAuth', ok: false, notes: 'No token returned' });
      }
    } catch (e: any) {
      fail(`YouTube OAuth threw: ${e.message}`);
      results.push({ step: 'YouTube OAuth', ok: false, notes: e.message });
    }
  }

  // ── STEP 9: Inngest Connectivity ───────────────────────────────────────────
  header('Inngest (Event Key + Signing Key)');

  const inngestEventKey   = process.env.INNGEST_EVENT_KEY;
  const inngestSigningKey = process.env.INNGEST_SIGNING_KEY;

  if (!inngestEventKey) {
    fail('INNGEST_EVENT_KEY is not set — cron triggers cannot be sent');
    results.push({ step: 'Inngest', ok: false, notes: 'INNGEST_EVENT_KEY missing' });
  } else if (!inngestSigningKey) {
    fail('INNGEST_SIGNING_KEY is not set — Inngest cannot verify requests from Cloud');
    results.push({ step: 'Inngest', ok: false, notes: 'INNGEST_SIGNING_KEY missing' });
  } else {
    pass('INNGEST_EVENT_KEY is set');
    pass('INNGEST_SIGNING_KEY is set');
    results.push({ step: 'Inngest', ok: true, notes: 'Keys present' });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const passed  = results.filter(r => r.ok).length;
  const failed  = results.filter(r => !r.ok).length;

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon}  ${r.step.padEnd(20)} ${r.notes}`);
  }

  console.log(`\n${passed}/${results.length} checks passed`);
  if (failed > 0) {
    console.log(`\n⚠️  ${failed} check(s) FAILED — these are the root causes of stuck jobs.\n`);
  } else {
    console.log('\n🎉 All checks passed — check Inngest Cloud dashboard for function-level errors.\n');
  }

  await pool.end();
}

main().catch(e => {
  console.error('\n💥 Uncaught error in debug script:', e);
  process.exit(1);
});
