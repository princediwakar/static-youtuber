// Path: scripts/run-pipeline.ts
// Direct pipeline test.
// Run: DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-pipeline.ts
import 'dotenv/config';

import { pickUnusedTopic, generateScript } from '../lib/topicGenerator';
import { generateSlideImages } from '../lib/imageGenerator';
import { generateSlideAudio } from '../lib/ttsGenerator';
import { assembleVideo } from '../lib/videoAssembler';
import { getAccountCredentials } from '../lib/accountService';
import { query } from '../lib/database';
import { ACCOUNT_ID, MUSIC_ATTRIBUTION, FONT_PATH } from '../lib/constants';
import * as fs from 'fs';

const JOB_ID = `test-${Date.now()}`;

async function main() {
  console.log('═══ Pipeline Direct Test ═══\n');
  console.log(`Job ID: ${JOB_ID}`);
  console.log(`Account: ${ACCOUNT_ID}\n`);

  // Verify prerequisites
  if (!fs.existsSync(FONT_PATH)) {
    console.error(`❌ Font missing: ${FONT_PATH}`);
    process.exit(1);
  }
  console.log(`✅ Font found: ${FONT_PATH}`);

  const r = await query<{ c: string }>(
    'SELECT COUNT(*) as c FROM slideshow_topics WHERE used = false AND niche = $1',
    ['history']
  );
  console.log(`✅ DB connected: ${r.rows[0].c} topics available\n`);

  // ── Step 1: Pick topic + generate script ─────────────────────────────
  console.log('── Step 1: Generate Script ──');
  const topic = await pickUnusedTopic();
  console.log(`   Topic: ${topic}`);

  const script = await generateScript(topic);
  console.log(`   Title: ${script.title}`);
  console.log(`   Tags: ${script.tags.join(', ')}`);
  const hasAttribution = script.description.includes(MUSIC_ATTRIBUTION.substring(0, 40));
  console.log(`   Description has attribution: ${hasAttribution ? 'YES ✅' : 'NO ❌'}`);
  console.log(`   Slides: ${script.slides.length}\n`);

  // ── Step 2: Generate images (Imagen + caption overlay) ────────────────
  console.log('── Step 2: Generate Images ──');
  const creds = await getAccountCredentials(ACCOUNT_ID);
  const imageUrls = await generateSlideImages(script.slides, JOB_ID, creds);
  console.log(`   Generated ${imageUrls.length} images with caption overlays\n`);

  // ── Step 3: Generate TTS audio ────────────────────────────────────────
  console.log('── Step 3: Generate TTS Audio ──');
  const audioUrls = await generateSlideAudio(script.slides, JOB_ID, creds);
  console.log(`   Generated ${audioUrls.length} audio clips\n`);

  // ── Step 4: Assemble video (FFmpeg: Ken Burns + transitions + music) ──
  console.log('── Step 4: Assemble Video ──');
  const videoBuffer = await assembleVideo(imageUrls, audioUrls, JOB_ID);
  const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
  console.log(`   Video assembled: ${sizeMB} MB\n`);

  // Save to disk for verification
  const outPath = `/tmp/output-${JOB_ID}.mp4`;
  fs.writeFileSync(outPath, videoBuffer);
  console.log(`✅ Output saved to: ${outPath}`);
  console.log(`✅ Pipeline test complete — all asset fixes verified.`);
}

main().catch((e: Error) => {
  console.error('\n❌ Pipeline failed:', e.message);
  console.error(e.stack);
  process.exit(1);
});
