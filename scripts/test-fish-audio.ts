// Smoke test for Fish Audio TTS API
// Usage: npx tsx scripts/test-fish-audio.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnv() {
  const envPath = path.join(import.meta.dirname, '..', '.env.local');
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return env;
}

const FISH_API_BASE = 'https://api.fish.audio';

async function listVoices(apiKey: string) {
  console.log('=== Available voices (first 10) ===');
  const res = await fetch(`${FISH_API_BASE}/model?page_size=10&self=false`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  console.log(`Status: ${res.status}`);
  const json = await res.json();
  if (json.items) {
    for (const v of json.items) {
      console.log(`  ${v._id}  ${v.title}  (lang: ${v.language || '?'})`);
    }
    console.log(`  Total available: ${json.total}`);
  } else {
    console.log(JSON.stringify(json, null, 2).slice(0, 1000));
  }
  return json.items?.[0]?._id;
}

async function testTts(apiKey: string, referenceId: string) {
  console.log(`\n=== TTS test with reference_id: ${referenceId} ===`);
  const body = {
    text: 'Hello. This is a test of the Fish Audio text to speech API.',
    reference_id: referenceId,
    format: 'wav',
  };

  const start = performance.now();
  const res = await fetch(`${FISH_API_BASE}/v1/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: 's2.1-pro-free',
    },
    body: JSON.stringify(body),
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`Response: ${res.status} ${res.statusText} (${elapsed}s)`);

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Error body:', errorText.slice(0, 500));
    return false;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  console.log('Buffer size:', buffer.length, 'bytes');

  // WAV validation
  if (buffer.length < 44) {
    console.error('FAIL: buffer too small for WAV header (< 44 bytes)');
    return false;
  }

  const riffTag = buffer.slice(0, 4).toString();
  if (riffTag !== 'RIFF') {
    console.error(`FAIL: missing RIFF header — got "${riffTag}"`);
    return false;
  }

  const waveTag = buffer.slice(8, 12).toString();
  if (waveTag !== 'WAVE') {
    console.error(`FAIL: missing WAVE format tag — got "${waveTag}"`);
    return false;
  }

  const firstBytes = buffer.slice(0, 7).toString();
  if (firstBytes === '{"error' || buffer[0] === 0x7b) {
    const text = buffer.toString('utf-8').slice(0, 200);
    console.error(`FAIL: JSON error instead of WAV: ${text}`);
    return false;
  }

  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  const duration = (buffer.length - 44) / (sampleRate * channels * (bitsPerSample / 8));

  const outPath = path.join(import.meta.dirname, '..', 'test-fish-output.wav');
  fs.writeFileSync(outPath, buffer);

  console.log(`PASS: valid WAV — ${sampleRate}Hz, ${channels}ch, ${bitsPerSample}bit, ${duration.toFixed(1)}s`);
  console.log(`Saved: ${outPath}`);
  return true;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.FISH_API_KEY;

  if (!apiKey) {
    console.error('FISH_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('API key found — length:', apiKey.length, '\n');

  // Step 1: list voices
  const firstVoiceId = await listVoices(apiKey);

  if (!firstVoiceId) {
    console.error('\nNo voices found in account. Visit https://fish.audio/app/voices to create or clone one.');
    process.exit(1);
  }

  // Step 2: test TTS with first available voice
  const ok = await testTts(apiKey, firstVoiceId);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
