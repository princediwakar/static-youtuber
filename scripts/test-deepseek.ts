// Smoke test for DeepSeek API
// Usage: npx tsx scripts/test-deepseek.ts

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

const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions';

async function callDeepSeek(
  apiKey: string,
  messages: { role: string; content: string }[],
  responseJson: boolean,
  label: string,
) {
  console.log(`\n=== ${label} ===`);
  const body: Record<string, unknown> = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.7,
  };
  if (responseJson) {
    body.response_format = { type: 'json_object' };
  }

  const start = performance.now();
  const res = await fetch(DEEPSEEK_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const json = await res.json();

  if (!res.ok) {
    console.error(`FAIL (${elapsed}s): ${res.status} —`, JSON.stringify(json, null, 2).slice(0, 500));
    return null;
  }

  const content = json.choices?.[0]?.message?.content;
  const usage = json.usage;
  console.log(`OK (${elapsed}s) — ${usage?.total_tokens} tokens (${usage?.prompt_tokens} in, ${usage?.completion_tokens} out)`);
  console.log('Response:', content.slice(0, 300));
  return content;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('API key found — length:', apiKey.length);

  // Test 1: Basic chat
  const basic = await callDeepSeek(apiKey, [
    { role: 'user', content: 'Say "DeepSeek API is working" and nothing else.' },
  ], false, 'Test 1: Basic chat');

  if (!basic) process.exit(1);

  // Test 2: JSON mode (crucial for script generation)
  const jsonResult = await callDeepSeek(apiKey, [
    { role: 'system', content: 'You are a JSON generator. Output ONLY valid JSON. No markdown.' },
    { role: 'user', content: 'Return a JSON object with fields: name (string), score (number 1-10). Topic: the moon landing.' },
  ], true, 'Test 2: JSON mode');

  if (!jsonResult) {
    console.error('\nJSON mode failed — this breaks script generation. Check prompt requirements.');
    process.exit(1);
  }

  // Verify it parses
  try {
    const parsed = JSON.parse(jsonResult.trim());
    console.log('Parsed OK:', JSON.stringify(parsed));
  } catch {
    console.error('FAIL: response is not valid JSON despite json_object mode');
    console.error('Raw:', jsonResult.slice(0, 400));
    process.exit(1);
  }

  // Test 3: JSON mode WITHOUT "JSON" in prompt (plan says this should 400)
  console.log('\n=== Test 3: JSON mode WITHOUT "JSON" keyword (expect 400) ===');
  const res = await fetch(DEEPSEEK_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Return a list of three colors.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });
  const errJson = await res.json();
  console.log(`Status: ${res.status} —`, JSON.stringify(errJson, null, 2).slice(0, 300));

  console.log('\n✅ All critical tests passed.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
