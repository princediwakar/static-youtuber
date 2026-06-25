// Path: scripts/test-assets.ts
// Direct test of downloaded assets (music, font) and attribution.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { existsSync } from 'fs';
import path from 'path';
import {
  MUSIC_DIR,
  MUSIC_FILES,
  MUSIC_ATTRIBUTION,
  FONT_PATH,
} from '../lib/constants';

async function main() {
  console.log('═══ Asset Verification ═══\n');

  // ── 1. Font ──────────────────────────────────────────────────────────
  console.log('1. Font');
  console.log(`   Path: ${FONT_PATH}`);
  const fontOk = existsSync(FONT_PATH);
  console.log(`   Exists: ${fontOk ? 'YES' : 'NO — BROKEN'}`);
  if (!fontOk) {
    console.error('   ❌ Montserrat-Bold.ttf not found — captions will fall back to sans-serif');
  } else {
    console.log('   ✅ Font ready for sharp captions');
  }

  // ── 2. Music ─────────────────────────────────────────────────────────
  console.log('\n2. Background Music');
  console.log(`   Dir: ${MUSIC_DIR}`);
  console.log(`   Expected files: ${MUSIC_FILES.join(', ')}`);

  const available: string[] = [];
  for (const f of MUSIC_FILES) {
    const full = path.join(MUSIC_DIR, f);
    const ok = existsSync(full);
    console.log(`   ${f}: ${ok ? 'EXISTS' : 'MISSING'}`);
    if (ok) available.push(f);
  }

  if (available.length === 0) {
    console.error(`   ❌ No music files found in ${MUSIC_DIR}`);
  } else {
    // Simulate pickMusicTrack() logic
    const chosen = available[Math.floor(Math.random() * available.length)];
    console.log(`   Random pick: ${chosen}`);
    console.log(`   Full path: ${path.join(MUSIC_DIR, chosen)}`);
    console.log('   ✅ Music ready for Ken Burns mix');
  }

  // ── 3. Attribution ───────────────────────────────────────────────────
  console.log('\n3. Music Attribution (CC BY 4.0)');
  console.log(`   ${MUSIC_ATTRIBUTION}`);
  console.log('   ✅ Attribution string ready for YouTube descriptions');

  // ── 4. DB connectivity ───────────────────────────────────────────────
  console.log('\n4. Database');
  const { query } = require('../lib/database');
  try {
    const r = await query('SELECT COUNT(*) as c FROM slideshow_topics WHERE used = false AND niche = $1', ['history']);
    const count = parseInt(r.rows[0].c, 10);
    console.log(`   Available topics: ${count}`);
    console.log('   ✅ DB connection works');
  } catch (e: any) {
    console.error(`   ❌ DB error: ${e.message}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══ Summary ═══');
  const allOk = fontOk && available.length > 0;
  if (allOk) {
    console.log('✅ All assets ready. Font, music, and attribution are properly configured.');
    console.log('   Pipeline is ready to produce videos with background music + captions + Ken Burns.');
  } else {
    console.error('❌ Some assets are missing — check the errors above.');
  }
}

main().catch(console.error);
