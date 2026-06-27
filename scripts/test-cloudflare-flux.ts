// Smoke test for Cloudflare Workers AI FLUX.1 [schnell]
// Usage: npx tsx scripts/test-cloudflare-flux.ts

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

async function main() {
  const env = loadEnv();
  const token = env.CLOUDFLARE_AI_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  if (!token || !accountId) {
    console.error('Missing CLOUDFLARE_AI_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in .env.local');
    process.exit(1);
  }

  console.log(`Account ID: ${accountId}  Token length: ${token.length}`);

  // FLUX keyword-dense prompt per the plan's new rules
  const prompt = [
    'solitary figure',
    'abandoned warehouse',
    'cold fluorescent overhead lighting',
    'wide 24mm shot',
    'concrete floor texture',
    'desaturated blue-grey palette',
    'volumetric light beams',
    'deep shadows',
  ].join(', ');

  const body = {
    prompt,
    width: 576,
    height: 1024,
    num_steps: 4,
  };

  console.log('Prompt:', prompt, '\n');
  console.log('Body:', JSON.stringify({ ...body, prompt: body.prompt.slice(0, 80) + '...' }), '\n');

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

  const start = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`Response: ${res.status} ${res.statusText} (${elapsed}s)`);

  const json = await res.json();

  if (!res.ok) {
    console.error('Error:', JSON.stringify(json, null, 2).slice(0, 1000));
    process.exit(1);
  }

  // CF AI returns { result: { image: "base64..." } }
  if (!json.result?.image) {
    console.error('No image in response:', JSON.stringify(json, null, 2).slice(0, 500));
    process.exit(1);
  }

  const buffer = Buffer.from(json.result.image, 'base64');

  // Detect image format from magic bytes (Cloudflare FLUX returns JPEG by default)
  const magicHex = buffer.slice(0, 4).toString('hex');
  let ext: string;
  let format: string;

  if (magicHex === '89504e47') {
    ext = 'png';
    format = 'PNG';
  } else if (magicHex === 'ffd8ffe0' || magicHex === 'ffd8ffe1' || magicHex.slice(0, 4) === 'ffd8') {
    ext = 'jpg';
    format = 'JPEG';
  } else {
    console.error(`FAIL: unknown image format — magic bytes: ${magicHex}`);
    process.exit(1);
  }

  const outPath = path.join(import.meta.dirname, '..', `test-flux-output.${ext}`);
  fs.writeFileSync(outPath, buffer);

  console.log(`PASS: valid ${format} — ${buffer.length} bytes, ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`Saved: ${outPath}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
