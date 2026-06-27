// Smoke test for Microsoft Edge TTS (free, no API key)
// Usage: npx tsx scripts/test-edge-tts.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tts, getVoices } from 'edge-tts';

async function main() {
  console.log('Fetching voices...');
  const voices = await getVoices();
  const neural = voices.filter(v => v.Locale.startsWith('en-') && v.Name.includes('Neural'));
  console.log(`Found ${neural.length} English neural voices:\n`);
  for (const v of neural.slice(0, 8)) {
    console.log(`  ${v.ShortName.padEnd(30)} ${v.Gender.padEnd(8)} ${v.Locale}`);
  }

  console.log('\nGenerating TTS with en-US-AriaNeural...');
  const start = performance.now();

  const buffer = await tts(
    "Hello. This is a test of Microsoft Edge text to speech. It's completely free and needs no API key.",
    { voice: 'en-US-AriaNeural' },
  );

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s — ${(buffer.length / 1024).toFixed(1)} KB`);

  const outPath = path.join(import.meta.dirname, '..', 'test-edge-output.mp3');
  fs.writeFileSync(outPath, buffer);
  console.log(`Saved: ${outPath}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
